"""Shared planning vocabulary: dataclasses, fingerprints, and the capacity probe.

The bottom of `apps.carts.planning` and the only slice its siblings import from, so
the package's dependency arrows stay one-way. Everything here is read by more than
one slice above it: the frozen dataclasses the planner passes around, the
canonical-JSON fingerprint a plan set is keyed by, the cart -> `PlanningItem` read,
the effective-dated compatibility-rule lookup, and the Partner-capacity probe that
answers "is anyone free to do this work at this time?".
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from django.conf import settings
from django.db import models
from psycopg.types.range import Range

from apps.assignments.models import Reservation
from apps.carts.item_inputs import current_item_inputs
from apps.carts.models import Cart, CartItem, ServiceCompatibilityRule
from apps.catalog.models import A1VariantConfiguration
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.partners.selectors import partner_available_during
from apps.pricing.models import TaskRate

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
class SchedulingGroup:
    """One separately-schedulable visit, published before any time is chosen."""

    key: str
    label: str
    estimated_duration_minutes: int
    cart_item_ids: tuple[UUID, ...]


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
        .select_related("variant__service__subcategory", "task_rate", "configuration")
        .prefetch_related("scope_values")
        .order_by("created_at", "id")
    )
    if not items:
        raise ValueError("Add at least one service request before planning fulfilment.")
    if len(items) > settings.M1_CART_ITEM_LIMIT:
        raise ValueError("The active cart exceeds the configured planning limit.")
    result: list[PlanningItem] = []
    for item in items:
        configuration, rate, scope, duration = current_item_inputs(item)
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
    # Widened by the turnaround buffer so this probe agrees with both what a
    # reservation actually occupies (Task 5) and the grid's own snapshot
    # (`availability.AvailabilitySnapshot._is_reserved`) — a Partner the grid
    # shows as free must be a Partner this probe can actually book.
    occupied_range = Range(
        starts_at,
        starts_at + timedelta(minutes=duration_minutes + settings.M1_TURNAROUND_MINUTES),
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
