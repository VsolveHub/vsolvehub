"""Deterministic multi-item fulfilment planning and immutable group quote commands.

The package layout, in dependency order:

- `base` — the shared vocabulary: `PlanningItem` and its siblings, the input
  fingerprint, the cart read, the compatibility-rule lookup, the capacity probe.
- `grouping` — the time-independent compatibility algebra, the scheduling groups the
  Customer picks slots against, and same-visit cart suggestions.
- `pricing` — laying one proposed alternative on the clock, proving it can be
  staffed by distinct Partners, and costing it into `PricedUnit`s.
- `commands` — the two `@transaction.atomic` writes, `create_fulfilment_plan_set`
  and `create_plan_quote`, plus the service-area resolution they share.
"""

from .base import (
    MIN_PARALLEL_UNITS,
    PlanningItem,
    PricedUnit,
    ProposedAlternative,
    SchedulingGroup,
    UnitInput,
    _canonical_json,
    _current_rules,
    _eligible_partner_ids,
    _fingerprint,
    _planning_items,
    _rule_for,
)
from .commands import (
    _cancellation_snapshot,
    _starts_by_item,
    create_fulfilment_plan_set,
    create_plan_quote,
    resolve_cart_service_area,
)
from .grouping import (
    _all_pairs_have_mode,
    _build_sequential_groups,
    _candidate_alternatives,
    _group_label,
    _groups_can_run_in_parallel,
    _order_items_by_dependencies,
    cart_suggestion_service_ids,
    scheduling_group_key,
    scheduling_groups,
)
from .pricing import (
    _allocate,
    _has_cross_visit_conflict,
    _policy_snapshot,
    _price_alternative,
    _structure_for,
    _time_ranges_overlap,
    _unit_schedule,
)

__all__ = [
    "MIN_PARALLEL_UNITS",
    "PlanningItem",
    "PricedUnit",
    "ProposedAlternative",
    "SchedulingGroup",
    "UnitInput",
    "_all_pairs_have_mode",
    "_allocate",
    "_build_sequential_groups",
    "_cancellation_snapshot",
    "_candidate_alternatives",
    "_canonical_json",
    "_current_rules",
    "_eligible_partner_ids",
    "_fingerprint",
    "_group_label",
    "_groups_can_run_in_parallel",
    "_has_cross_visit_conflict",
    "_order_items_by_dependencies",
    "_planning_items",
    "_policy_snapshot",
    "_price_alternative",
    "_rule_for",
    "_starts_by_item",
    "_structure_for",
    "_time_ranges_overlap",
    "_unit_schedule",
    "cart_suggestion_service_ids",
    "create_fulfilment_plan_set",
    "create_plan_quote",
    "resolve_cart_service_area",
    "scheduling_group_key",
    "scheduling_groups",
]
