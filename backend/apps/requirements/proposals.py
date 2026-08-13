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
from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.partners.capabilities import assert_rate_meets_wage_floor
from apps.partners.exceptions import WageFloorUnsetError
from apps.requirements.exceptions import (
    ProposalShapeError,
    RequirementTransitionError,
    VisitNotCompletedError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementQuestion,
    SiteVisit,
    VendorInvitation,
)

#: Digits that look like an Indian phone number, or an off-platform handle. A review signal only.
_CONTACT_PATTERN = re.compile(
    r"(\+?91[\s-]?)?[6-9]\d{9}|\b(whatsapp|whatsap|wa\.me|telegram|gpay|phonepe)\b",
    re.IGNORECASE,
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


def _assert_a5_shape(payload: dict[str, Any]) -> None:
    stages = payload.get("stages") or []
    if not stages:
        raise ProposalShapeError("A project quote needs at least one stage.")
    total = payload.get("total_paise") or 0
    stage_total = sum(int(stage.get("amount_paise", 0)) for stage in stages)
    if stage_total != total:
        raise ProposalShapeError(
            "The stage amounts must add up to the quoted total.",
        )


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


def _required_tax_basis(requirement: CustomerRequirement) -> str:
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
    invitation = (
        VendorInvitation.objects.select_for_update()
        .select_related(
            "requirement__configuration", "requirement__service_area", "snapshot", "partner"
        )
        .get(pk=invitation_id)
    )
    requirement = invitation.requirement

    if invitation.status not in (
        VendorInvitation.Status.ACCEPTED,
        VendorInvitation.Status.QUOTED,
    ):
        raise RequirementTransitionError("Accept this enquiry before quoting on it.")
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")

    payload: dict[str, Any] = {
        "rate_paise_per_worker_day": rate_paise_per_worker_day,
        "minimum_days": minimum_days,
        "worker_count": worker_count,
        "stages": stages or [],
        "total_paise": total_paise,
    }
    site_visit: SiteVisit | None = None
    if requirement.archetype == ServiceVariant.BookingArchetype.A3_TIME_BLOCK:
        _assert_a3_shape(payload)
    else:
        _assert_a5_shape(payload)
        site_visit = _assert_completed_visit(invitation=invitation, site_visit_id=site_visit_id)

    required_basis = _required_tax_basis(requirement)
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

    previous = (
        Proposal.objects.select_for_update()
        .filter(invitation=invitation, status=Proposal.Status.SUBMITTED)
        .first()
    )
    if previous is not None:
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
        warranty_terms=warranty_terms,
        valid_until=valid_until,
        captured_by=captured_by,
        vendor_confirmed_at=None if captured_by is not None else timezone.now(),
    )

    if invitation.status != VendorInvitation.Status.QUOTED:
        invitation.status = VendorInvitation.Status.QUOTED
        invitation.save(update_fields=("status", "updated_at"))

    _promote_requirement_when_quoted(requirement)
    return proposal


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
    return proposal


def _promote_requirement_when_quoted(requirement: CustomerRequirement) -> None:
    """Move to QUOTES_READY the moment a usable, vendor-confirmed quote exists."""
    if requirement.status != CustomerRequirement.Status.MATCHING:
        return
    has_usable = Proposal.objects.filter(
        requirement=requirement,
        status=Proposal.Status.SUBMITTED,
        usability=Proposal.Usability.USABLE,
        vendor_confirmed_at__isnull=False,
    ).exists()
    if has_usable:
        requirement.status = CustomerRequirement.Status.QUOTES_READY
        requirement.save(update_fields=("status", "updated_at"))


@transaction.atomic
def withdraw_proposal(*, proposal_id: uuid.UUID) -> Proposal:
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
    proposals = (
        Proposal.objects.filter(
            requirement=requirement,
            status=Proposal.Status.SUBMITTED,
            vendor_confirmed_at__isnull=False,
        )
        .select_related("partner")
        .order_by("total_paise")
    )

    teasers: list[QuoteTeaser] = []
    for proposal in proposals:
        band = max(int(proposal.total_paise * 0.1), 1)
        business = getattr(proposal.partner, "business_profile", None)
        teasers.append(
            QuoteTeaser(
                proposal_id=proposal.id,
                vendor_type=(business.business_type if business is not None else "INDIVIDUAL"),
                is_verified=True,
                price_band_low_paise=proposal.total_paise - band,
                price_band_high_paise=proposal.total_paise + band,
                usability=proposal.usability,
            )
        )
    return teasers


def looks_like_contact_sharing(text: str) -> bool:
    """A review signal, never proof and never an automatic penalty."""
    return bool(_CONTACT_PATTERN.search(text))


@transaction.atomic
def ask_question(*, invitation_id: uuid.UUID, asked_by: User, question: str) -> RequirementQuestion:
    """Structured clarification: one question, answered once, on the shared timeline."""
    invitation = VendorInvitation.objects.select_related("requirement").get(pk=invitation_id)
    if invitation.requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise RequirementTransitionError("This request is closed.")

    return RequirementQuestion.objects.create(
        requirement=invitation.requirement,
        invitation=invitation,
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
    visit = SiteVisit.objects.select_for_update().get(pk=site_visit_id)
    if visit.status not in (SiteVisit.Status.REQUESTED, SiteVisit.Status.SCHEDULED):
        raise RequirementTransitionError("This visit can no longer be scheduled.")
    visit.status = SiteVisit.Status.SCHEDULED
    visit.scheduled_for = scheduled_for
    visit.save(update_fields=("status", "scheduled_for", "updated_at"))
    return visit


@transaction.atomic
def complete_site_visit(*, site_visit_id: uuid.UUID, outcome_notes: str = "") -> SiteVisit:
    visit = SiteVisit.objects.select_for_update().get(pk=site_visit_id)
    if visit.status != SiteVisit.Status.SCHEDULED:
        raise RequirementTransitionError("Only a scheduled visit can be completed.")
    visit.status = SiteVisit.Status.COMPLETED
    visit.completed_at = timezone.now()
    visit.outcome_notes = outcome_notes
    visit.save(update_fields=("status", "completed_at", "outcome_notes", "updated_at"))
    return visit
