"""Compatibility grouping: how a cart falls into separately-schedulable visits.

The time-independent half of the planner. It reads the `ServiceCompatibilityRule`
vocabulary — same-Partner-sequential vs parallel-allowed, plus any ordering
dependency — and turns a flat list of cart items into groups: work one Partner may
do in one visit, work that needs a second Partner alongside, and work that needs a
visit of its own.

Two public reads sit on that algebra. `scheduling_groups` publishes the visits the
Customer picks start times against, *before* any time has been chosen.
`cart_suggestion_service_ids` reuses the same merge rule to say what else one
Partner could do in a visit this cart already has.

Where the boundary falls: nothing here prices anything, nothing here writes, and
capacity only enters through the planner's own `require_capacity=True` call.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from datetime import datetime
from itertools import combinations
from uuid import UUID

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.carts.models import Cart, ServiceCompatibilityRule
from apps.locations.models import ServiceArea

from .base import (
    MIN_PARALLEL_UNITS,
    PlanningItem,
    ProposedAlternative,
    SchedulingGroup,
    _current_rules,
    _eligible_partner_ids,
    _planning_items,
    _rule_for,
)


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
    require_capacity: bool = True,
) -> tuple[tuple[PlanningItem, ...], ...]:
    """Merges work that one Partner may do in sequence.

    ``require_capacity`` distinguishes the two questions this answers.

    The planner needs *"is there a Partner free to do all of this at this exact
    time?"* and passes ``True``: a plan that cannot be staffed is not a plan.

    The scheduling groups the Customer picks slots against need *"is this the kind
    of work one Partner does in one visit?"* and pass ``False``. Capacity has no
    place in that question — a Partner calling in sick would otherwise split
    "Electrician" into two slot pickers and merge them again an hour later, and the
    Customer would have no way to understand why the screen changed. When no single
    Partner can in fact cover the group, the planner still resolves it correctly by
    falling back to independent visits at the chosen start, so nothing is promised
    here that cannot be delivered.
    """
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
                and (
                    not require_capacity
                    or _eligible_partner_ids(
                        items=candidate,
                        area=area,
                        starts_at=starts_at,
                        duration_minutes=duration,
                    )
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


def scheduling_group_key(cart_item_ids: Iterable[UUID]) -> str:
    """A stable identity for one visit, derived only from its membership.

    Order-independent and time-independent on purpose. The Customer picks a start
    against this key and sends it back with the plan-set command, which matches on
    it; a key that moved when the probe time moved would reopen the slot picker on
    every refetch and make the whole flow unusable.
    """
    joined = ",".join(sorted(str(value) for value in cart_item_ids))
    return hashlib.sha256(joined.encode()).hexdigest()[:32]


def _group_label(items: tuple[PlanningItem, ...]) -> str:
    """The heading for one visit.

    Groups only ever form between variants a rule allows one Partner to do in
    sequence, so the first item's subcategory names the whole visit. Falls back
    through the service's own name rather than inventing a heading.
    """
    service = items[0].item.variant.service
    if service.subcategory_id is not None:
        return str(service.subcategory.name)
    return str(service.name)


def scheduling_groups(
    *,
    cart: Cart,
    area: ServiceArea,
    at: datetime | None = None,
) -> tuple[SchedulingGroup, ...]:
    """How this cart splits into separately-schedulable visits.

    The grouping the Customer picks slots against: one row per visit, published
    *before* any start time has been chosen. That ordering is the whole point —
    the plan-set command needs the times as input, so it cannot be what tells the
    Customer how many times to pick.

    Answerable early because it asks only the time-independent half of the merge
    rule: an active `SAME_PARTNER_SEQUENTIAL` compatibility rule between every pair,
    and a combined duration inside `M1_SEQUENTIAL_UNIT_MAX_MINUTES`. Whether a
    Partner is actually free is deliberately excluded (see
    `_build_sequential_groups`) so the number of slot pickers does not change under
    the Customer while they are looking at it.

    `at` exists for the effective-dating of compatibility rules, which is genuinely
    time-sensitive — Operations can retire a rule — and defaults to now.

    The client renders this and never derives it. Deciding in the browser which
    services share a Partner would be a second implementation of the compatibility
    rules, and the first time the two disagreed the Customer would be offered a
    visit the planner refuses to build.
    """
    items = _planning_items(cart)
    at = timezone.now() if at is None else at
    rules = _current_rules(items, at=at)
    grouped = _build_sequential_groups(
        _order_items_by_dependencies(items, rules=rules),
        rules=rules,
        area=area,
        starts_at=at,
        require_capacity=False,
    )
    return tuple(
        SchedulingGroup(
            key=scheduling_group_key(entry.item.id for entry in group),
            label=_group_label(group),
            estimated_duration_minutes=sum(entry.duration_minutes for entry in group),
            cart_item_ids=tuple(entry.item.id for entry in group),
        )
        for group in grouped
    )


def cart_suggestion_service_ids(*, cart: Cart, limit: int = 4) -> tuple[UUID, ...]:
    """Services one Partner could add to a visit this cart already has.

    The signal is an active `SAME_PARTNER_SEQUENTIAL` compatibility rule against
    something already in the cart — the *same* rule `_build_sequential_groups` uses
    to merge work into one unit. That is what entitles the screen to say "the same
    professional can do this in the same visit": it is the platform's own merge
    decision, not a merchandising guess.

    `PARALLEL_ALLOWED` is deliberately excluded. It means a **second** Partner, and
    therefore a second visit and a second minimum-visit floor — the opposite of
    what this section promises.

    Returns empty rather than substituting popular services. A cart with nothing
    compatible has nothing to say here, and filling the space anyway would make the
    heading false.

    Returns service **ids**, not cards: what is publishable about a service is the
    catalog's decision, and `public_services_by_id` is where that gate lives.
    """
    try:
        items = _planning_items(cart)
    except ValueError:
        return ()

    now = timezone.now()
    present_variant_ids = {entry.item.variant_id for entry in items}
    present_service_ids = {entry.item.variant.service_id for entry in items}
    rules = (
        ServiceCompatibilityRule.objects.filter(
            mode=ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL,
            is_active=True,
            lifecycle_status=ServiceCompatibilityRule.LifecycleStatus.ACTIVE,
            effective_from__lte=now,
        )
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now))
        .filter(
            models.Q(left_variant_id__in=present_variant_ids)
            | models.Q(right_variant_id__in=present_variant_ids)
        )
        .select_related("left_variant", "right_variant")
        .order_by("created_at", "id")
    )

    suggested: list[UUID] = []
    for rule in rules:
        for near_id, far in (
            (rule.left_variant_id, rule.right_variant),
            (rule.right_variant_id, rule.left_variant),
        ):
            if near_id not in present_variant_ids:
                continue
            if far.id in present_variant_ids or far.service_id in present_service_ids:
                continue
            if far.service_id not in suggested:
                suggested.append(far.service_id)
    return tuple(suggested[:limit])
