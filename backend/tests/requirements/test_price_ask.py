"""The price ask: what a Customer may say, and what it may never do.

The invariant under test is the one the model docstring states — a Customer says what they *hope
to pay*, only a vendor says what the work *costs*. Every test here is either a guard on the ask
or a proof that the estimate the vendor sent is untouched by it.

Written, not run: the owner runs the suite.
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction

from apps.requirements import proposals
from apps.requirements.exceptions import (
    ProposalNotSelectableError,
    RequirementTransitionError,
)
from apps.requirements.models import Proposal, RevisionRequest

pytestmark = pytest.mark.django_db

#: 5% -- the discount the sheet offers as its second one-tap chip.
FIVE_PERCENT_BPS = 500
#: 3% -- the first chip, and what a vendor who moves only part of the way here grants.
THREE_PERCENT_BPS = 300
#: 2% -- a vendor countering below what was asked.
TWO_PERCENT_BPS = 200


def _ask(requirement, proposal, customer, **overrides):
    payload = {
        "requirement_id": requirement.id,
        "proposal_id": proposal.id,
        "actor": customer,
        "reason_code": RevisionRequest.ReasonCode.PRICE,
        "excluded_items": [],
        "note": "",
        "requested_discount_bps": FIVE_PERCENT_BPS,
    }
    payload.update(overrides)
    return proposals.request_revision(**payload)


class TestTheAskIsBounded:
    def test_records_what_the_customer_hoped_for(self, requirement, submitted_proposal, customer):
        asked = _ask(requirement, submitted_proposal, customer)

        assert asked.reason_code == RevisionRequest.ReasonCode.PRICE
        assert asked.requested_discount_bps == FIVE_PERCENT_BPS
        assert asked.countered_discount_bps is None
        assert asked.status == RevisionRequest.Status.OPEN

    def test_refuses_a_price_ask_with_no_figure(self, requirement, submitted_proposal, customer):
        with pytest.raises(RequirementTransitionError):
            _ask(requirement, submitted_proposal, customer, requested_discount_bps=None)

    def test_refuses_more_than_the_cap(self, requirement, submitted_proposal, customer):
        with pytest.raises(RequirementTransitionError):
            _ask(
                requirement,
                submitted_proposal,
                customer,
                requested_discount_bps=RevisionRequest.MAX_DISCOUNT_BPS + 1,
            )

    def test_refuses_zero(self, requirement, submitted_proposal, customer):
        with pytest.raises(RequirementTransitionError):
            _ask(requirement, submitted_proposal, customer, requested_discount_bps=0)

    def test_refuses_a_figure_on_a_scope_ask(self, requirement, submitted_proposal, customer):
        with pytest.raises(RequirementTransitionError):
            _ask(
                requirement,
                submitted_proposal,
                customer,
                reason_code=RevisionRequest.ReasonCode.LEAVE_OUT,
                requested_discount_bps=FIVE_PERCENT_BPS,
            )

    def test_the_database_refuses_a_figure_on_a_scope_ask_too(
        self, requirement, submitted_proposal, customer
    ):
        """The service guard is convenience; this constraint is the rule."""
        with pytest.raises(IntegrityError), transaction.atomic():
            RevisionRequest.objects.create(
                requirement=requirement,
                proposal=submitted_proposal,
                requested_by=customer,
                reason_code=RevisionRequest.ReasonCode.LEAVE_OUT,
                requested_discount_bps=FIVE_PERCENT_BPS,
            )


class TestOneAskPerEstimate:
    def test_a_second_price_ask_is_refused_rather_than_becoming_a_haggle(
        self, requirement, submitted_proposal, customer
    ):
        first = _ask(
            requirement, submitted_proposal, customer, requested_discount_bps=THREE_PERCENT_BPS
        )
        first.status = RevisionRequest.Status.DECLINED
        first.resolved_at = first.created_at
        first.save(update_fields=("status", "resolved_at"))

        with pytest.raises(ProposalNotSelectableError):
            _ask(requirement, submitted_proposal, customer, requested_discount_bps=FIVE_PERCENT_BPS)

    def test_an_open_ask_is_re_read_rather_than_duplicated(
        self, requirement, submitted_proposal, customer
    ):
        first = _ask(requirement, submitted_proposal, customer)
        again = _ask(requirement, submitted_proposal, customer)

        assert again.id == first.id
        assert RevisionRequest.objects.filter(proposal=submitted_proposal).count() == 1


class TestRateCardPricesAreNotTheVendorsToMove:
    def test_refuses_a_price_ask_on_a_day_hire_quote(
        self, requirement, submitted_proposal, customer
    ):
        submitted_proposal.rate_paise_per_worker_day = 90_000
        submitted_proposal.save(update_fields=("rate_paise_per_worker_day",))

        with pytest.raises(ProposalNotSelectableError):
            _ask(requirement, submitted_proposal, customer)


class TestTheEstimateIsUntouched:
    def test_asking_changes_no_total(self, requirement, submitted_proposal, customer):
        before = submitted_proposal.total_paise
        _ask(requirement, submitted_proposal, customer)
        submitted_proposal.refresh_from_db()

        assert submitted_proposal.total_paise == before

    def test_asking_leaves_the_estimate_selectable(self, requirement, submitted_proposal, customer):
        _ask(requirement, submitted_proposal, customer)
        submitted_proposal.refresh_from_db()

        assert submitted_proposal.status == Proposal.Status.SUBMITTED


class TestTheAnswerIsTheVendorsOwnNumber:
    def test_a_revision_records_what_it_actually_moved(
        self, requirement, submitted_proposal, customer, submit_revision
    ):
        """The counter is read off the new total, never taken from the ask.

        A vendor asked for 5% who moves 2% has moved 2%, and the Customer reads that.
        """
        asked = _ask(
            requirement, submitted_proposal, customer, requested_discount_bps=FIVE_PERCENT_BPS
        )
        original = submitted_proposal.total_paise

        submit_revision(submitted_proposal, total_paise=int(original * 0.98))
        asked.refresh_from_db()

        assert asked.status == RevisionRequest.Status.ANSWERED
        assert asked.countered_discount_bps == TWO_PERCENT_BPS

    def test_a_revision_that_raised_the_price_records_no_discount(
        self, requirement, submitted_proposal, customer, submit_revision
    ):
        asked = _ask(
            requirement, submitted_proposal, customer, requested_discount_bps=FIVE_PERCENT_BPS
        )
        submit_revision(submitted_proposal, total_paise=submitted_proposal.total_paise + 100_000)
        asked.refresh_from_db()

        assert asked.countered_discount_bps == 0

    def test_a_scope_revision_records_no_discount_at_all(
        self, requirement, submitted_proposal, customer, submit_revision
    ):
        asked = proposals.request_revision(
            requirement_id=requirement.id,
            proposal_id=submitted_proposal.id,
            actor=customer,
            reason_code=RevisionRequest.ReasonCode.LEAVE_OUT,
            excluded_items=["False ceiling"],
            note="",
        )
        submit_revision(submitted_proposal, total_paise=submitted_proposal.total_paise - 100_000)
        asked.refresh_from_db()

        assert asked.countered_discount_bps is None
