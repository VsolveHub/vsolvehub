"""The Customer chooses one vendor, and the clock that gives the vendor the last word.

Everything between "this quote, please" and the moment the vendor either commits or loses the
chance: the paywall applied where it decides something, the single-live-selection guard, the
decline and expiry paths that hand the requirement back with its entitlement untouched, and the
reconfirmation that re-runs every check from quoting time before it lets the vendor in.

The boundary: this module decides *whether* an engagement may open. What the engagement then **is**
— frozen terms, stage layout, the A3/A5 divergence — is `opening`, which this module calls at the
end of `reconfirm_selection` and which never calls back.
"""

import uuid
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.capabilities import assert_capability_active
from apps.requirements import access, matching, pricing
from apps.requirements.exceptions import (
    CapacityUnavailableError,
    ProposalNotSelectableError,
    ReconfirmationExpiredError,
    RequirementTransitionError,
    SelectionConflictError,
    UnlockRequiredError,
    VisitPlanRequiredError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    Proposal,
    ProposalSelection,
    VendorInvitation,
)
from apps.requirements.services import record_transition

from .base import A3, A5
from .opening import _open_engagement


def _assert_customer_may_select(requirement: CustomerRequirement) -> None:
    """The paywall, applied where it decides something rather than where it is displayed.

    A3 needs a paid unlock; A5 needs a charged plan. Checking it here rather than only on the read
    is the difference between hiding a button and enforcing a rule.
    """
    if requirement.archetype == A5:
        if access.charged_visit_plan(requirement) is None:
            raise VisitPlanRequiredError()
        return
    if access.active_unlock(requirement) is None:
        raise UnlockRequiredError()


@transaction.atomic
def select_proposal(
    *, requirement_id: uuid.UUID, proposal_id: uuid.UUID, actor: User
) -> ProposalSelection:
    """Choose one vendor (`M2-BE-407`).

    The requirement row is locked first and the uniqueness of a live selection is a database
    constraint, so two sessions racing produce one selection and one `m2_selection_conflict` — not
    two engagements against one requirement, which is the failure the withdrawn "multiple lots"
    allowance would have made routine.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    _assert_customer_may_select(requirement)

    if ProposalSelection.objects.filter(
        requirement=requirement,
        status__in=ProposalSelection.LIVE_STATUSES,
    ).exists():
        raise SelectionConflictError()

    proposal = (
        Proposal.objects.select_for_update(of=("self",))
        .select_related("invitation", "partner", "site_visit")
        .get(pk=proposal_id, requirement=requirement)
    )
    if proposal.status != Proposal.Status.SUBMITTED:
        raise ProposalNotSelectableError("This quote can no longer be selected.")
    if proposal.vendor_confirmed_at is None:
        raise ProposalNotSelectableError("This quote has not been confirmed by the vendor yet.")
    if proposal.valid_until is not None and proposal.valid_until <= timezone.now():
        raise ProposalNotSelectableError(
            "This quote's validity has passed. Ask the vendor to re-validate it.",
        )
    if requirement.archetype == A5 and proposal.site_visit_id is None:
        raise ProposalNotSelectableError("An estimate must come from a completed site visit.")

    selection = ProposalSelection.objects.create(
        requirement=requirement,
        proposal=proposal,
        partner=proposal.partner,
        reconfirm_by=pricing.reconfirmation_deadline(requirement),
    )
    proposal.status = Proposal.Status.SELECTED
    proposal.save(update_fields=("status", "updated_at"))
    from_status = requirement.status
    requirement.status = CustomerRequirement.Status.SELECTED
    requirement.save(update_fields=("status", "updated_at"))
    # The one command in M2 that commits a Customer to a named vendor, so the actor is recorded
    # rather than inferred from the requirement's owner: Operations can act on a Customer's behalf
    # elsewhere in this system, and "the Customer chose" and "somebody chose for them" must not be
    # the same row.
    record_transition(
        requirement=requirement,
        from_status=from_status,
        to_status=requirement.status,
        actor=actor,
        reason_code="proposal_selected",
        reason=f"proposal:{proposal.id} partner:{proposal.partner_id}",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.proposal.selected",
        idempotency_key=f"proposal-selected:{selection.id}",
        payload={
            "requirement_id": str(requirement.id),
            "selection_id": str(selection.id),
            "proposal_id": str(proposal.id),
        },
    )
    return selection


def _restore_after_failed_selection(requirement: CustomerRequirement) -> None:
    """Put the requirement back where the Customer can choose again, entitlement intact.

    A3 returns to `UNLOCKED` and A5 to `QUOTES_READY` — the two states in which the paywall is
    already satisfied. Neither the unlock nor the plan is touched: the Customer paid for access to
    a set of quotes, and a vendor who changed their mind does not take that away.
    """
    if requirement.status != CustomerRequirement.Status.SELECTED:
        return
    requirement.status = (
        CustomerRequirement.Status.UNLOCKED
        if requirement.archetype == A3
        else CustomerRequirement.Status.QUOTES_READY
    )
    requirement.save(update_fields=("status", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=CustomerRequirement.Status.SELECTED,
        to_status=requirement.status,
        actor=None,
        reason_code="selection_released",
        reason="entitlement preserved; no new charge",
    )


@transaction.atomic
def decline_selection(*, selection_id: uuid.UUID, reason_code: str) -> ProposalSelection:
    """The vendor says no after being chosen (`M2-BE-409`)."""
    selection = (
        ProposalSelection.objects.select_for_update()
        .select_related("requirement", "proposal")
        .get(pk=selection_id)
    )
    if selection.status != ProposalSelection.Status.PENDING_RECONFIRMATION:
        return selection
    selection.status = ProposalSelection.Status.DECLINED
    selection.decline_reason_code = reason_code or "vendor_declined"
    selection.decided_at = timezone.now()
    selection.save(update_fields=("status", "decline_reason_code", "decided_at", "updated_at"))
    _lapse_proposal(selection.proposal)
    requirement = CustomerRequirement.objects.select_for_update().get(pk=selection.requirement_id)
    _restore_after_failed_selection(requirement)
    return selection


@transaction.atomic
def expire_selection(*, selection_id: uuid.UUID) -> ProposalSelection:
    """The reconfirmation clock ran out. Idempotent by state, for overlapping sweeps."""
    selection = (
        ProposalSelection.objects.select_for_update()
        .select_related("requirement", "proposal")
        .get(pk=selection_id)
    )
    if selection.status != ProposalSelection.Status.PENDING_RECONFIRMATION:
        return selection
    selection.status = ProposalSelection.Status.EXPIRED
    selection.decided_at = timezone.now()
    selection.save(update_fields=("status", "decided_at", "updated_at"))
    _lapse_proposal(selection.proposal)
    requirement = CustomerRequirement.objects.select_for_update().get(pk=selection.requirement_id)
    _restore_after_failed_selection(requirement)
    return selection


def _lapse_proposal(proposal: Proposal) -> None:
    """`LAPSED`, never `REJECTED`.

    `REJECTED` is the Customer's refusal. A vendor reading "rejected" against their own timeout
    would be told the wrong story about their own standing, which is why
    `07-state-machines-and-permissions.md` §3 names the two ends of a selection separately.
    """
    if proposal.status == Proposal.Status.SELECTED:
        proposal.status = Proposal.Status.LAPSED
        proposal.save(update_fields=("status", "updated_at"))


def expired_selection_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        ProposalSelection.objects.filter(
            status=ProposalSelection.Status.PENDING_RECONFIRMATION,
            reconfirm_by__isnull=False,
            reconfirm_by__lt=moment,
        ).values_list("id", flat=True)
    )


@transaction.atomic
def reconfirm_selection(*, selection_id: uuid.UUID) -> Engagement:
    """The vendor commits, and the engagement opens (`M2-BE-408`, `411`, `412`).

    Everything is re-checked here rather than trusted from quoting time: the capability is
    re-asserted against the requirement's own area and start date, the vendor's diary is consulted
    again, and the quote's validity is re-read. A vendor whose approval lapsed between quoting and
    committing must not end up holding authorized money against unauthorized work.
    """
    selection = (
        ProposalSelection.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "proposal", "partner")
        .get(pk=selection_id)
    )
    if selection.status == ProposalSelection.Status.CONFIRMED:
        return Engagement.objects.get(selection=selection)
    if selection.status != ProposalSelection.Status.PENDING_RECONFIRMATION:
        raise RequirementTransitionError("This selection is no longer awaiting confirmation.")
    if selection.reconfirm_by is not None and selection.reconfirm_by <= timezone.now():
        # Expire it here rather than waiting for the sweep. A vendor arriving one minute late must
        # not find the door still open, and the Customer's requirement must not sit in `SELECTED`
        # until a tick notices.
        expire_selection(selection_id=selection.id)
        raise ReconfirmationExpiredError()

    requirement = CustomerRequirement.objects.select_for_update().get(pk=selection.requirement_id)
    proposal = selection.proposal
    if proposal.valid_until is not None and proposal.valid_until <= timezone.now():
        raise ProposalNotSelectableError("This quote's validity has passed.")

    # Re-check the capability against this requirement's area and start date. Not a duplicate of
    # the acceptance check: months of calendar and coverage changes can sit between the two.
    assert_capability_active(
        partner=selection.partner,
        variant=requirement.variant,
        service_area=requirement.service_area,
        on_day=(
            requirement.requested_start.date() if requirement.requested_start is not None else None
        ),
    )
    # The vendor's own diary, at the moment of commitment. `committed_capacity_partner_ids` reads
    # both notions of busy — M2 holds from other enquiries and A1 bookings on the shared grid —
    # and this vendor's own hold for *this* requirement is excluded by the invitation filter below.
    conflicting = matching.committed_capacity_partner_ids(
        requirement=requirement,
        partner_ids=[selection.partner_id],
    )
    if selection.partner_id in conflicting and not _hold_belongs_to_this_requirement(
        requirement=requirement, partner_id=selection.partner_id
    ):
        raise CapacityUnavailableError()

    selection.status = ProposalSelection.Status.CONFIRMED
    selection.decided_at = timezone.now()
    selection.save(update_fields=("status", "decided_at", "updated_at"))
    proposal.status = Proposal.Status.ACCEPTED
    proposal.save(update_fields=("status", "updated_at"))
    return _open_engagement(requirement=requirement, selection=selection, proposal=proposal)


def _hold_belongs_to_this_requirement(
    *, requirement: CustomerRequirement, partner_id: uuid.UUID
) -> bool:
    """Is the capacity conflict this vendor's own hold for this very job?

    Without this, reconfirmation would refuse every vendor whose soft hold it created itself at
    acceptance — the guard would fire on its own footprint.
    """
    return VendorInvitation.objects.filter(
        requirement=requirement,
        partner_id=partner_id,
        capacity_hold__status="ACTIVE",
    ).exists()
