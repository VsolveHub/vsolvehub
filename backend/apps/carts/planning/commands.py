"""The two write commands: freeze a plan set, then freeze a quote from one plan.

The transaction scripts `carts.views` and `carts.services` delegate to, together
with the serviceability and chosen-start resolution they share.

`create_fulfilment_plan_set` locks the cart, resolves the one service area every
item can happen in, checks the submitted starts still match the visits this cart
makes, prices every candidate alternative and persists the whole immutable set.
`create_plan_quote` locks the chosen plan, converts it into a `Quote` with its units
and lines, and retires every other plan set on the cart.

`resolve_cart_service_area` is public because `carts.services` and the
scheduling-groups read need the same answer the planner uses; the rest of this
slice is private to the two commands.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.availability import arrival_window_for_duration
from apps.carts.exceptions import (
    FulfilmentPlanStaleApiError,
    FulfilmentPlanUnavailableApiError,
    SchedulingGroupsChangedApiError,
)
from apps.carts.item_inputs import assert_window_time_is_current
from apps.carts.models import (
    Cart,
    FulfilmentPlan,
    FulfilmentPlanSet,
    PlanUnit,
    PlanUnitItem,
    Quote,
    QuoteLine,
    QuoteUnit,
)
from apps.identity.models import User
from apps.locations.models import Address, ServiceArea
from apps.locations.services import check_serviceability
from apps.pricing.models import CancellationPolicy, PricingPolicy
from apps.pricing.selectors import current_cancellation_policy, current_pricing_policy

from .base import PlanningItem, _current_rules, _fingerprint, _planning_items
from .grouping import _candidate_alternatives, scheduling_groups
from .pricing import _policy_snapshot, _price_alternative, _structure_for


def resolve_cart_service_area(
    *,
    cart: Cart,
    address: Address,
    starts_by_item: Mapping[UUID, datetime] | None = None,
    items: tuple[PlanningItem, ...] | None = None,
) -> ServiceArea:
    """The one service area every item in this cart resolves to.

    Raises `FulfilmentPlanUnavailableApiError` carrying a per-item reason when an
    item is unserviceable, or when the cart straddles two areas — a cart that
    cannot happen in one place cannot be planned as one booking.

    Shared by the planner and the scheduling-groups read so the two cannot disagree
    about where a cart can happen.

    `starts_by_item` maps each cart item to the start of *its own* visit, because
    with per-visit scheduling "is the area open then?" has a different answer for
    each one. Omitting it asks only "is this area serviceable at all", which is the
    strongest question answerable before the Customer has picked any slot — and is
    exactly what the scheduling-groups read needs.
    """
    entries = _planning_items(cart) if items is None else items
    service_area: ServiceArea | None = None
    failures: list[dict[str, object]] = []
    for entry in entries:
        at = None if starts_by_item is None else starts_by_item.get(entry.item.id)
        decision = check_serviceability(
            postal_code=address.postal_code,
            variant_id=entry.item.variant_id,
            requested_start=at,
            duration_minutes=entry.duration_minutes if at is not None else None,
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
    return service_area


def _starts_by_item(
    *,
    cart: Cart,
    area: ServiceArea,
    submitted: Mapping[str, datetime],
    at: datetime,
) -> dict[UUID, datetime]:
    """Maps each cart item to the start chosen for the visit it belongs to.

    Refuses outright when the submitted keys are not exactly the visits this cart
    currently makes — too few, too many, or simply different. Both halves matter: a
    missing key means work with no time, and an unknown key means the Customer
    scheduled a visit that no longer exists.

    Deliberately not repaired. Re-deriving the grouping and reassigning the times
    would move a visit to a slot nobody agreed to — two services scheduled days
    apart could silently collapse into one, or the electrician's time could land on
    the salon appointment. The Customer is asked again instead.
    """
    groups = scheduling_groups(cart=cart, area=area, at=at)
    if {group.key for group in groups} != set(submitted):
        raise SchedulingGroupsChangedApiError
    return {item_id: submitted[group.key] for group in groups for item_id in group.cart_item_ids}


@transaction.atomic
def create_fulfilment_plan_set(
    *,
    customer: User,
    cart: Cart,
    address: Address,
    expected_cart_version: int,
    preferred_starts: Mapping[str, datetime],
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
    # The area is resolved without times first, because the grouping the submitted
    # starts are keyed to is itself area-scoped: asking "is this cart serviceable
    # here at all" is what makes the group keys meaningful enough to check.
    service_area = resolve_cart_service_area(cart=locked_cart, address=address, items=items)
    submitted = dict(preferred_starts)
    starts_by_item = _starts_by_item(
        cart=locked_cart,
        area=service_area,
        submitted=submitted,
        at=now,
    )
    resolve_cart_service_area(
        cart=locked_cart,
        address=address,
        starts_by_item=starts_by_item,
        items=items,
    )
    for starts_at in submitted.values():
        assert_window_time_is_current(
            starts_at=starts_at,
            area_timezone=service_area.timezone,
            now=now,
        )
    pricing = current_pricing_policy(code="m1-technician")
    cancellation = current_cancellation_policy(code="m1-scheduled-today")
    if pricing is None or cancellation is None:
        raise ValueError("Current pricing and cancellation policies are required.")
    rules = _current_rules(items, at=now)
    earliest = min(submitted.values())
    try:
        proposals = _candidate_alternatives(
            items=items,
            rules=rules,
            area=service_area,
            preferred_start=earliest,
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
                starts_by_item=starts_by_item,
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
        "preferred_starts": {key: value.isoformat() for key, value in sorted(submitted.items())},
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
                # Per unit, from that unit's own duration — a plan mixing a
                # 30-minute visit with a 3-hour one gives each the width the grid
                # offered it, not one width borrowed from the plan as a whole.
                arrival_window_minutes=arrival_window_for_duration(unit_input.duration_minutes),
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
    # The plan-level Quote's `requested_start` is the earliest unit's start, so its
    # arrival window is that same unit's — not a width derived from the summed
    # duration, which would put a two-visit plan of two short jobs into the long
    # tier and promise the Customer a wider window than either visit was offered.
    # The per-visit truth stays on each QuoteUnit below.
    earliest_unit = min(units, key=lambda unit: unit.requested_start)
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
        requested_start=earliest_unit.requested_start,
        arrival_window_minutes=earliest_unit.arrival_window_minutes,
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
