"""Deterministic multi-item fulfilment planning and immutable group quote commands."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations
from typing import Any, cast
from uuid import UUID

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.carts.exceptions import (
    FulfilmentPlanStaleApiError,
    FulfilmentPlanUnavailableApiError,
)
from apps.carts.models import (
    Cart,
    CartItem,
    FulfilmentPlan,
    FulfilmentPlanSet,
    PlanUnit,
    PlanUnitItem,
    Quote,
    QuoteLine,
    QuoteUnit,
    ServiceCompatibilityRule,
)
from apps.carts.services import _assert_window_time_is_current, _current_item_inputs
from apps.catalog.models import A1VariantConfiguration
from apps.identity.models import User
from apps.locations.models import Address, ServiceArea
from apps.locations.services import check_serviceability
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.partners.selectors import partner_available_during
from apps.pricing.models import CancellationPolicy, PricingPolicy, TaskRate
from apps.pricing.selectors import current_cancellation_policy, current_pricing_policy

MIN_PARALLEL_UNITS = 2
UnitInput = tuple[tuple["PlanningItem", ...], datetime, int, int, int, tuple[UUID, ...]]


@dataclass(frozen=True, slots=True)
class PlanningItem:
    item: CartItem
    configuration: A1VariantConfiguration
    rate: TaskRate
    scope: dict[str, object]
    duration_minutes: int

    @property
    def subtotal_paise(self) -> int:
        return self.rate.unit_price_paise * self.item.quantity


@dataclass(frozen=True, slots=True)
class ProposedAlternative:
    groups: tuple[tuple[PlanningItem, ...], ...]
    simultaneous: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PricedUnit:
    items: tuple[PlanningItem, ...]
    starts_at: datetime
    duration_minutes: int
    task_subtotal_paise: int
    minimum_adjustment_paise: int
    platform_fee_allocation_paise: int
    tax_paise: int
    total_paise: int
    eligible_partner_ids: tuple[UUID, ...]
    reason_codes: tuple[str, ...]


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _fingerprint(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode()).hexdigest()


def _planning_items(cart: Cart) -> tuple[PlanningItem, ...]:
    items = list(
        CartItem.objects.filter(cart=cart, removed_at__isnull=True)
        .select_related("variant__service", "task_rate", "configuration")
        .prefetch_related("scope_values")
        .order_by("created_at", "id")
    )
    if not items:
        raise ValueError("Add at least one service request before planning fulfilment.")
    if len(items) > settings.M1_CART_ITEM_LIMIT:
        raise ValueError("The active cart exceeds the configured planning limit.")
    result: list[PlanningItem] = []
    for item in items:
        configuration, rate, scope, duration = _current_item_inputs(item)
        result.append(
            PlanningItem(
                item=item,
                configuration=configuration,
                rate=rate,
                scope=scope,
                duration_minutes=duration,
            )
        )
    return tuple(result)


def _current_rules(
    items: tuple[PlanningItem, ...],
    *,
    at: datetime,
) -> dict[frozenset[UUID], ServiceCompatibilityRule]:
    variant_ids = {entry.item.variant_id for entry in items}
    rules = ServiceCompatibilityRule.objects.filter(
        left_variant_id__in=variant_ids,
        right_variant_id__in=variant_ids,
        is_active=True,
        effective_from__lte=at,
    ).filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=at))
    return {frozenset((rule.left_variant_id, rule.right_variant_id)): rule for rule in rules}


def _rule_for(
    left: PlanningItem,
    right: PlanningItem,
    rules: dict[frozenset[UUID], ServiceCompatibilityRule],
) -> ServiceCompatibilityRule | None:
    if left.item.variant_id == right.item.variant_id:
        return None
    return rules.get(frozenset((left.item.variant_id, right.item.variant_id)))


def _eligible_partner_ids(
    *,
    items: tuple[PlanningItem, ...],
    area: ServiceArea,
    starts_at: datetime,
    duration_minutes: int,
) -> tuple[UUID, ...]:
    candidates = PartnerProfile.objects.filter(
        application__status=PartnerApplication.Status.APPROVED,
        service_area_links__service_area=area,
        service_area_links__is_active=True,
    )
    for entry in items:
        candidates = candidates.filter(
            service_links__variant=entry.item.variant,
            service_links__is_active=True,
        )
    occupied_range = Range(
        starts_at,
        starts_at + timedelta(minutes=duration_minutes),
        "[)",
    )
    reserved_partner_ids = set(
        Reservation.objects.filter(
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
            occupied_range__overlap=occupied_range,
        ).values_list("partner_id", flat=True)
    )
    available = [
        partner.id
        for partner in candidates.distinct().order_by("id")
        if partner.id not in reserved_partner_ids
        if partner_available_during(
            partner=partner,
            service_area=area,
            starts_at=starts_at,
            duration_minutes=duration_minutes,
        )
    ]
    return tuple(available)


def _all_pairs_have_mode(
    items: tuple[PlanningItem, ...],
    *,
    rules: dict[frozenset[UUID], ServiceCompatibilityRule],
    mode: str,
) -> bool:
    return all(
        (
            left.item.variant_id == right.item.variant_id
            and mode == ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL
        )
        or ((rule := _rule_for(left, right, rules)) is not None and rule.mode == mode)
        for left, right in combinations(items, 2)
    )


def _order_items_by_dependencies(
    items: tuple[PlanningItem, ...],
    *,
    rules: dict[frozenset[UUID], ServiceCompatibilityRule],
) -> tuple[PlanningItem, ...]:
    by_id = {item.item.id: item for item in items}
    original_order = {item.item.id: position for position, item in enumerate(items)}
    outgoing: dict[UUID, set[UUID]] = {item.item.id: set() for item in items}
    incoming_count: dict[UUID, int] = {item.item.id: 0 for item in items}
    for left, right in combinations(items, 2):
        rule = _rule_for(left, right, rules)
        if rule is None or rule.dependency == ServiceCompatibilityRule.Dependency.NONE:
            continue
        rule_left = left if left.item.variant_id == rule.left_variant_id else right
        rule_right = right if rule_left is left else left
        predecessor, successor = (
            (rule_left, rule_right)
            if rule.dependency == ServiceCompatibilityRule.Dependency.LEFT_BEFORE_RIGHT
            else (rule_right, rule_left)
        )
        if successor.item.id not in outgoing[predecessor.item.id]:
            outgoing[predecessor.item.id].add(successor.item.id)
            incoming_count[successor.item.id] += 1
    ready = sorted(
        (item_id for item_id, count in incoming_count.items() if count == 0),
        key=original_order.__getitem__,
    )
    ordered_ids: list[UUID] = []
    while ready:
        item_id = ready.pop(0)
        ordered_ids.append(item_id)
        for successor_id in sorted(outgoing[item_id], key=original_order.__getitem__):
            incoming_count[successor_id] -= 1
            if incoming_count[successor_id] == 0:
                ready.append(successor_id)
                ready.sort(key=original_order.__getitem__)
    if len(ordered_ids) != len(items):
        raise ValueError("The configured service dependency graph contains a cycle.")
    return tuple(by_id[item_id] for item_id in ordered_ids)


def _build_sequential_groups(
    items: tuple[PlanningItem, ...],
    *,
    rules: dict[frozenset[UUID], ServiceCompatibilityRule],
    area: ServiceArea,
    starts_at: datetime,
) -> tuple[tuple[PlanningItem, ...], ...]:
    groups: list[tuple[PlanningItem, ...]] = []
    for item in items:
        placed = False
        for index, existing in enumerate(groups):
            candidate = (*existing, item)
            duration = sum(entry.duration_minutes for entry in candidate)
            if (
                duration <= settings.M1_SEQUENTIAL_UNIT_MAX_MINUTES
                and _all_pairs_have_mode(
                    candidate,
                    rules=rules,
                    mode=ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL,
                )
                and _eligible_partner_ids(
                    items=candidate,
                    area=area,
                    starts_at=starts_at,
                    duration_minutes=duration,
                )
            ):
                groups[index] = candidate
                placed = True
                break
        if not placed:
            groups.append((item,))
    return tuple(groups)


def _groups_can_run_in_parallel(
    groups: tuple[tuple[PlanningItem, ...], ...],
    *,
    rules: dict[frozenset[UUID], ServiceCompatibilityRule],
) -> bool:
    if len(groups) < MIN_PARALLEL_UNITS or len(groups) > settings.M1_CONCURRENT_PARTNER_LIMIT:
        return False
    return all(
        (rule := _rule_for(left, right, rules)) is not None
        and rule.mode == ServiceCompatibilityRule.Mode.PARALLEL_ALLOWED
        and rule.dependency == ServiceCompatibilityRule.Dependency.NONE
        for left_group, right_group in combinations(groups, 2)
        for left in left_group
        for right in right_group
    )


def _has_distinct_capacity(candidate_sets: tuple[tuple[UUID, ...], ...]) -> bool:
    def assign(index: int, used: frozenset[UUID]) -> bool:
        if index == len(candidate_sets):
            return True
        return any(
            candidate not in used and assign(index + 1, used | {candidate})
            for candidate in candidate_sets[index]
        )

    return assign(0, frozenset())


def _candidate_alternatives(
    *,
    items: tuple[PlanningItem, ...],
    rules: dict[frozenset[UUID], ServiceCompatibilityRule],
    area: ServiceArea,
    preferred_start: datetime,
) -> tuple[ProposedAlternative, ...]:
    items = _order_items_by_dependencies(items, rules=rules)
    grouped = _build_sequential_groups(
        items,
        rules=rules,
        area=area,
        starts_at=preferred_start,
    )
    proposals: list[ProposedAlternative] = []
    if len(grouped) == 1:
        proposals.append(
            ProposedAlternative(grouped, False, ("compatible_same_partner_sequential",))
        )
    elif _groups_can_run_in_parallel(grouped, rules=rules):
        proposals.append(ProposedAlternative(grouped, True, ("explicit_parallel_compatibility",)))
    elif any(len(group) > 1 for group in grouped):
        proposals.append(
            ProposedAlternative(grouped, False, ("compatible_lines_grouped", "visits_separated"))
        )

    independent = tuple((item,) for item in items)
    if not proposals or proposals[0].groups != independent or proposals[0].simultaneous:
        proposals.append(
            ProposedAlternative(
                independent,
                False,
                ("independent_visits_safe_default",),
            )
        )
    return tuple(proposals[: settings.M1_FULFILMENT_PLAN_LIMIT])


def _allocate(total: int, weights: tuple[int, ...]) -> tuple[int, ...]:
    denominator = sum(weights)
    if total == 0:
        return tuple(0 for _weight in weights)
    if denominator <= 0:
        raise ValueError("Money allocation requires a positive service subtotal.")
    allocations = [total * weight // denominator for weight in weights]
    remainder = total - sum(allocations)
    for index in range(remainder):
        allocations[index % len(allocations)] += 1
    return tuple(allocations)


def _unit_schedule(
    proposal: ProposedAlternative,
    *,
    preferred_start: datetime,
) -> tuple[datetime, ...]:
    if proposal.simultaneous:
        return tuple(preferred_start for _group in proposal.groups)
    starts: list[datetime] = []
    cursor = preferred_start
    for group in proposal.groups:
        starts.append(cursor)
        cursor += timedelta(minutes=sum(item.duration_minutes for item in group))
    return tuple(starts)


def _price_alternative(
    proposal: ProposedAlternative,
    *,
    area: ServiceArea,
    postal_code: str,
    preferred_start: datetime,
    policy: PricingPolicy,
) -> tuple[PricedUnit, ...] | None:
    starts = _unit_schedule(proposal, preferred_start=preferred_start)
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
    if proposal.simultaneous and not _has_distinct_capacity(
        tuple(entry[5] for entry in unit_inputs)
    ):
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


@transaction.atomic
def create_fulfilment_plan_set(  # noqa: PLR0912
    *,
    customer: User,
    cart: Cart,
    address: Address,
    expected_cart_version: int,
    preferred_start: datetime,
) -> FulfilmentPlanSet:
    now = timezone.now()
    locked_cart = Cart.objects.select_for_update().get(id=cart.id)
    if locked_cart.customer_id != customer.id:
        raise PermissionError("The cart does not belong to this Customer.")
    if locked_cart.version != expected_cart_version:
        raise FulfilmentPlanStaleApiError
    if address.customer_id != customer.id or address.archived_at is not None:
        raise PermissionError("Use one of the Customer's active addresses.")
    items = _planning_items(locked_cart)
    service_area: ServiceArea | None = None
    failures: list[dict[str, object]] = []
    for entry in items:
        decision = check_serviceability(
            postal_code=address.postal_code,
            variant_id=entry.item.variant_id,
            requested_start=preferred_start,
            duration_minutes=entry.duration_minutes,
        )
        if not decision.is_serviceable or decision.service_area is None:
            failures.append(
                {
                    "cart_item_id": str(entry.item.id),
                    "reason": decision.reason_code or "not_serviceable",
                }
            )
        elif service_area is None:
            service_area = decision.service_area
        elif service_area.id != decision.service_area.id:
            failures.append(
                {
                    "cart_item_id": str(entry.item.id),
                    "reason": "different_service_area",
                }
            )
    if failures or service_area is None:
        raise FulfilmentPlanUnavailableApiError(reasons=failures)
    _assert_window_time_is_current(
        starts_at=preferred_start,
        area_timezone=service_area.timezone,
        now=now,
    )
    pricing = current_pricing_policy(code="m1-technician")
    cancellation = current_cancellation_policy(code="m1-scheduled-today")
    if pricing is None or cancellation is None:
        raise ValueError("Current pricing and cancellation policies are required.")
    rules = _current_rules(items, at=now)
    try:
        proposals = _candidate_alternatives(
            items=items,
            rules=rules,
            area=service_area,
            preferred_start=preferred_start,
        )
    except ValueError as exc:
        raise FulfilmentPlanUnavailableApiError(
            reasons=[{"cart_item_id": None, "reason": "dependency_cycle"}]
        ) from exc
    priced_alternatives = [
        (proposal, priced)
        for proposal in proposals
        if (
            priced := _price_alternative(
                proposal,
                area=service_area,
                postal_code=address.postal_code,
                preferred_start=preferred_start,
                policy=pricing,
            )
        )
        is not None
    ]
    if not priced_alternatives:
        raise FulfilmentPlanUnavailableApiError(
            reasons=[
                {"cart_item_id": str(item.item.id), "reason": "no_eligible_capacity"}
                for item in items
            ]
        )
    snapshot = {
        "cart_version": locked_cart.version,
        "items": [
            {
                "id": str(entry.item.id),
                "version": entry.item.version,
                "variant_id": str(entry.item.variant_id),
                "configuration_id": str(entry.configuration.id),
                "configuration_version": entry.configuration.version,
                "rate_id": str(entry.rate.id),
                "quantity": entry.item.quantity,
                "scope": entry.scope,
            }
            for entry in items
        ],
        "address_id": str(address.id),
        "preferred_start": preferred_start.isoformat(),
        "compatibility_rules": [
            {"id": str(rule.id), "version": rule.version, "mode": rule.mode}
            for rule in sorted(rules.values(), key=lambda value: str(value.id))
        ],
        **_policy_snapshot(pricing=pricing, cancellation=cancellation),
    }
    FulfilmentPlanSet.objects.filter(
        cart=locked_cart,
        status=FulfilmentPlanSet.Status.ACTIVE,
    ).update(status=FulfilmentPlanSet.Status.INVALIDATED)
    plan_set = FulfilmentPlanSet.objects.create(
        cart=locked_cart,
        cart_version=locked_cart.version,
        address=address,
        input_fingerprint=_fingerprint(snapshot),
        planning_snapshot=snapshot,
        expires_at=now + timedelta(seconds=settings.M1_FULFILMENT_PLAN_TTL_SECONDS),
    )
    for rank, (proposal, units) in enumerate(priced_alternatives, start=1):
        plan = FulfilmentPlan.objects.create(
            plan_set=plan_set,
            rank=rank,
            structure=_structure_for(proposal),
            is_recommended=rank == 1,
            professional_count=len(units),
            visit_count=len(units),
            task_subtotal_paise=sum(unit.task_subtotal_paise for unit in units),
            minimum_visit_adjustment_paise=sum(unit.minimum_adjustment_paise for unit in units),
            platform_fee_paise=sum(unit.platform_fee_allocation_paise for unit in units),
            tax_paise=sum(unit.tax_paise for unit in units),
            total_paise=sum(unit.total_paise for unit in units),
            currency=items[0].rate.currency,
            decisive_reasons=list(proposal.reasons),
        )
        seen: set[UUID] = set()
        for position, unit_input in enumerate(units, start=1):
            unit = PlanUnit.objects.create(
                plan=plan,
                service_area=service_area,
                position=position,
                requested_start=unit_input.starts_at,
                arrival_window_minutes=settings.M1_ARRIVAL_WINDOW_MINUTES,
                estimated_duration_minutes=unit_input.duration_minutes,
                task_subtotal_paise=unit_input.task_subtotal_paise,
                minimum_visit_adjustment_paise=unit_input.minimum_adjustment_paise,
                platform_fee_allocation_paise=unit_input.platform_fee_allocation_paise,
                tax_paise=unit_input.tax_paise,
                total_paise=unit_input.total_paise,
                currency=unit_input.items[0].rate.currency,
                reason_codes=list(unit_input.reason_codes),
                eligibility_snapshot={
                    "eligible_partner_ids": [
                        str(value) for value in unit_input.eligible_partner_ids
                    ],
                    "candidate_count": len(unit_input.eligible_partner_ids),
                },
            )
            for item_position, entry in enumerate(unit_input.items, start=1):
                if entry.item.id in seen:
                    raise AssertionError("A cart item appeared in more than one Plan Unit.")
                seen.add(entry.item.id)
                PlanUnitItem.objects.create(
                    unit=unit,
                    cart_item=entry.item,
                    cart_item_version=entry.item.version,
                    position=item_position,
                    quantity=entry.item.quantity,
                    estimated_duration_minutes=entry.duration_minutes,
                    task_subtotal_paise=entry.subtotal_paise,
                    variant_snapshot={
                        "id": str(entry.item.variant_id),
                        "service_slug": entry.item.variant.service.slug,
                        "service_name": entry.item.variant.service.name,
                        "variant_name": entry.item.variant.name,
                    },
                    scope_snapshot=entry.scope,
                    configuration_snapshot={
                        "id": str(entry.configuration.id),
                        "version": entry.configuration.version,
                        "required_equipment": entry.configuration.required_equipment,
                        "out_of_scope_rules": entry.configuration.out_of_scope_rules,
                        "evidence_policy": entry.configuration.evidence_policy,
                    },
                    rate_snapshot={
                        "id": str(entry.rate.id),
                        "task_code": entry.rate.task_code,
                        "unit_price_paise": entry.rate.unit_price_paise,
                        "currency": entry.rate.currency,
                    },
                )
        if seen != {entry.item.id for entry in items}:
            raise AssertionError(
                "A complete plan must contain every active cart item exactly once."
            )
    return plan_set


def _cancellation_snapshot(plan_set: FulfilmentPlanSet) -> dict[str, Any]:
    return cast(dict[str, Any], plan_set.planning_snapshot["cancellation"])


@transaction.atomic
def create_plan_quote(*, customer: User, plan: FulfilmentPlan) -> Quote:
    locked_plan = (
        FulfilmentPlan.objects.select_for_update()
        .select_related("plan_set__cart", "plan_set__address")
        .prefetch_related("units__items")
        .get(id=plan.id)
    )
    plan_set = locked_plan.plan_set
    cart = Cart.objects.select_for_update().get(id=plan_set.cart_id)
    now = timezone.now()
    if cart.customer_id != customer.id:
        raise PermissionError("The fulfilment plan does not belong to this Customer.")
    existing_quote = Quote.objects.filter(fulfilment_plan=locked_plan).first()
    if existing_quote is not None:
        return existing_quote
    if (
        plan_set.status != FulfilmentPlanSet.Status.ACTIVE
        or plan_set.expires_at <= now
        or cart.version != plan_set.cart_version
    ):
        if plan_set.status == FulfilmentPlanSet.Status.ACTIVE:
            plan_set.status = (
                FulfilmentPlanSet.Status.EXPIRED
                if plan_set.expires_at <= now
                else FulfilmentPlanSet.Status.INVALIDATED
            )
            plan_set.save(update_fields=("status",))
        raise FulfilmentPlanStaleApiError
    pricing_data = cast(dict[str, Any], plan_set.planning_snapshot["pricing"])
    cancellation_data = _cancellation_snapshot(plan_set)
    pricing = PricingPolicy.objects.get(id=pricing_data["id"])
    cancellation = CancellationPolicy.objects.get(id=cancellation_data["id"])
    units = list(locked_plan.units.prefetch_related("items").order_by("position"))
    first_unit = units[0]
    quote = Quote.objects.create(
        fulfilment_plan=locked_plan,
        cart_version=cart.version,
        status=Quote.Status.ACTIVE,
        address=plan_set.address,
        service_area=first_unit.service_area,
        task_subtotal_paise=locked_plan.task_subtotal_paise,
        minimum_visit_adjustment_paise=locked_plan.minimum_visit_adjustment_paise,
        platform_fee_paise=locked_plan.platform_fee_paise,
        tax_paise=locked_plan.tax_paise,
        total_paise=locked_plan.total_paise,
        currency=locked_plan.currency,
        estimated_duration_minutes=sum(unit.estimated_duration_minutes for unit in units),
        requested_start=min(unit.requested_start for unit in units),
        arrival_window_minutes=settings.M1_ARRIVAL_WINDOW_MINUTES,
        task_rate_snapshot={"selected_plan_id": str(locked_plan.id)},
        pricing_policy=pricing,
        pricing_policy_snapshot=pricing_data,
        cancellation_policy=cancellation,
        cancellation_policy_snapshot=cancellation_data,
        quote_inputs_snapshot={
            "plan_set_id": str(plan_set.id),
            "plan_id": str(locked_plan.id),
            "input_fingerprint": plan_set.input_fingerprint,
            "cart_version": cart.version,
        },
        expires_at=plan_set.expires_at,
    )
    for unit in units:
        quote_unit = QuoteUnit.objects.create(
            quote=quote,
            plan_unit=unit,
            position=unit.position,
            requested_start=unit.requested_start,
            arrival_window_minutes=unit.arrival_window_minutes,
            estimated_duration_minutes=unit.estimated_duration_minutes,
            task_subtotal_paise=unit.task_subtotal_paise,
            minimum_visit_adjustment_paise=unit.minimum_visit_adjustment_paise,
            platform_fee_allocation_paise=unit.platform_fee_allocation_paise,
            tax_paise=unit.tax_paise,
            total_paise=unit.total_paise,
            currency=unit.currency,
            cancellation_policy_snapshot=cancellation_data,
        )
        line_position = 1
        for item in unit.items.order_by("position"):
            variant = cast(dict[str, Any], item.variant_snapshot)
            QuoteLine.objects.create(
                quote_unit=quote_unit,
                plan_unit_item=item,
                position=line_position,
                kind=QuoteLine.Kind.SERVICE,
                code=f"task.{item.rate_snapshot['task_code']}",
                label=f"{variant['service_name']} x {item.quantity}",
                quantity=item.quantity,
                amount_paise=item.task_subtotal_paise,
                currency=unit.currency,
                snapshot={
                    "variant": item.variant_snapshot,
                    "scope": item.scope_snapshot,
                    "configuration": item.configuration_snapshot,
                    "rate": item.rate_snapshot,
                },
            )
            line_position += 1
        QuoteLine.objects.create(
            quote_unit=quote_unit,
            position=line_position,
            kind=QuoteLine.Kind.MINIMUM_VISIT_ADJUSTMENT,
            code="minimum_visit_topup",
            label="Minimum visit charge top-up",
            amount_paise=unit.minimum_visit_adjustment_paise,
            currency=unit.currency,
        )
        QuoteLine.objects.create(
            quote_unit=quote_unit,
            position=line_position + 1,
            kind=QuoteLine.Kind.PLATFORM_FEE_ALLOCATION,
            code="platform_fee_allocation",
            label="Allocated platform fee",
            amount_paise=unit.platform_fee_allocation_paise,
            currency=unit.currency,
        )
    plan_set.status = FulfilmentPlanSet.Status.SELECTED
    plan_set.save(update_fields=("status",))
    FulfilmentPlanSet.objects.filter(
        cart=cart,
        status=FulfilmentPlanSet.Status.ACTIVE,
    ).exclude(id=plan_set.id).update(status=FulfilmentPlanSet.Status.INVALIDATED)
    return quote
