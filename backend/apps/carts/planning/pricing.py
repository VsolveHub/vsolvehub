"""Costing one proposed alternative — or refusing it.

Takes a `ProposedAlternative` from `grouping`, lays its units out on the clock,
proves the whole shape can be staffed by *distinct* Partners, and turns it into
`PricedUnit`s: task subtotal, minimum-visit top-up, the allocated share of the
platform fee, and tax. An alternative that cannot be delivered comes back as
`None`, which is how the planner drops it.

Also holds the two derivations a persisted plan row is built from: the
`FulfilmentPlan.Structure` a proposal implies, and the pricing/cancellation policy
snapshot frozen into the plan set.

Where the boundary falls: this slice decides money and feasibility and writes
nothing — the transaction scripts in `commands` do the persisting.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta
from itertools import combinations
from uuid import UUID

from django.conf import settings

from apps.carts.models import FulfilmentPlan
from apps.locations.models import ServiceArea
from apps.locations.services import check_serviceability
from apps.pricing.models import CancellationPolicy, PricingPolicy

from .base import PricedUnit, ProposedAlternative, UnitInput, _eligible_partner_ids


def _time_ranges_overlap(left: tuple[datetime, datetime], right: tuple[datetime, datetime]) -> bool:
    return left[0] < right[1] and right[0] < left[1]


def _has_cross_visit_conflict(unit_inputs: list[UnitInput]) -> bool:
    """True when no assignment of distinct Partners can cover every unit (spec §9).

    Partners are single-threaded, so two visits at overlapping times can never
    share one — every group of units that are *pairwise* overlapping (a clique in
    the interval-overlap graph) needs at least as many eligible Partners between
    them as units in the group (Hall's marriage theorem). Restricting the search
    to cliques rather than every subset is exact here, because time overlap is an
    interval constraint: two units that do not themselves overlap never need
    distinct Partners just because a third unit overlaps both of them.

    A plain brute-force scan over cliques rather than a matching library, because
    `M1_FULFILMENT_UNIT_LIMIT` bounds this at a handful of units per cart.
    """

    # Widened by the turnaround buffer, because what a Partner is *occupied* for is
    # the visit plus travel — `_eligible_partner_ids` above, `accept_unit_offer` and
    # `directly_assign` in `assignments.group_services`, and the `Reservation`
    # exclusion constraint itself all use this same widened range. Comparing bare
    # durations here let two exactly back-to-back visits (5:00-5:40 and 5:40-6:40)
    # read as non-overlapping, so the plan passed and the reservation then collided
    # at accept time behind a misleading "another professional has accepted".
    ranges = [
        (starts_at, starts_at + timedelta(minutes=duration + settings.M1_TURNAROUND_MINUTES))
        for _, starts_at, duration, *_ in unit_inputs
    ]
    eligible = [entry[5] for entry in unit_inputs]
    indices = range(len(unit_inputs))
    for size in range(2, len(unit_inputs) + 1):
        for subset in combinations(indices, size):
            if not all(
                _time_ranges_overlap(ranges[left], ranges[right])
                for left, right in combinations(subset, 2)
            ):
                continue
            union: set[UUID] = set()
            for index in subset:
                union.update(eligible[index])
            if len(union) < size:
                return True
    return False


def _allocate(total: int, weights: tuple[int, ...]) -> tuple[int, ...]:
    denominator = sum(weights)
    if total == 0:
        return tuple(0 for _weight in weights)
    if denominator <= 0:
        raise ValueError("Money allocation requires a positive service subtotal.")
    allocations = [total * weight // denominator for weight in weights]
    # Only a unit that contributed to the basis can absorb a rounding paise. Handing one
    # to a zero-subtotal unit puts a charge on a line the Customer was never quoted, and
    # is the same defect that made `_allocate_exact` tax a ₹0 invoice line.
    carriers = [index for index, weight in enumerate(weights) if weight > 0]
    for position in range(total - sum(allocations)):
        allocations[carriers[position % len(carriers)]] += 1
    return tuple(allocations)


def _unit_schedule(
    proposal: ProposedAlternative,
    *,
    starts_by_item: Mapping[UUID, datetime],
) -> tuple[datetime, ...]:
    """When each unit of this alternative starts.

    Every unit is anchored to the start the Customer chose for **its own**
    scheduling group. That is the whole point of per-visit scheduling: an
    electrician on Monday and a salon appointment on Friday must not be derived
    from one clock.

    Within a single scheduling group the old cascade is preserved. An alternative
    may split one group into several units — "two professionals instead of one" —
    and those still have to run back-to-back rather than on top of each other,
    because the group is work one Partner was expected to do in sequence and may
    carry an ordering dependency. Cursors are therefore kept *per anchor*: units
    sharing a chosen start queue behind each other, units with different chosen
    starts do not interact at all.
    """
    if proposal.simultaneous:
        return tuple(starts_by_item[group[0].item.id] for group in proposal.groups)
    cursors: dict[datetime, datetime] = {}
    starts: list[datetime] = []
    for group in proposal.groups:
        anchor = starts_by_item[group[0].item.id]
        cursor = cursors.get(anchor, anchor)
        starts.append(cursor)
        cursors[anchor] = cursor + timedelta(minutes=sum(item.duration_minutes for item in group))
    return tuple(starts)


def _price_alternative(
    proposal: ProposedAlternative,
    *,
    area: ServiceArea,
    postal_code: str,
    starts_by_item: Mapping[UUID, datetime],
    policy: PricingPolicy,
) -> tuple[PricedUnit, ...] | None:
    starts = _unit_schedule(proposal, starts_by_item=starts_by_item)
    unit_inputs: list[UnitInput] = []
    for group, starts_at in zip(proposal.groups, starts, strict=True):
        duration = sum(item.duration_minutes for item in group)
        for item in group:
            serviceability = check_serviceability(
                postal_code=postal_code,
                variant_id=item.item.variant_id,
                requested_start=starts_at,
                duration_minutes=duration,
            )
            if (
                not serviceability.is_serviceable
                or serviceability.service_area is None
                or serviceability.service_area.id != area.id
            ):
                return None
        eligible = _eligible_partner_ids(
            items=group,
            area=area,
            starts_at=starts_at,
            duration_minutes=duration,
        )
        if not eligible:
            return None
        task_subtotal = sum(item.subtotal_paise for item in group)
        minimum_adjustment = max(0, policy.minimum_service_subtotal_paise - task_subtotal)
        unit_inputs.append(
            (group, starts_at, duration, task_subtotal, minimum_adjustment, eligible)
        )
    if _has_cross_visit_conflict(unit_inputs):
        return None
    service_totals = tuple(entry[3] + entry[4] for entry in unit_inputs)
    service_total = sum(service_totals)
    fee = (
        policy.platform_fee_value
        if policy.platform_fee_mode == PricingPolicy.PlatformFeeMode.FIXED
        else service_total * policy.platform_fee_value // 10_000
    )
    allocations = _allocate(fee, service_totals)
    priced: list[PricedUnit] = []
    for position, (entry, allocation) in enumerate(
        zip(unit_inputs, allocations, strict=True),
        start=1,
    ):
        group, starts_at, duration, task_subtotal, minimum_adjustment, eligible = entry
        total = task_subtotal + minimum_adjustment + allocation
        tax = (
            total * policy.gst_rate_basis_points + (10_000 + policy.gst_rate_basis_points) // 2
        ) // (10_000 + policy.gst_rate_basis_points)
        priced.append(
            PricedUnit(
                items=group,
                starts_at=starts_at,
                duration_minutes=duration,
                task_subtotal_paise=task_subtotal,
                minimum_adjustment_paise=minimum_adjustment,
                platform_fee_allocation_paise=allocation,
                tax_paise=tax,
                total_paise=total,
                eligible_partner_ids=eligible,
                reason_codes=(f"unit_{position}", *proposal.reasons),
            )
        )
    return tuple(priced)


def _structure_for(
    proposal: ProposedAlternative,
) -> str:
    if len(proposal.groups) == 1:
        return FulfilmentPlan.Structure.SINGLE_PARTNER_SEQUENTIAL
    if proposal.simultaneous:
        return FulfilmentPlan.Structure.COORDINATED_PARALLEL
    if any(len(group) > 1 for group in proposal.groups):
        return FulfilmentPlan.Structure.MIXED
    return FulfilmentPlan.Structure.INDEPENDENT_VISITS


def _policy_snapshot(
    *,
    pricing: PricingPolicy,
    cancellation: CancellationPolicy,
) -> dict[str, object]:
    return {
        "pricing": {
            "id": str(pricing.id),
            "code": pricing.code,
            "version": pricing.version,
            "minimum_service_subtotal_paise": pricing.minimum_service_subtotal_paise,
            "gst_rate_basis_points": pricing.gst_rate_basis_points,
            "platform_fee_mode": pricing.platform_fee_mode,
            "platform_fee_value": pricing.platform_fee_value,
            "commission_basis_points": pricing.commission_basis_points,
            "commission_floor_paise": pricing.commission_floor_paise,
            "commission_cap_paise": pricing.commission_cap_paise,
        },
        "cancellation": {
            "id": str(cancellation.id),
            "code": cancellation.code,
            "version": cancellation.version,
            "bands": [
                {
                    "code": band.code,
                    "condition_text": band.condition_text,
                    "fee_paise": band.fee_paise,
                }
                for band in cancellation.bands.all()
            ],
        },
    }
