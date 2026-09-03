"""A Customer asks for a different estimate; the vendor answers with a revision or declines."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.requirements import proposals
from apps.requirements.exceptions import ProposalNotSelectableError, RequirementTransitionError
from apps.requirements.models import Proposal, RevisionRequest

from .conftest import M2World, invitation_for, proposal_for, submitted_requirement

pytestmark = pytest.mark.django_db


def _live_proposal(world: M2World) -> Proposal:
    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    return proposal_for(invitation=invitation)


def _open_request(world: M2World, proposal: Proposal) -> RevisionRequest:
    return RevisionRequest.objects.create(
        requirement=proposal.requirement,
        proposal=proposal,
        requested_by=world.customer,
        reason_code=RevisionRequest.ReasonCode.LEAVE_OUT,
        excluded_items=["False ceiling"],
        note="We will do the ceiling later.",
    )


def test_a_live_estimate_stays_revisable_however_long_ago_it_was_sent(world: M2World) -> None:
    """There is no clock in this policy any more.

    Until 1.61.0 an A5 estimate closed to revision five minutes after submission, and only a
    Customer's request reopened it. That left a Partner looking at a price they could no longer
    correct while the Customer was still deciding. `submitted_at` is deliberately ancient here: if
    a window ever creeps back in, this is the test that fails.
    """
    proposal = _live_proposal(world)
    proposal.submitted_at = timezone.now() - timedelta(days=30)
    proposal.save(update_fields=("submitted_at",))
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_a_withdrawn_estimate_can_be_replaced(world: M2World) -> None:
    """The withdraw dialog's promise, kept.

    "Your enquiry stays open, so you can send a new one" is what the Partner is told before they
    confirm a withdrawal. For projects this command used to refuse the new one.
    """
    proposal = _live_proposal(world)
    proposal.status = Proposal.Status.WITHDRAWN
    proposal.save(update_fields=("status",))
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_an_estimate_the_customer_settled_stays_immutable(world: M2World) -> None:
    """The line is the Customer's decision, which is the whole point of moving off the clock.

    One proposal walked through the settled statuses rather than one requirement each: a second
    accepted invitation for the same vendor over the same dates is refused for capacity, which
    would fail this test for a reason that has nothing to do with what it is asserting.
    """
    proposal = _live_proposal(world)
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    for status in (
        Proposal.Status.SELECTED,
        Proposal.Status.ACCEPTED,
        Proposal.Status.LAPSED,
        Proposal.Status.REJECTED,
    ):
        proposal.status = status
        # `requirements_rejection_needs_reason` — a rejection without one is not a row.
        proposal.rejection_reason = (
            Proposal.RejectionReason.NOT_CHOSEN if status == Proposal.Status.REJECTED else ""
        )
        proposal.save(update_fields=("status", "rejection_reason"))

        with pytest.raises(RequirementTransitionError, match="can no longer be revised"):
            proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_an_expired_estimate_needs_the_customer_to_ask_before_it_is_revisable(
    world: M2World,
) -> None:
    """The one state that is still gated, and by an ask rather than a clock."""
    proposal = _live_proposal(world)
    proposal.status = Proposal.Status.EXPIRED
    proposal.save(update_fields=("status",))
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    with pytest.raises(RequirementTransitionError, match="can no longer be revised"):
        proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_a_revalidation_ask_on_an_expired_estimate_is_revisable(world: M2World) -> None:
    proposal = _live_proposal(world)
    proposal.status = Proposal.Status.EXPIRED
    proposal.revalidation_requested_at = timezone.now()
    proposal.save(update_fields=("status", "revalidation_requested_at"))
    requirement = proposal.requirement
    requirement.archetype = "A5_CUSTOM_PROJECT"

    proposals._assert_project_revision_allowed(previous=proposal, requirement=requirement)


def test_the_vendor_can_decline_and_only_once(world: M2World) -> None:
    proposal = _live_proposal(world)
    request = _open_request(world, proposal)

    declined = proposals.decline_revision_request(
        request_id=request.id, partner_id=world.vendor.id, note="The ceiling holds the lights."
    )

    assert declined.status == RevisionRequest.Status.DECLINED
    assert declined.resolved_at is not None
    with pytest.raises(RequirementTransitionError):
        proposals.decline_revision_request(
            request_id=request.id, partner_id=world.vendor.id, note=""
        )


def test_another_vendor_cannot_decline_it(world: M2World) -> None:
    proposal = _live_proposal(world)
    request = _open_request(world, proposal)

    with pytest.raises(Exception):  # noqa: B017 - the not-found refusal is the only outcome wanted
        proposals.decline_revision_request(
            request_id=request.id, partner_id=world.other_vendor.id, note=""
        )


def test_a_customer_cannot_ask_before_they_can_read_the_quotes(world: M2World) -> None:
    """The same entitlement that lets them read an A3 quote lets them ask about it."""
    proposal = _live_proposal(world)

    with pytest.raises(ProposalNotSelectableError):
        proposals.request_revision(
            requirement_id=proposal.requirement_id,
            proposal_id=proposal.id,
            actor=world.customer,
            reason_code=RevisionRequest.ReasonCode.OTHER,
            excluded_items=[],
            note="Cheaper tiles please.",
        )
