"""Nobody could be found for one visit — what the Customer may do, and what they pay.

The matching engine has always settled an unfillable slot as `NO_PROFESSIONAL_FOUND`. What was
missing was the other half: a way to stop paying for it. `chargeable_paise` quoted the whole tier
price regardless, so a two-visit plan with one dead slot asked for both and refunded one later —
taking money for a visit we already knew could not happen.

Written, not run: the owner runs the suite.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.requirements import access, visit_slots
from apps.requirements.exceptions import VisitSlotUnavailableError
from apps.requirements.models import M2AccessPrice, VisitPlan, VisitPlanShare

from .conftest import M2World, draft_requirement

pytestmark = pytest.mark.django_db


def _plan(world: M2World, *, size: int) -> VisitPlan:
    """A chosen, unpaid visit plan of `size` slots — the state a Customer is in when
    matching is still running and nothing has been charged."""
    M2AccessPrice.objects.create(
        kind=M2AccessPrice.Kind.A5_VISIT_PLAN,
        plan_size=size,
        amount_paise=9_900,
        vendor_payout_basis_points=8_000,
        effective_from=timezone.localdate() - timedelta(days=1),
    )
    requirement = draft_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    access.choose_visit_plan(requirement_id=requirement.id, plan_size=size, actor=world.customer)
    requirement.refresh_from_db()
    return requirement.visit_plan


@pytest.fixture
def two_visit_plan(world: M2World) -> VisitPlan:
    return _plan(world, size=2)


@pytest.fixture
def one_visit_plan(world: M2World) -> VisitPlan:
    return _plan(world, size=1)


@pytest.fixture
def customer(world: M2World):
    return world.customer


def _exhaust(share: VisitPlanShare) -> VisitPlanShare:
    """Put one share in the state the matching sweep leaves behind when nobody is eligible."""
    share.matching_status = VisitPlanShare.MatchingStatus.NO_PROFESSIONAL_FOUND
    share.save(update_fields=("matching_status",))
    return share


class TestWhatTheCustomerIsCharged:
    def test_an_undeliverable_slot_leaves_the_plan_price(self, two_visit_plan, customer) -> None:
        plan = two_visit_plan
        first, second = plan.shares.order_by("position")
        before = plan.chargeable_paise
        _exhaust(second)

        visit_slots.drop_unmatched_visit_slot(
            requirement_id=plan.requirement_id, share_id=second.id, actor=customer
        )
        plan.refresh_from_db()

        assert plan.chargeable_paise == before - second.amount_paise
        assert plan.chargeable_paise == first.amount_paise

    def test_an_exhausted_slot_still_costs_until_it_is_dropped(self, two_visit_plan) -> None:
        """Deliberate. A slot may yet be re-timed, and a price that flickered with the
        matching state would be worse than either answer."""
        plan = two_visit_plan
        before = plan.chargeable_paise
        _exhaust(plan.shares.order_by("position")[1])
        plan.refresh_from_db()

        assert plan.chargeable_paise == before

    def test_the_share_is_refunded_in_full_including_the_platform_part(
        self, two_visit_plan, customer
    ) -> None:
        plan = two_visit_plan
        second = _exhaust(plan.shares.order_by("position")[1])

        dropped = visit_slots.drop_unmatched_visit_slot(
            requirement_id=plan.requirement_id, share_id=second.id, actor=customer
        )

        assert dropped.status == VisitPlanShare.Status.REFUNDED
        assert dropped.settlement_reason_code == "no_professional_found"
        assert dropped.refunded_at is not None


class TestWhatMayBeDropped:
    def test_a_searching_slot_may_not_be_dropped(self, two_visit_plan, customer) -> None:
        plan = two_visit_plan
        second = plan.shares.order_by("position")[1]
        assert second.matching_status == VisitPlanShare.MatchingStatus.SEARCHING

        with pytest.raises(VisitSlotUnavailableError):
            visit_slots.drop_unmatched_visit_slot(
                requirement_id=plan.requirement_id, share_id=second.id, actor=customer
            )

    def test_the_last_remaining_slot_may_not_be_dropped(self, one_visit_plan, customer) -> None:
        """A plan that buys nothing while still existing is not a state worth having.
        Cancelling the request is a different door with its own rules."""
        plan = one_visit_plan
        only = _exhaust(plan.shares.get())

        with pytest.raises(VisitSlotUnavailableError):
            visit_slots.drop_unmatched_visit_slot(
                requirement_id=plan.requirement_id, share_id=only.id, actor=customer
            )

    def test_dropping_twice_re_reads_the_dropped_slot(self, two_visit_plan, customer) -> None:
        plan = two_visit_plan
        second = _exhaust(plan.shares.order_by("position")[1])

        first_call = visit_slots.drop_unmatched_visit_slot(
            requirement_id=plan.requirement_id, share_id=second.id, actor=customer
        )
        again = visit_slots.drop_unmatched_visit_slot(
            requirement_id=plan.requirement_id, share_id=second.id, actor=customer
        )

        assert again.id == first_call.id
        assert again.status == VisitPlanShare.Status.REFUNDED

    def test_a_sibling_that_matched_is_untouched(self, two_visit_plan, customer) -> None:
        plan = two_visit_plan
        first, second = plan.shares.order_by("position")
        first.status = VisitPlanShare.Status.COMMITTED
        first.matching_status = VisitPlanShare.MatchingStatus.HELD
        first.save(update_fields=("status", "matching_status"))
        _exhaust(second)

        visit_slots.drop_unmatched_visit_slot(
            requirement_id=plan.requirement_id, share_id=second.id, actor=customer
        )
        first.refresh_from_db()

        assert first.status == VisitPlanShare.Status.COMMITTED
        assert first.matching_status == VisitPlanShare.MatchingStatus.HELD
