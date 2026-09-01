import random
from itertools import combinations
from types import SimpleNamespace
from typing import cast
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from django.utils import timezone

from apps.carts.models import CartItem, ServiceCompatibilityRule
from apps.carts.planning import (
    PlanningItem,
    ProposedAlternative,
    _allocate,
    _candidate_alternatives,
    _rule_for,
)
from apps.catalog.models import A1VariantConfiguration
from apps.locations.models import ServiceArea
from apps.pricing.models import TaskRate

PROPERTY_CASES = 100
MAX_PROPERTY_ITEMS = 6
MISSING_RULE_PROBABILITY = 0.25


def _items(rng: random.Random, count: int) -> tuple[PlanningItem, ...]:
    result: list[PlanningItem] = []
    for _index in range(count):
        item = cast(CartItem, SimpleNamespace(id=uuid4(), variant_id=uuid4()))
        result.append(
            PlanningItem(
                item=item,
                configuration=cast(A1VariantConfiguration, SimpleNamespace()),
                rate=cast(TaskRate, SimpleNamespace(unit_price_paise=rng.randint(1, 10_000))),
                scope={},
                duration_minutes=rng.randint(1, 240),
            )
        )
    return tuple(result)


def _rules(
    rng: random.Random,
    items: tuple[PlanningItem, ...],
) -> dict[frozenset[UUID], ServiceCompatibilityRule]:
    result: dict[frozenset[UUID], ServiceCompatibilityRule] = {}
    modes = tuple(ServiceCompatibilityRule.Mode.values)
    directional = (
        ServiceCompatibilityRule.Dependency.NONE,
        ServiceCompatibilityRule.Dependency.LEFT_BEFORE_RIGHT,
        ServiceCompatibilityRule.Dependency.RIGHT_BEFORE_LEFT,
    )
    for left, right in combinations(items, 2):
        if rng.random() < MISSING_RULE_PROBABILITY:
            continue
        mode = rng.choice(modes)
        dependency = (
            ServiceCompatibilityRule.Dependency.NONE
            if mode == ServiceCompatibilityRule.Mode.PARALLEL_ALLOWED
            else rng.choice(directional)
        )
        left_id, right_id = sorted((left.item.variant_id, right.item.variant_id), key=str)
        rule = ServiceCompatibilityRule(
            left_variant_id=left_id,
            right_variant_id=right_id,
            mode=mode,
            dependency=dependency,
        )
        result[frozenset((left_id, right_id))] = rule
    return result


def _signature(alternatives: tuple[ProposedAlternative, ...]) -> tuple[object, ...]:
    return tuple(
        (
            alternative.simultaneous,
            alternative.reasons,
            tuple(tuple(str(item.item.id) for item in group) for group in alternative.groups),
        )
        for alternative in alternatives
    )


def test_randomized_partitions_are_complete_disjoint_bounded_and_deterministic() -> None:
    for seed in range(PROPERTY_CASES):
        rng = random.Random(seed)  # noqa: S311 - deterministic property generation
        items = _items(rng, rng.randint(1, MAX_PROPERTY_ITEMS))
        rules = _rules(rng, items)
        with patch(
            # Patched where it is *used*: the planning god-module became a package and
            # `grouping.py` imported this name into its own namespace, so patching the
            # package-level re-export left the real query running against the fake area.
            "apps.carts.planning.grouping._eligible_partner_ids",
            return_value=(uuid4(),),
        ):
            try:
                first = _candidate_alternatives(
                    items=items,
                    rules=rules,
                    area=cast(ServiceArea, SimpleNamespace()),
                    preferred_start=timezone.now(),
                )
            except ValueError:
                with pytest.raises(ValueError, match="dependency graph contains a cycle"):
                    _candidate_alternatives(
                        items=items,
                        rules=rules,
                        area=cast(ServiceArea, SimpleNamespace()),
                        preferred_start=timezone.now(),
                    )
                continue
            second = _candidate_alternatives(
                items=items,
                rules=rules,
                area=cast(ServiceArea, SimpleNamespace()),
                preferred_start=timezone.now(),
            )

        assert _signature(first) == _signature(second)
        assert first
        expected_ids = {item.item.id for item in items}
        for alternative in first:
            planned_ids = [item.item.id for group in alternative.groups for item in group]
            assert len(planned_ids) == len(expected_ids)
            assert set(planned_ids) == expected_ids
            for group in alternative.groups:
                for left, right in combinations(group, 2):
                    rule = _rule_for(left, right, rules)
                    assert rule is not None
                    assert rule.mode == (ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL)
            if alternative.simultaneous:
                for left_group, right_group in combinations(alternative.groups, 2):
                    for left in left_group:
                        for right in right_group:
                            rule = _rule_for(left, right, rules)
                            assert rule is not None
                            assert rule.mode == ServiceCompatibilityRule.Mode.PARALLEL_ALLOWED
                            assert rule.dependency == (ServiceCompatibilityRule.Dependency.NONE)


def test_randomized_paise_allocation_is_exact_stable_and_bounded() -> None:
    rng = random.Random(20260802)  # noqa: S311 - deterministic property generation
    for _case in range(PROPERTY_CASES):
        weights = tuple(rng.randint(1, 100_000) for _ in range(rng.randint(1, 8)))
        total = rng.randint(0, 1_000_000)
        allocations = _allocate(total, weights)
        assert allocations == _allocate(total, weights)
        assert sum(allocations) == total
        denominator = sum(weights)
        for allocation, weight in zip(allocations, weights, strict=True):
            assert abs(allocation - total * weight / denominator) <= 1
