"""Proposal submission, supersession and the teaser/usable classification.

Append-only by construction. A revision is a new row pointing at the one it supersedes, so a
Customer can always see what they were originally offered and a dispute can always be reconstructed.

Two guards here exist because the platform, not only the vendor, carries the consequence:

* an A3 rate below the statutory floor is refused at submission rather than argued about later;
* competing proposals for one requirement are forced onto a single tax basis, so a GST-registered
  vendor and an unregistered one produce comparable totals.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.capabilities import assert_rate_meets_wage_floor
from apps.partners.exceptions import WageFloorUnsetError
from apps.requirements import access, matching, pricing
from apps.requirements.exceptions import (
    ProposalNotSelectableError,
    ProposalShapeError,
    ProposalWindowClosedError,
    RejectionCapReachedError,
    RequirementNotFoundError,
    RequirementTransitionError,
    VisitNotCompletedError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    ProposalSelection,
    RequirementQuestion,
    SiteVisit,
    VendorInvitation,
    VisitPlanShare,
)
from apps.requirements.selectors import verified_partner_ids
from apps.requirements.services import record_transition

#: Digits that look like an Indian phone number, or an off-platform handle. A review signal only.
_CONTACT_PATTERN = re.compile(
    r"(\+?91[\s-]?)?[6-9]\d{9}|\b(whatsapp|whatsap|wa\.me|telegram|gpay|phonepe)\b",
    re.IGNORECASE,
)

#: A project estimate is editable only while the vendor is still correcting the
#: submission they just made. After this window it remains an offer the Customer
#: can act on, so any change belongs to a later engagement amendment rather than
#: a quietly replaced estimate.
ESTIMATE_REVISION_WINDOW = timedelta(minutes=5)


def estimate_revision_expires_at(proposal: Proposal) -> datetime:
    """The immutable end of an A5 estimate's correction window."""

    return proposal.submitted_at + ESTIMATE_REVISION_WINDOW


def _assert_project_revision_allowed(
    *, previous: Proposal | None, requirement: CustomerRequirement
) -> None:
    """Keep a rejected or settled A5 estimate immutable, and close editing after five minutes."""

    if (
        previous is None
        or requirement.archetype != ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
    ):
        return
    if previous.status != Proposal.Status.SUBMITTED:
        raise RequirementTransitionError(
            "This estimate can no longer be revised. You may only withdraw a live estimate "
            "until the Customer chooses it."
        )
    if timezone.now() >= estimate_revision_expires_at(previous):
        raise RequirementTransitionError(
            "An estimate can only be revised during the first 5 minutes after it is sent."
        )


@dataclass(frozen=True, slots=True)
class QuoteTeaser:
    """What a Customer sees before unlocking: never scope, identity or contact."""

    proposal_id: uuid.UUID
    vendor_type: str
    is_verified: bool
    price_band_low_paise: int
    price_band_high_paise: int
    usability: str


def _assert_a3_shape(payload: dict[str, Any]) -> None:
    """A workforce quote's total is its own arithmetic, and the server checks it.

    The reconciliation was missing until Wave C3 and its absence was a real defect rather than a
    tidiness gap. An A3 engagement lays out one stage per shift-day at `rate x workers`
    (`engagements._a3_stages`), so a vendor who quoted a total unrelated to their own rate
    produced an agreement whose stages could never add up to it — and `M2-BE-504` now makes that
    a database constraint, which would have turned a bad quote into a 500 at reconfirmation.

    Refused rather than silently derived. A composer whose displayed total quietly becomes a
    different number is worse than one that says which number is wrong, and the wage-floor guard
    beside this one only ever measured the *rate*: without this check a vendor could pass the
    statutory floor on paper and bill something else entirely.
    """
    missing = [
        field
        for field in ("rate_paise_per_worker_day", "minimum_days", "worker_count")
        if not payload.get(field)
    ]
    if missing:
        raise ProposalShapeError(
            "A workforce quote needs a daily rate, a minimum number of days and a headcount.",
        )
    if payload.get("stages"):
        raise ProposalShapeError("A workforce quote does not have project stages.")
    expected = (
        int(payload["rate_paise_per_worker_day"])
        * int(payload["worker_count"])
        * int(payload["minimum_days"])
    )
    if int(payload.get("total_paise") or 0) != expected:
        raise ProposalShapeError(
            "A workforce quote's total must be the daily rate times the headcount times the "
            "number of days.",
        )


def _assert_a5_shape(payload: dict[str, Any]) -> None:
    """Stages **and** material lines reconcile to the quoted total (`M2-BE-543`).

    Materials are their own row type since 1.26.0, and the reconciliation had to move with them
    or the guard would have refused every estimate that priced a bag of cement. Both sets are
    money the Customer pays, so both are inside `total_paise`; what separates them is that a
    material advance is *spent* and a work milestone is *earned*, which is a recovery rule rather
    than an arithmetic one.

    A material-only estimate is refused. "We will buy you materials and do no work" is not a
    project, and it is exactly the shape an advance-harvesting vendor would send.
    """
    stages = payload.get("stages") or []
    materials = payload.get("material_lines") or []
    if not stages:
        raise ProposalShapeError("A project quote needs at least one stage.")
    total = payload.get("total_paise") or 0
    stage_total = sum(int(stage.get("amount_paise", 0)) for stage in stages)
    material_total = sum(int(line.get("amount_paise", 0)) for line in materials)
    if stage_total + material_total != total:
        raise ProposalShapeError(
            "The stage and material amounts must add up to the quoted total.",
        )


def _assert_warranty_is_funded(*, requirement: CustomerRequirement, warranty_terms: str) -> None:
    """`M2-BE-546`: a variant either funds retention or does not advertise warranty.

    An estimate that promises a warranty is a promise the platform has to be able to stand behind
    at the end of the project, and the thing it stands behind it with is money held back out of
    the vendor's final payout. If Operations has not decided the retention percentage and the
    warranty window for this variant, there is nothing to hold and no window to hold it for — so
    the promise is refused at the composer rather than accepted and discovered to be empty at
    handover, which is the point at which nobody can do anything about it.

    An estimate with no warranty terms is unaffected and always has been. This refuses a claim,
    not a quote.
    """
    if not warranty_terms.strip():
        return
    # Raises `m2_policy_unavailable`, naming the missing decision.
    pricing.warranty_terms(requirement)


def _assert_completed_visit(
    *,
    invitation: VendorInvitation,
    site_visit_id: uuid.UUID | None,
) -> SiteVisit:
    """An A5 estimate must be priced on a visit this vendor actually completed (`M2-BE-424`).

    This is the guard the whole visit-first model rests on. The Customer paid a visit plan to buy
    somebody standing in the room; an estimate produced from a desk is exactly the guess revision 3
    exists to remove, so the estimate is refused rather than accepted with a caveat.

    Three separate refusals, deliberately not collapsed into one:

    - **No visit named at all.** The vendor reached the composer without one, which in practice
      means the client let them.
    - **A visit belonging to someone else.** Scoped to this invitation rather than to the
      requirement, because two vendors visit the same site under one plan and neither may price on
      the other's visit — the lookup is the authorization, so a foreign id reads as "not yours"
      rather than confirming a visit exists.
    - **A visit that is not `COMPLETED`.** `REQUESTED`, `SCHEDULED` and `IN_PROGRESS` all mean the
      visit has not happened yet, and `CANCELLED` means it never will.

    The last two both raise `VisitNotCompletedError`, because from the vendor's side the recovery is
    identical — complete the visit — and telling them which of the two it was would disclose whether
    another vendor's visit id exists.
    """
    if site_visit_id is None:
        raise VisitNotCompletedError(
            "Name the visit this estimate is based on before submitting it.",
        )

    visit = SiteVisit.objects.filter(pk=site_visit_id, invitation=invitation).first()
    if visit is None or visit.status != SiteVisit.Status.COMPLETED:
        raise VisitNotCompletedError()
    return visit


def classify_usability(*, requirement: CustomerRequirement, total_paise: int) -> str:
    """Usable, out of budget, or incomplete.

    An out-of-budget quote is labelled rather than hidden: the Customer decides whether a number
    above their band is still worth reading, and a silently dropped quote looks like no supply.
    """
    ceiling = requirement.budget_max_paise
    if ceiling is not None and total_paise > ceiling:
        return Proposal.Usability.OUT_OF_BUDGET
    return Proposal.Usability.USABLE


def assert_rate_meets_derived_wage_floor(
    *,
    requirement: CustomerRequirement,
    rate_paise_per_day: int,
) -> None:
    """Check an A3 rate against the floor for **this requirement's** state and skill.

    Both inputs are derived from the requirement and neither is accepted from the caller. That is
    the whole point of `M2-BE-317`: a vendor who could name their own wage classification or their
    own state could name the one with the lowest floor, and the platform — not only the vendor —
    carries the consequence of brokering labour below the statutory minimum.

    * **Skill** comes from `M2VariantConfiguration.wage_floor_skill`, the Operations-owned mapping
      on the same versioned row the requirement's answers were validated against.
    * **State** comes from `ServiceArea.state_code`, likewise Operations-owned. `Address.state`
      holds a free-text *name*; turning "Telangana" into whatever code Operations loaded the floors
      under would be a policy table living in code.

    **Fails closed.** An unmapped variant or an unmapped area raises `m2_wage_floor_unavailable`
    rather than skipping the check — skipping is the defect this closes, and a guard that silently
    does nothing is indistinguishable from one that passed.
    """
    configuration = requirement.configuration
    skill = configuration.wage_floor_skill if configuration is not None else None
    area = requirement.service_area
    state_code = area.state_code if area is not None else ""
    if skill is None or not state_code:
        raise WageFloorUnsetError()

    assert_rate_meets_wage_floor(
        state_code=state_code,
        skill=skill,
        on_day=(
            requirement.requested_start.date()
            if requirement.requested_start
            else timezone.localdate()
        ),
        rate_paise_per_day=rate_paise_per_day,
    )


def required_tax_basis(requirement: CustomerRequirement) -> str:
    """One basis per requirement, taken from whoever quoted first.

    Comparing a tax-inclusive total against a tax-exclusive one is the trap the comparison view
    cannot fix on the Customer's behalf, so it is prevented at submission.
    """
    existing = (
        Proposal.objects.filter(requirement=requirement)
        .exclude(status=Proposal.Status.WITHDRAWN)
        .order_by("submitted_at")
        .first()
    )
    return existing.tax_basis if existing is not None else ""


@transaction.atomic
def submit_proposal(
    *,
    invitation_id: uuid.UUID,
    total_paise: int,
    tax_basis: str,
    tax_paise: int = 0,
    rate_paise_per_worker_day: int | None = None,
    minimum_days: int | None = None,
    worker_count: int | None = None,
    stages: list[dict[str, Any]] | None = None,
    material_lines: list[dict[str, Any]] | None = None,
    inclusions: list[str] | None = None,
    exclusions: list[str] | None = None,
    warranty_terms: str = "",
    valid_until: Any = None,
    commission_treatment: str = "",
    site_visit_id: uuid.UUID | None = None,
    captured_by: User | None = None,
) -> Proposal:
    """Submit a first quote, or a revision that supersedes the vendor's previous one.

    The wage floor is **derived**, never passed in. Until 13 August this command took
    `wage_floor_skill` and `wage_floor_state_code` from its caller and skipped the check when they
    were absent, which is how `POST /api/v1/proposals/` came to document a refusal it could not
    make. Operations-assisted capture goes through this same command and gets the same derivation;
    `partners.assert_rate_meets_wage_floor` remains the explicit-inputs function for anything that
    genuinely needs to name a state and a skill.
    """
    # Selection and submission both lock the requirement first. That shared lock order closes the
    # race where a stale Partner tab could submit while the Customer was selecting another vendor:
    # exactly one command observes a live request, and the other observes its committed state.
    invitation_ref = VendorInvitation.objects.only("requirement_id").get(pk=invitation_id)
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration", "service_area", "variant")
        .get(pk=invitation_ref.requirement_id)
    )
    invitation = (
        VendorInvitation.objects.select_for_update(of=("self",))
        .select_related("snapshot", "partner")
        .get(pk=invitation_id)
    )
    invitation.requirement = requirement

    if invitation.status not in (
        VendorInvitation.Status.ACCEPTED,
        VendorInvitation.Status.QUOTED,
    ):
        raise RequirementTransitionError("Accept this enquiry before quoting on it.")
    if requirement.status in (
        CustomerRequirement.Status.SELECTED,
        CustomerRequirement.Status.ENGAGED,
    ):
        raise ProposalWindowClosedError()
    if requirement.status not in CustomerRequirement.LIVE_STATUSES:
        raise RequirementTransitionError("This request no longer accepts proposals.")

    payload: dict[str, Any] = {
        "rate_paise_per_worker_day": rate_paise_per_worker_day,
        "minimum_days": minimum_days,
        "worker_count": worker_count,
        "stages": stages or [],
        "material_lines": material_lines or [],
        "total_paise": total_paise,
    }
    site_visit: SiteVisit | None = None
    if requirement.archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK:
        if material_lines:
            raise ProposalShapeError("A workforce quote does not have material lines.")
        _assert_a3_shape(payload)
    else:
        _assert_a5_shape(payload)
        _assert_warranty_is_funded(requirement=requirement, warranty_terms=warranty_terms)
        site_visit = _assert_completed_visit(invitation=invitation, site_visit_id=site_visit_id)

    required_basis = required_tax_basis(requirement)
    if required_basis and tax_basis != required_basis:
        raise ProposalShapeError(
            f"Quotes for this request are compared {required_basis.lower()} of tax.",
        )

    # A3 only. An A5 estimate is a price for an outcome, not a rate per worker per day, so there is
    # no statutory floor to measure it against.
    if (
        requirement.archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK
        and rate_paise_per_worker_day is not None
    ):
        assert_rate_meets_derived_wage_floor(
            requirement=requirement,
            rate_paise_per_day=rate_paise_per_worker_day,
        )

    # The **highest revision**, not the live one. Until Wave C2 this read `status=SUBMITTED`, which
    # was right while every supersession followed a live quote and wrong the moment `M2-BE-410` let
    # a vendor re-validate an `EXPIRED` one: `previous` came back `None`, the new row was numbered
    # revision 1 again, and `requirements_unique_proposal_revision` refused it. Numbering from the
    # chain rather than from the live row also keeps `supersedes` unbroken across an expiry, which
    # is what a dispute reads to reconstruct what this vendor offered and when.
    previous = (
        Proposal.objects.select_for_update()
        .filter(invitation=invitation)
        .order_by("-revision")
        .first()
    )
    _assert_project_revision_allowed(previous=previous, requirement=requirement)
    if previous is not None and previous.status == Proposal.Status.SUBMITTED:
        previous.status = Proposal.Status.SUPERSEDED
        previous.save(update_fields=("status", "updated_at"))

    proposal = Proposal.objects.create(
        requirement=requirement,
        invitation=invitation,
        partner=invitation.partner,
        snapshot=invitation.snapshot,
        site_visit=site_visit,
        supersedes=previous,
        revision=(previous.revision + 1) if previous is not None else 1,
        status=Proposal.Status.SUBMITTED,
        usability=classify_usability(requirement=requirement, total_paise=total_paise),
        rate_paise_per_worker_day=rate_paise_per_worker_day,
        minimum_days=minimum_days,
        worker_count=worker_count,
        total_paise=total_paise,
        tax_paise=tax_paise,
        tax_basis=tax_basis,
        commission_treatment=commission_treatment,
        inclusions=inclusions or [],
        exclusions=exclusions or [],
        stages=stages or [],
        material_lines=material_lines or [],
        warranty_terms=warranty_terms,
        valid_until=valid_until,
        captured_by=captured_by,
        vendor_confirmed_at=None if captured_by is not None else timezone.now(),
    )

    if invitation.status != VendorInvitation.Status.QUOTED:
        invitation.status = VendorInvitation.Status.QUOTED
        invitation.save(update_fields=("status", "updated_at"))

    if site_visit is not None:
        # The A5 vendor has now delivered what the Customer's plan bought — a completed visit and a
        # usable estimate — so the share is earned here rather than waiting for a sweep to notice.
        # `settle_share_for_estimate` re-checks usability and share state itself, so an
        # out-of-budget estimate or a share somebody already settled changes nothing.
        access.settle_share_for_estimate(proposal=proposal)

    _promote_requirement_when_quoted(requirement)
    _announce_proposal(proposal)
    return proposal


def _announce_proposal(proposal: Proposal) -> None:
    """Tell the Customer a quote has landed — the single most important M2 notice.

    ## Why this event had to be added rather than routed

    `submit_proposal` wrote the `Proposal`, marked the invitation `QUOTED` and let
    `_promote_requirement_when_quoted` move the requirement to `QUOTES_READY` — a status column
    changing with no announcement of any kind. The whole point of A5 is that the Customer pays to
    unlock what a vendor estimated, and nothing told them there was anything to unlock. It was not
    a notification that failed to deliver; it was a notification nobody ever asked for.

    ## Why it is gated on vendor confirmation rather than on the row existing

    A quote Operations captured by phone is not shown to the Customer until the vendor confirms it
    (`confirm_captured_proposal`), and `teasers_for` filters on exactly that. Announcing at
    creation would put a notice in the feed pointing at a quotes screen that still shows nothing —
    so the announcement is made from wherever confirmation actually happens, and both call sites
    share this one function.

    ## Why every confirmed proposal is announced, usable or not

    `teasers_for` publishes every vendor-confirmed proposal and lets the Customer see its
    usability, so a quote outside their budget is still a real thing that arrived and is still on
    the screen this notice opens. Announcing only the usable ones would leave a Customer looking
    at three teasers having been told about one.

    Idempotent on the proposal id, so the re-drive an outbox retry performs — and the second call
    a superseding revision would make — writes at most one notice per quote.
    """

    if proposal.vendor_confirmed_at is None:
        return
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=proposal.requirement_id,
        event_type="m2.proposal.submitted",
        idempotency_key=f"proposal-submitted:{proposal.id}",
        payload={
            "requirement_id": str(proposal.requirement_id),
            "vendor_invitation_id": str(proposal.invitation_id),
            "proposal_id": str(proposal.id),
            "usability": proposal.usability,
            "revision": proposal.revision,
        },
    )


@transaction.atomic
def confirm_captured_proposal(*, proposal_id: uuid.UUID) -> Proposal:
    """The vendor confirms a quote Operations took by phone.

    Until this runs the quote is not shown to the Customer. Operations assists; it never becomes
    the vendor.
    """
    proposal = Proposal.objects.select_for_update().get(pk=proposal_id)
    if proposal.captured_by is None:
        raise RequirementTransitionError("This quote was not captured on your behalf.")
    if proposal.vendor_confirmed_at is None:
        proposal.vendor_confirmed_at = timezone.now()
        proposal.save(update_fields=("vendor_confirmed_at", "updated_at"))
        _promote_requirement_when_quoted(proposal.requirement)
        # Confirmation is the moment this quote becomes visible, so it is the moment it is
        # announced. `submit_proposal` announced nothing for a captured quote precisely because
        # `vendor_confirmed_at` was still null when it ran.
        _announce_proposal(proposal)
    return proposal


#: The two states a first usable quote or estimate can promote *from*. `MATCHING` is A3's path —
#: a remote quote arrives and the teaser screen becomes real. `VISITS_BOOKED` is A5's, added with
#: revision 3: the plan was charged when a vendor confirmed a slot, and the requirement only
#: reaches `QUOTES_READY` when that visit actually produces something to read
#: (`07-state-machines-and-permissions.md` §1). Without the second entry an A5 requirement would
#: sit in `VISITS_BOOKED` forever and the Customer could never select.
_PROMOTABLE_TO_QUOTES_READY = (
    CustomerRequirement.Status.MATCHING,
    CustomerRequirement.Status.VISITS_BOOKED,
)


def _promote_requirement_when_quoted(requirement: CustomerRequirement) -> None:
    """Move to QUOTES_READY the moment a usable, vendor-confirmed quote or estimate exists."""
    if requirement.status not in _PROMOTABLE_TO_QUOTES_READY:
        return
    has_usable = Proposal.objects.filter(
        requirement=requirement,
        status=Proposal.Status.SUBMITTED,
        usability=Proposal.Usability.USABLE,
        vendor_confirmed_at__isnull=False,
    ).exists()
    if has_usable:
        from_status = requirement.status
        requirement.status = CustomerRequirement.Status.QUOTES_READY
        requirement.save(update_fields=("status", "updated_at"))
        record_transition(
            requirement=requirement,
            from_status=from_status,
            to_status=requirement.status,
            actor=None,
            reason_code="first_usable_quote_delivered",
        )


@transaction.atomic
def withdraw_proposal(*, proposal_id: uuid.UUID) -> Proposal:
    # Selection locks the requirement before the proposal. Use the same order
    # here so a withdrawal and a Customer choice cannot cross in flight and both
    # succeed against the same live estimate.
    requirement_id = Proposal.objects.only("requirement_id").get(pk=proposal_id).requirement_id
    CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    proposal = Proposal.objects.select_for_update().get(pk=proposal_id)
    if proposal.status != Proposal.Status.SUBMITTED:
        raise RequirementTransitionError("Only a live quote can be withdrawn.")
    proposal.status = Proposal.Status.WITHDRAWN
    proposal.save(update_fields=("status", "updated_at"))
    return proposal


@transaction.atomic
def expire_proposal(*, proposal_id: uuid.UUID) -> Proposal:
    """Retire a quote whose own validity date has passed.

    Idempotent by state rather than by key, because the caller is a sweep with no actor: anything
    that is no longer `SUBMITTED` is returned untouched, so overlapping runs settle on one outcome.

    Two things this deliberately does **not** do. It does not move the requirement back from
    `QUOTES_READY` — `07-state-machines-and-permissions.md` §1 has no such transition, and the
    unlock command already re-checks that a usable quote is still live, which is the moment the
    answer actually matters. And it does not release the invitation's quote slot: the vendor is
    still a vendor who engaged, and `M2-BE-410`'s re-validation path is how an expired quote comes
    back to life without a second charge. Inventing either here would put a transition in a sweep
    that the state machine does not carry.
    """
    proposal = Proposal.objects.select_for_update().get(pk=proposal_id)
    if proposal.status != Proposal.Status.SUBMITTED:
        return proposal
    proposal.status = Proposal.Status.EXPIRED
    proposal.save(update_fields=("status", "updated_at"))
    return proposal


# ---------------------------------------------------------------------------
# Customer rejection and re-validation (`M2-BE-406`, `409`, `410`)
# ---------------------------------------------------------------------------


def non_responsive_rejection_count(requirement: CustomerRequirement) -> int:
    """How many free replacements this Customer has already used.

    Counted from `Proposal` rows rather than from a stored tally, because the rows are what an
    appeal and a vendor-standing review actually read. `QuoteUnlock.non_responsive_rejection_count`
    is kept in step below as the unlock's own snapshot — it is a mirror, and this is the source.
    """
    return Proposal.objects.filter(
        requirement=requirement,
        status=Proposal.Status.REJECTED,
        rejection_reason=Proposal.RejectionReason.NON_RESPONSIVE,
    ).count()


def _release_slot_and_replace(*, proposal: Proposal, reason_code: str) -> None:
    """Give the quote slot back and invite one vendor to take it.

    `withdraw_invitation` rather than `decline_invitation`: a decline is the *vendor's* word, and
    recording a Customer's rejection as the vendor declining would put the wrong party's name on
    the exit. Withdrawal is the penalty-free release the invitation machine already models, and it
    releases the same capacity hold.

    The replacement wave is sized to the one slot that was just freed. `invite_wave` refuses on a
    requirement that is no longer live, so a rejection made moments after the needed-by date passes
    releases the slot and invites nobody, rather than raising into the Customer's response.
    """
    matching.withdraw_invitation(invitation_id=proposal.invitation_id, reason_code=reason_code)
    requirement = proposal.requirement
    if requirement.status in CustomerRequirement.LIVE_STATUSES:
        matching.invite_wave(requirement_id=requirement.id, size=1)


@transaction.atomic
def reject_proposal(
    *,
    requirement_id: uuid.UUID,
    proposal_id: uuid.UUID,
    reason: str,
    actor: User,
    note: str = "",
) -> Proposal:
    """The Customer refuses a quote or estimate (`M2-BE-406`).

    Two reasons, and only one of them costs anybody anything:

    * **`NOT_CHOSEN`** is bookkeeping. The Customer preferred somebody else, the quote stops being
      selectable, and nothing else happens — no slot is reopened, no cap is consumed and the
      vendor's standing is untouched, because losing is not misconduct.
    * **`NON_RESPONSIVE`** is the control against slot squatting: a deliberately junk-but-complete
      quote both looks responsive and blocks a competitor. It releases the slot and buys a
      replacement **at no extra charge** — for A3 a new quote slot, for A5 a free replacement visit
      on the same plan share — and it is capped, because a mechanism that hands out free
      replacements without a limit is a mechanism that gets farmed.

    The cap is `M2VariantConfiguration.non_responsive_rejection_cap` and **fails closed**: while the
    owner has not set it, `m2_policy_unavailable` refuses the *free replacement*, not the rejection
    itself. A Customer can always refuse a quote; what an unset policy blocks is Vsolve promising a
    replacement it has not decided the terms of.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    if reason not in Proposal.RejectionReason.values:
        raise ProposalShapeError("That is not a rejection reason we record.")

    proposal = (
        Proposal.objects.select_for_update(of=("self",))
        .select_related("requirement", "invitation", "site_visit__plan_share")
        .get(pk=proposal_id, requirement=requirement)
    )
    if proposal.status != Proposal.Status.SUBMITTED:
        raise ProposalNotSelectableError("This quote can no longer be rejected.")

    is_non_responsive = reason == Proposal.RejectionReason.NON_RESPONSIVE
    if is_non_responsive:
        # Read the cap before writing anything. Refusing halfway would leave a rejected quote with
        # no replacement behind it and no way for the Customer to tell which of the two happened.
        cap = pricing.non_responsive_rejection_cap(requirement)
        if non_responsive_rejection_count(requirement) >= cap:
            raise RejectionCapReachedError()

    proposal.status = Proposal.Status.REJECTED
    proposal.rejection_reason = reason
    proposal.save(update_fields=("status", "rejection_reason", "updated_at"))

    if not is_non_responsive:
        return proposal

    _mirror_rejection_count_on_unlock(requirement)
    visit = proposal.site_visit
    share = visit.plan_share if visit is not None else None
    if share is not None:
        # A5: the share this vendor consumed owes a **free replacement visit**, so it goes back to
        # `REPLACED` rather than `OPEN`. The distinction is money, not vocabulary — `REPLACED` is
        # a slot the Customer already paid for and has not received, and the visit-SLA sweep
        # refunds it if nobody ever takes it.
        _revert_share_for_replacement(share)
    _release_slot_and_replace(proposal=proposal, reason_code="non_responsive_quote")
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="proposal_rejected_non_responsive",
        reason=f"proposal:{proposal.id} partner:{proposal.partner_id} {note}".strip(),
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.proposal.rejected",
        idempotency_key=f"proposal-rejected:{proposal.id}",
        payload={
            "requirement_id": str(requirement.id),
            "proposal_id": str(proposal.id),
            "partner_id": str(proposal.partner_id),
            "reason": reason,
        },
    )
    return proposal


def _revert_share_for_replacement(share: VisitPlanShare) -> None:
    """Owe a free replacement visit on a share whose estimate was refused."""
    locked = VisitPlanShare.objects.select_for_update().get(pk=share.pk)
    if locked.status != VisitPlanShare.Status.COMMITTED:
        return
    locked.status = VisitPlanShare.Status.REPLACED
    locked.partner = None
    locked.settlement_reason_code = "non_responsive_estimate"
    locked.save(update_fields=("status", "partner", "settlement_reason_code", "updated_at"))


def _mirror_rejection_count_on_unlock(requirement: CustomerRequirement) -> None:
    unlock = access.active_unlock(requirement)
    if unlock is None:
        return
    unlock.non_responsive_rejection_count = non_responsive_rejection_count(requirement)
    unlock.save(update_fields=("non_responsive_rejection_count", "updated_at"))


@transaction.atomic
def request_revalidation(
    *, requirement_id: uuid.UUID, proposal_id: uuid.UUID, actor: User
) -> Proposal:
    """Ask a vendor to re-validate a quote whose validity elapsed (`M2-BE-410`).

    **Expiry must not be a dead end that forces a second purchase.** The Customer already bought
    access to this vendor's quote — the A3 unlock, or the A5 visit that produced the estimate — and
    a date passing is not a new sale. This command therefore charges nothing and creates nothing: it
    stamps the request on the proposal and asks the vendor, who answers by superseding it through
    `submit_proposal`. The new revision lands under the same unlock or plan.

    Deliberately **not** a re-open. The expired row stays `EXPIRED` and stays unselectable; only a
    vendor can put a live price back on the table, because a price is the vendor's statement.
    """
    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("configuration")
        .get(pk=requirement_id)
    )
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    if not access.customer_may_read_full_quotes(requirement):
        # The same entitlement that lets them read the quote lets them ask about it. Without this a
        # requirement id would be enough to poke a vendor on a quote the caller never bought.
        raise ProposalNotSelectableError("Unlock this request's quotes before asking about them.")
    if ProposalSelection.objects.filter(
        requirement=requirement,
        status__in=ProposalSelection.LIVE_STATUSES,
    ).exists():
        raise ProposalNotSelectableError("This request already has a chosen vendor.")

    proposal = Proposal.objects.select_for_update().get(pk=proposal_id, requirement=requirement)
    now = timezone.now()
    is_expired = proposal.status == Proposal.Status.EXPIRED or (
        proposal.status == Proposal.Status.SUBMITTED
        and proposal.valid_until is not None
        and proposal.valid_until <= now
    )
    if not is_expired:
        raise ProposalNotSelectableError("This quote has not expired, so it can still be selected.")
    if proposal.revalidation_requested_at is not None:
        # Idempotent by state. A second tap re-reads the first request rather than sending the
        # vendor a duplicate, and the vendor's answer is a supersession either way.
        return proposal

    proposal.revalidation_requested_at = now
    proposal.save(update_fields=("revalidation_requested_at", "updated_at"))
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="revalidation_requested",
        reason=f"proposal:{proposal.id} partner:{proposal.partner_id}",
    )
    enqueue_outbox_event(
        aggregate_type="requirement",
        aggregate_id=requirement.id,
        event_type="m2.proposal.revalidation_requested",
        idempotency_key=f"proposal-revalidation:{proposal.id}",
        payload={
            "requirement_id": str(requirement.id),
            "proposal_id": str(proposal.id),
            "partner_id": str(proposal.partner_id),
            "invitation_id": str(proposal.invitation_id),
        },
    )
    return proposal


def expired_proposal_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        Proposal.objects.filter(
            status=Proposal.Status.SUBMITTED,
            valid_until__isnull=False,
            valid_until__lt=moment,
        ).values_list("id", flat=True)
    )


def teasers_for(requirement: CustomerRequirement) -> list[QuoteTeaser]:
    """The pre-unlock view. Deliberately omits scope, vendor identity and contact.

    The price *band* is the point: enough for the Customer to judge whether unlocking is worth it,
    not enough to act on without unlocking.
    """
    proposals = list(
        Proposal.objects.filter(
            requirement=requirement,
            status=Proposal.Status.SUBMITTED,
            vendor_confirmed_at__isnull=False,
        )
        .select_related("partner", "partner__business_profile")
        .order_by("total_paise")
    )
    # The badge, from the only thing that verifies a Partner. It read `True` for every teaser until
    # 1.26.0 — a small lie on one of the four signals a Customer weighs before paying INR 149, and
    # a badge that is always on is not a badge. Batched because a teaser list is a list.
    verified = verified_partner_ids([proposal.partner_id for proposal in proposals])

    teasers: list[QuoteTeaser] = []
    for proposal in proposals:
        band = max(int(proposal.total_paise * 0.1), 1)
        business = getattr(proposal.partner, "business_profile", None)
        teasers.append(
            QuoteTeaser(
                proposal_id=proposal.id,
                vendor_type=(business.business_type if business is not None else "INDIVIDUAL"),
                is_verified=proposal.partner_id in verified,
                price_band_low_paise=proposal.total_paise - band,
                price_band_high_paise=proposal.total_paise + band,
                usability=proposal.usability,
            )
        )
    return teasers


def looks_like_contact_sharing(text: str) -> bool:
    """A review signal, never proof and never an automatic penalty."""
    return bool(_CONTACT_PATTERN.search(text))


#: How many questions one asker may leave **unanswered** on one enquiry thread before they have to
#: wait (`M2-BE-803`, clarification abuse).
#:
#: A cap on the open ones rather than on the total, because the two describe different behaviour. A
#: total cap punishes a long, healthy back-and-forth over a complicated site — exactly the
#: conversation clarification exists to support — while leaving a burst of thirty unanswered
#: messages under the limit for the first thirty. A cap on the *unanswered* count is the shape of
#: the abuse: it is unbounded only for somebody who is not waiting for a reply.
#:
#: It is also the control a rate limit cannot express. `m2_clarification` at 60/hour is the second
#: layer and catches a script writing to many threads; neither one catches what the other does.
#:
#: Deliberately **not** an `M2VariantConfiguration` column. It is not an owner decision — nothing
#: about the commercial model changes with it, no money moves on it, and adding it to the
#: configuration table would mean one more column that fails closed while unset and one more row
#: for `seed_m2_demo` to write, to express "be reasonable".
MAXIMUM_OPEN_QUESTIONS_PER_THREAD = 3


def _assert_thread_not_flooded(*, invitation: VendorInvitation, asked_by: User) -> None:
    """Refuse a new question while this asker already has too many waiting on this enquiry.

    Scoped to the asker as well as the thread, so a vendor's three open questions never stop the
    Customer from asking one. The two directions of clarification are separate conversations that
    happen to share a table.
    """
    open_questions = RequirementQuestion.objects.filter(
        invitation=invitation,
        asked_by=asked_by,
        answered_at__isnull=True,
    ).count()
    if open_questions >= MAXIMUM_OPEN_QUESTIONS_PER_THREAD:
        raise RequirementTransitionError(
            f"You have {open_questions} questions here still waiting for an answer. "
            "Wait for a reply before asking another.",
        )


@transaction.atomic
def ask_question(*, invitation_id: uuid.UUID, asked_by: User, question: str) -> RequirementQuestion:
    """Structured clarification: one question, answered once, on the shared timeline."""
    invitation = VendorInvitation.objects.select_related("requirement").get(pk=invitation_id)
    if invitation.requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    _assert_thread_not_flooded(invitation=invitation, asked_by=asked_by)

    return RequirementQuestion.objects.create(
        requirement=invitation.requirement,
        invitation=invitation,
        asked_by=asked_by,
        question=question,
        contact_sharing_flagged=looks_like_contact_sharing(question),
    )


@transaction.atomic
def ask_vendor_question(
    *, proposal_id: uuid.UUID, asked_by: User, question: str
) -> RequirementQuestion:
    """The Customer's half of clarification, which did not exist until 1.26.0 (`M2-FE-409`).

    Clarification ran one way. A vendor could ask about the requirement; a Customer reading three
    quotes and wanting to know what "site clearance excluded" covers had nowhere to put the
    question, and the screen had to say so.

    Two shape decisions, both about who a question is addressed to:

    * **It hangs off a proposal, not off the requirement.** A question aimed at nobody in
      particular is a broadcast to a pool, and a vendor who has already quoted has no reason to
      answer one. Naming the proposal names the vendor, and reuses the existing
      `RequirementQuestion.invitation` link rather than making it nullable.
    * **It is gated on the paywall.** Before the unlock (A3) or the charged plan (A5) the vendors
      are deliberately not addressable — that is the entire teaser rule — so asking one a question
      would be a channel around the fee. `assert_customer_may_read_full_quotes` raises the
      archetype's own refusal.

    Nothing here changes a price. A vendor's answer is text; a new number is a supersession.
    """
    proposal = (
        Proposal.objects.select_related("requirement", "invitation").filter(pk=proposal_id).first()
    )
    if proposal is None:
        raise RequirementNotFoundError()
    requirement = proposal.requirement
    if requirement.customer_id != asked_by.id:
        raise RequirementNotFoundError()
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")
    access.assert_customer_may_read_full_quotes(requirement)
    _assert_thread_not_flooded(invitation=proposal.invitation, asked_by=asked_by)

    return RequirementQuestion.objects.create(
        requirement=requirement,
        invitation=proposal.invitation,
        asked_by=asked_by,
        question=question,
        contact_sharing_flagged=looks_like_contact_sharing(question),
    )


@transaction.atomic
def answer_question(
    *, question_id: uuid.UUID, answered_by: User, answer: str
) -> RequirementQuestion:
    record = RequirementQuestion.objects.select_for_update().get(pk=question_id)
    if record.answered_at is not None:
        raise RequirementTransitionError("This question has already been answered.")
    if not answer.strip():
        raise RequirementTransitionError("An answer cannot be empty.")

    record.answer = answer
    record.answered_by = answered_by
    record.answered_at = timezone.now()
    if looks_like_contact_sharing(answer):
        record.contact_sharing_flagged = True
    record.save(update_fields=("answer", "answered_by", "answered_at", "contact_sharing_flagged"))
    return record


@transaction.atomic
def request_site_visit(
    *, invitation_id: uuid.UUID, fee_paise: int, adjusts_against_final_price: bool = True
) -> SiteVisit:
    """A paid visit. The fee is what makes a vendor willing to travel before winning the job."""
    if fee_paise <= 0:
        raise ProposalShapeError("A site visit needs a fee. Free visits are not offered.")

    invitation = VendorInvitation.objects.select_related("requirement").get(pk=invitation_id)
    return SiteVisit.objects.create(
        requirement=invitation.requirement,
        invitation=invitation,
        fee_paise=fee_paise,
        adjusts_against_final_price=adjusts_against_final_price,
    )


@transaction.atomic
def schedule_site_visit(*, site_visit_id: uuid.UUID, scheduled_for: Any) -> SiteVisit:
    """Put a time on a visit, or move one — and move its grid reservation with it.

    **The reservation half was a live defect until 1.26.0.** An A5 plan visit is not only a row
    with a `scheduled_for`: `confirm_visit_slot` writes an `assignments.Reservation` over the
    instants it occupies, and that reservation is the entire reason a visit and an A1 booking
    cannot double-book. Moving the timestamp without moving the reservation left the vendor's
    diary blocked at a time nobody was coming and open at the time they were — so a Tuesday
    reschedule could be double-booked by the A1 checkout that same afternoon, and the exclusion
    constraint would never see it.

    A plan visit therefore reschedules through the **same grid** it was booked on, and refuses
    with `m2_visit_slot_unavailable` when the new time is not free for that vendor. An ad-hoc A3
    visit holds no reservation and keeps the simple move below — it is an agreement between two
    people about when somebody will travel, not a claim on shared capacity.
    """
    visit = (
        SiteVisit.objects.select_for_update()
        .select_related("requirement", "invitation__partner")
        .get(pk=site_visit_id)
    )
    if visit.status not in (SiteVisit.Status.REQUESTED, SiteVisit.Status.SCHEDULED):
        raise RequirementTransitionError("This visit can no longer be scheduled.")

    if visit.plan_share_id is not None:
        return access.reschedule_plan_visit(visit=visit, scheduled_for=scheduled_for)

    visit.status = SiteVisit.Status.SCHEDULED
    visit.scheduled_for = scheduled_for
    visit.save(update_fields=("status", "scheduled_for", "updated_at"))
    return visit


@transaction.atomic
def complete_site_visit(*, site_visit_id: uuid.UUID, outcome_notes: str = "") -> SiteVisit:
    """Close a visit that happened. One command, two shapes.

    An **A5 plan visit** is handed to `access.complete_plan_visit`, which does everything this does
    and additionally stamps `estimate_due_at` — the post-visit window inside which an estimate must
    land, and the clock the estimate-or-refund sweep reads. Dispatching here rather than in a view
    is deliberate: which command a visit needs is a property of the visit, and a router that had to
    know would be the place the two paths drift.

    An **ad-hoc A3 visit** keeps the simpler close below. It carries no plan share, so there is no
    window to open and nothing to settle.
    """
    if SiteVisit.objects.filter(pk=site_visit_id, plan_share__isnull=False).exists():
        return access.complete_plan_visit(site_visit_id=site_visit_id, outcome_notes=outcome_notes)

    visit = SiteVisit.objects.select_for_update().get(pk=site_visit_id)
    if visit.status != SiteVisit.Status.IN_PROGRESS:
        raise RequirementTransitionError(
            "Enter the Customer's arrival code before completing this visit."
        )
    visit.status = SiteVisit.Status.COMPLETED
    visit.completed_at = timezone.now()
    visit.outcome_notes = outcome_notes
    visit.save(update_fields=("status", "completed_at", "outcome_notes", "updated_at"))
    return visit
