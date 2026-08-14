"""Read models for the M2 requirement surface.

Everything here is a projection. No function writes, and none of them re-implements a rule the
domain owns — `missing_answer_codes` reads the same `required` flag that
`carts.item_inputs.validate_scope` reads, and nothing else. A second copy of the validity rules is
exactly what the contract's `missing_required_answers` field exists to avoid, so keeping this
narrow is load-bearing.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.db.models import Count, Q, QuerySet

from apps.catalog.models import ServiceVariant
from apps.identity.hashing import keyed_hash
from apps.identity.models import User
from apps.partners.capabilities import masked_crew_phone
from apps.partners.models import (
    PartnerApplication,
    PartnerCapability,
    PartnerProfile,
    PartnerServiceArea,
)
from apps.requirements.exceptions import RequirementNotFoundError
from apps.requirements.models import (
    BookingFee,
    CustomerRequirement,
    DaySettlement,
    Engagement,
    EngagementAmendment,
    EngagementEvent,
    EngagementStage,
    Proposal,
    ProposalSelection,
    QuoteUnlock,
    RequirementQuestion,
    RequirementTransition,
    ShiftAttendance,
    SiteVisit,
    StageCrewAssignment,
    VendorInvitation,
    VisitPlan,
)

#: The sentence the Customer actually reads. Server-authored because it is what tells them what
#: they are buying; a client-side table would drift from the inference that produced it.
#: The archetype name itself is never rendered — see GAP-006.
LIFECYCLE_EXPLANATIONS: dict[str, str] = {
    ServiceVariant.BookingArchetype.A3_TIME_BLOCK: (
        "You are hiring people for a period of time. Vendors will quote a daily rate per worker."
    ),
    ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT: (
        "You are commissioning a finished result. Vendors will quote stages and a total price."
    ),
}


def lifecycle_explanation(archetype: str) -> str | None:
    """The plain-language sentence for an inferred lifecycle, or nothing.

    Returns `None` rather than a fallback string for an archetype with no sentence: an
    unexplained lifecycle should show the Customer nothing, not a generic reassurance.
    """
    return LIFECYCLE_EXPLANATIONS.get(archetype)


#: Who asked a clarification question. A wire vocabulary with no column behind it — the answer is
#: two identity comparisons, and storing a fourth copy of a fact the two foreign keys already carry
#: is the kind of duplicate that drifts.
QUESTION_ASKER_ROLES = (
    ("CUSTOMER", "Customer"),
    ("VENDOR", "Vendor"),
    ("OPERATIONS", "Operations"),
)


def question_asker_role(question: RequirementQuestion) -> str:
    """`CUSTOMER`, `VENDOR` or `OPERATIONS`, decided by identity rather than by inference.

    The C1 lesson about `actor_kind` applies in reverse here. That field was refused because
    `PartnerCapabilityTransition.actor` is null for two different causes, so a derived answer would
    have confidently mislabelled the case that mattered. This one is derived from two non-null
    foreign keys — the requirement's Customer and the invitation's Partner user — so each of the
    three answers is a fact, and the third exists so an assisted question does not silently read as
    the vendor's.
    """
    if question.asked_by_id == question.requirement.customer_id:
        return "CUSTOMER"
    if question.asked_by_id == question.invitation.partner.user_id:
        return "VENDOR"
    return "OPERATIONS"


def missing_answer_codes(requirement: CustomerRequirement) -> list[str]:
    """Required question codes the Customer has not answered yet.

    `validate_scope` raises on the first problem, which is right for a command and useless for a
    form that needs to mark every outstanding field at once. This reads the same `required` flag
    against the same schema and stops there — it does not re-check types, minimums or unknown
    codes, because those are refusals the submit command owns and duplicating them here would let
    the two drift.
    """
    configuration = requirement.configuration
    if configuration is None:
        return []
    questions = configuration.question_schema.get("questions")
    if not isinstance(questions, list):
        return []

    answers = requirement.answers or {}
    missing: list[str] = []
    for question in questions:
        if not isinstance(question, dict):
            continue
        code = question.get("code")
        if isinstance(code, str) and question.get("required") and code not in answers:
            missing.append(code)
    return missing


def closure_reason(requirement: CustomerRequirement) -> str | None:
    """`CLOSED_NO_SUPPLY` -> `NO_SUPPLY`, and nothing for a live requirement.

    The distinction is the point. "Nobody covers this yet" and "we ran out of time" need different
    next actions from the Customer, and collapsing them into one closed state is the fabricated
    progress `M2-FE-215` forbids.
    """
    if requirement.status not in CustomerRequirement.CLOSED_STATUSES:
        return None
    return requirement.status.removeprefix("CLOSED_")


def requirement_summary_text(requirement: CustomerRequirement) -> str:
    """A one-line description of a requirement, authored here rather than by the client.

    Used by the duplicate check, where the client is shown a *different* requirement of its own
    Customer's and must not reconstruct a description from raw answers.
    """
    service = requirement.variant.service.name
    answers = requirement.answers or {}
    workers = answers.get("worker_count")
    days = answers.get("duration_days")
    if workers and days:
        return f"{workers} x {service}, {days} days"
    if workers:
        return f"{workers} x {service}"
    return service


def customer_requirements(customer: User) -> QuerySet[CustomerRequirement]:
    """`My requests`, newest first, with the teaser count the list row needs."""
    return (
        CustomerRequirement.objects.filter(customer=customer)
        .select_related("variant__service", "configuration")
        .annotate(
            teaser_count=Count(
                "proposals",
                filter=Q(
                    proposals__status=Proposal.Status.SUBMITTED,
                    proposals__vendor_confirmed_at__isnull=False,
                ),
                distinct=True,
            )
        )
        .order_by("-created_at", "id")
    )


def requirement_for_customer(*, customer: User, requirement_id: uuid.UUID) -> CustomerRequirement:
    """One of this Customer's requirements, or a 404.

    404 rather than 403 for somebody else's requirement: existence is itself private, and a 403
    confirms a record is there to be found.
    """
    requirement = (
        CustomerRequirement.objects.select_related("variant__service", "configuration", "address")
        .filter(customer=customer, id=requirement_id)
        .first()
    )
    if requirement is None:
        raise RequirementNotFoundError()
    return requirement


def confirmed_teaser_count(requirement: CustomerRequirement) -> int:
    return Proposal.objects.filter(
        requirement=requirement,
        status=Proposal.Status.SUBMITTED,
        vendor_confirmed_at__isnull=False,
    ).count()


def partner_invitations(partner: PartnerProfile) -> QuerySet[VendorInvitation]:
    return (
        VendorInvitation.objects.filter(partner=partner)
        .select_related("requirement__variant__service", "snapshot")
        .order_by("-created_at", "id")
    )


def invitation_for_partner(
    *, partner: PartnerProfile, invitation_id: uuid.UUID
) -> VendorInvitation:
    invitation = (
        VendorInvitation.objects.select_related(
            "requirement__variant__service",
            "snapshot",
        )
        .filter(partner=partner, id=invitation_id)
        .first()
    )
    if invitation is None:
        raise RequirementNotFoundError()
    return invitation


# ---------------------------------------------------------------------------
# Masked demand preview
#
# This payload goes to a Partner who has completed no KYC, and it carries the same redaction
# discipline the quote teaser applies in the other direction. Supply is the scarce side of this
# marketplace: a vendor sees that real work exists before proving anything, and sees none of the
# people it belongs to.
# ---------------------------------------------------------------------------

#: How many masked summaries one read returns. Bounded because the screen is a reason to register,
#: not a work queue — and because an unbounded list of a city's live demand handed to an unvetted
#: account is a market map.
DEMAND_PREVIEW_LIMIT = 20


@dataclass(frozen=True, slots=True)
class DemandSummary:
    #: **Not a requirement primary key.** A keyed hash, so an unapproved Partner holding these ids
    #: is not one lookup away from the record itself the moment any endpoint accepts a requirement
    #: id. It resolves on nothing: it is not even a UUID, so the `<uuid:...>` converters refuse it
    #: before a view runs.
    id: str
    headline: str
    #: A locality, never a street. "Gachibowli, Hyderabad" tells a vendor whether the travel is
    #: worth it; a building number tells them where the Customer lives.
    area_label: str
    starts_on: date | None
    workspace_key: str
    is_eligible: bool
    eligibility_hint: str


def demand_preview_id(requirement_id: uuid.UUID) -> str:
    return keyed_hash(f"m2-demand-preview:{requirement_id}")[:32]


def _area_label(requirement: CustomerRequirement) -> str:
    address = requirement.address
    if address is None:
        area = requirement.service_area
        return area.name if area is not None else ""
    parts = [part for part in (address.locality, address.city) if part]
    return ", ".join(parts)


def demand_preview(partner: PartnerProfile) -> tuple[list[DemandSummary], int]:
    """Live demand in the areas this Partner serves, masked, plus the eligible-service count.

    Ineligible demand is shown with a hint rather than hidden. Hiding it would make an empty screen
    the first thing most new Partners see; showing it as actionable would be a lie. The honest
    rendering is "this is real, and here is what stands between you and it".
    """
    area_ids = list(
        PartnerServiceArea.objects.filter(partner=partner, is_active=True).values_list(
            "service_area_id", flat=True
        )
    )
    if not area_ids:
        return [], 0

    eligible_variant_ids = set(
        PartnerCapability.objects.filter(
            partner=partner,
            status=PartnerCapability.Status.APPROVED,
        ).values_list("variant_id", flat=True)
    )

    requirements = (
        CustomerRequirement.objects.filter(
            status__in=CustomerRequirement.LIVE_STATUSES,
            service_area_id__in=area_ids,
        )
        .select_related("variant__service", "address", "service_area")
        .order_by("-created_at", "id")[:DEMAND_PREVIEW_LIMIT]
    )

    summaries = [
        DemandSummary(
            id=demand_preview_id(requirement.id),
            headline=requirement_summary_text(requirement),
            area_label=_area_label(requirement),
            starts_on=(
                requirement.requested_start.date()
                if requirement.requested_start is not None
                else None
            ),
            workspace_key=requirement.archetype,
            is_eligible=requirement.variant_id in eligible_variant_ids,
            eligibility_hint=(
                ""
                if requirement.variant_id in eligible_variant_ids
                else f"Needs an approved {requirement.variant.service.name} capability."
            ),
        )
        for requirement in requirements
    ]
    return summaries, len(eligible_variant_ids)


# ---------------------------------------------------------------------------
# The A5 disclosure ladder (`M2-FE-419`)
#
# `README.md` §"Matching and the two front doors": before any visit is confirmed the Customer sees
# **vendor cards** for the responding pool — verification badge, rating, vendor type and a distance
# band, no contact details. When a vendor confirms a visit slot their name is disclosed, because
# somebody is entering the Customer's home and must be nameable.
#
# Three of those four are published below. **The rating is not, and the reason is not an
# oversight**: this platform has no review model. `apps/carts/serializers.py` already refuses to
# publish one on the A1 professional card for the same reason — "publishing a number with nothing
# behind it would be worse than publishing none" — and inventing a second, M2-only rating source
# would be this module deciding what a vendor's reputation is. The field arrives when a review
# aggregate does.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class VendorCard:
    """One responding vendor, as much of one as the Customer is entitled to see."""

    partner_id: uuid.UUID
    vendor_type: str
    is_verified: bool
    #: Non-null **only** once this vendor holds a live visit on the plan. Null at every other
    #: moment, including for a vendor who merely accepted the enquiry.
    display_name: str | None
    #: Coarse band in kilometres, from the same 5 km banding the matcher ranked on. `None` when we
    #: have no fresh position for this vendor, which is the ordinary case for an agency that never
    #: runs the technician app — and `None` is published as `None` rather than filled with the
    #: pool median, because the median is a *ranking* device and printing it on a card would tell
    #: the Customer a distance nobody measured.
    distance_band_km: int | None


def partner_is_verified(partner: PartnerProfile) -> bool:
    """The verification badge, from the one thing that actually verifies a Partner.

    `PartnerApplication.status == APPROVED` is what an Operations reviewer decided after identity
    documents and consents, and it is the gate `assert_kyc_complete` enforces before a vendor may
    accept anything. Until 1.26.0 both the teaser and the vendor card hardcoded `True`, which was a
    small lie with a large surface: the badge is one of four things a Customer weighs before paying,
    and a badge that is always on is not a badge.
    """
    application = getattr(partner, "application", None)
    return application is not None and application.status == PartnerApplication.Status.APPROVED


def verified_partner_ids(partner_ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """The badge for a whole pool in one query, for the list reads."""
    if not partner_ids:
        return set()
    return set(
        PartnerApplication.objects.filter(
            partner_id__in=list(partner_ids),
            status=PartnerApplication.Status.APPROVED,
        ).values_list("partner_id", flat=True)
    )


def invitation_distance_band_km(invitation: VendorInvitation) -> int | None:
    """The distance band the matcher measured for this vendor, out of its own provenance.

    `VendorInvitation.ranking_provenance` already records `signals.distance_band_km` per ranked
    candidate — `matching.RankingSignals.as_record` writes it — so this reads a number the platform
    computed at invitation time rather than recomputing one now. That matters beyond query count:
    a band recomputed today would move as the vendor drives around, and the Customer would watch a
    "12 km away" card become "4 km away" with nothing having happened.

    Reads defensively because the column is JSON written by an earlier policy version.
    """
    provenance = invitation.ranking_provenance
    if not isinstance(provenance, dict):
        return None
    ranked = provenance.get("ranked")
    if not isinstance(ranked, list):
        return None
    for entry in ranked:
        if not isinstance(entry, dict) or entry.get("partner_id") != str(invitation.partner_id):
            continue
        signals = entry.get("signals")
        if not isinstance(signals, dict):
            return None
        band = signals.get("distance_band_km")
        return band if isinstance(band, int) and not isinstance(band, bool) else None
    return None


def vendor_cards(requirement: CustomerRequirement) -> list[VendorCard]:
    """The responding pool for one A5 request, on the disclosure ladder.

    **Responding** is the word `README.md` uses and it is load-bearing: a vendor who was merely
    invited has done nothing, and publishing a card for them would tell the Customer three
    professionals are engaged with their request when none of them has opened it. Only `ACCEPTED`
    and `QUOTED` invitations produce a card.

    Name disclosure follows `SiteVisit.SHARE_HOLDING_STATUSES` — a vendor who has committed to a
    slot, including the first vendor's slot while it is still held pending the plan checkout. That
    boundary is `confirm_visit_slot`'s own: the vendor has said "I will be there at this time", and
    `README.md`'s copy for the checkout screen is literally *"Vendor X confirmed Tuesday 10am"*. A
    Customer being asked to pay for visits is entitled to know whose visit they are paying for.

    Contact details appear at no point on this read, at any status. They are released by the
    engagement, not by the visit and not by the plan fee.
    """
    invitations = list(
        VendorInvitation.objects.filter(
            requirement=requirement,
            status__in=(VendorInvitation.Status.ACCEPTED, VendorInvitation.Status.QUOTED),
        )
        .select_related("partner", "partner__business_profile")
        .order_by("created_at", "id")
    )
    if not invitations:
        return []

    partner_ids = [invitation.partner_id for invitation in invitations]
    verified = verified_partner_ids(partner_ids)
    named_partner_ids = set(
        SiteVisit.objects.filter(
            requirement=requirement,
            plan_share__isnull=False,
            status__in=SiteVisit.SHARE_HOLDING_STATUSES,
        ).values_list("invitation__partner_id", flat=True)
    )

    cards: list[VendorCard] = []
    for invitation in invitations:
        partner = invitation.partner
        business = getattr(partner, "business_profile", None)
        is_named = partner.id in named_partner_ids
        cards.append(
            VendorCard(
                partner_id=partner.id,
                vendor_type=(business.business_type if business is not None else "INDIVIDUAL"),
                is_verified=partner.id in verified,
                display_name=(
                    (business.legal_name if business is not None else "") or partner.display_name
                    if is_named
                    else None
                ),
                distance_band_km=invitation_distance_band_km(invitation),
            )
        )
    return cards


def site_visit_for_participant(*, user: User, site_visit_id: uuid.UUID) -> SiteVisit:
    """One site visit, if the caller is either party to it. A 404 otherwise.

    A visit has exactly two participants — the Customer whose requirement it is, and the vendor who
    asked to travel — and both need to move it, so this resolves by either side rather than by role.
    A stranger gets `404` rather than `403` for the same reason every other M2 read does: the
    existence of a visit says a named vendor is going to a named address.
    """
    visit = (
        SiteVisit.objects.select_related("requirement", "invitation__partner")
        .filter(
            Q(requirement__customer=user) | Q(invitation__partner__user=user),
            id=site_visit_id,
        )
        .first()
    )
    if visit is None:
        raise RequirementNotFoundError()
    return visit


# ---------------------------------------------------------------------------
# Wave C2 reads: selection, engagement and the vendor's own quotes
# ---------------------------------------------------------------------------


def selection_for_partner(*, partner: PartnerProfile, selection_id: uuid.UUID) -> ProposalSelection:
    """The selection this vendor was chosen in, or a 404.

    Scoped to the Partner rather than to the proposal's requirement: a selection names a vendor and
    a price, and confirming that one exists for a requirement the caller was not chosen for tells
    them a competitor won.
    """
    selection = (
        ProposalSelection.objects.select_related("requirement__configuration", "proposal")
        .filter(partner=partner, id=selection_id)
        .first()
    )
    if selection is None:
        raise RequirementNotFoundError()
    return selection


def engagement_for_participant(*, user: User, engagement_id: uuid.UUID) -> Engagement:
    """One engagement, if the caller is either party to it. A 404 otherwise.

    Resolved by participation, like `site_visit_for_participant` and for the same reason: both
    sides operate the same agreement, and a role-scoped read would need two routes for one record.
    """
    engagement = (
        Engagement.objects.select_related("requirement", "partner", "proposal")
        .prefetch_related("stages")
        .filter(
            Q(customer=user) | Q(partner__user=user),
            id=engagement_id,
        )
        .first()
    )
    if engagement is None:
        raise RequirementNotFoundError()
    return engagement


def stage_for_customer(*, customer: User, stage_id: uuid.UUID) -> EngagementStage:
    """One engagement stage, scoped to the Customer who would fund it."""
    stage = (
        EngagementStage.objects.select_related("engagement__requirement")
        .filter(engagement__customer=customer, id=stage_id)
        .first()
    )
    if stage is None:
        raise RequirementNotFoundError()
    return stage


# ---------------------------------------------------------------------------
# Wave C3 reads: the stage spine
# ---------------------------------------------------------------------------


def stage_for_partner(*, partner: PartnerProfile, stage_id: uuid.UUID) -> EngagementStage:
    """One engagement stage, scoped to the vendor who performs it."""
    stage = (
        EngagementStage.objects.select_related(
            "engagement__requirement__configuration", "engagement__partner"
        )
        .filter(engagement__partner=partner, id=stage_id)
        .first()
    )
    if stage is None:
        raise RequirementNotFoundError()
    return stage


def stage_for_participant(*, user: User, stage_id: uuid.UUID) -> EngagementStage:
    """One engagement stage, if the caller is either party to its engagement.

    Resolved by participation, like `engagement_for_participant` and `site_visit_for_participant`,
    because both sides read the same stage: the vendor to see whether their evidence landed, the
    Customer to decide on it. A stranger gets `404` — the existence of a stage says a named vendor
    is doing named work for a named Customer.
    """
    stage = (
        EngagementStage.objects.select_related(
            "engagement__requirement__configuration", "engagement__partner"
        )
        .prefetch_related("evidence")
        .filter(
            Q(engagement__customer=user) | Q(engagement__partner__user=user),
            id=stage_id,
        )
        .first()
    )
    if stage is None:
        raise RequirementNotFoundError()
    return stage


def engagement_stages(engagement: Engagement) -> QuerySet[EngagementStage]:
    return EngagementStage.objects.filter(engagement=engagement).order_by("position")


def engagement_events(engagement: Engagement) -> QuerySet[EngagementEvent]:
    """The agreement's own history, oldest first. Both parties read the same rows."""
    return (
        EngagementEvent.objects.filter(engagement=engagement)
        .select_related("stage")
        .order_by("occurred_at", "id")
    )


def access_receipt_for(engagement: Engagement) -> dict[str, Any] | None:
    """The receipt for the access fee this agreement grew out of (`M2-FE-418`).

    One fee per requirement and one per archetype: A3 charged an unlock, A5 charged a visit plan,
    and neither can exist on the other. Both already allocate a gapless `M2A-` number at capture —
    what was missing was any way to reach it from the agreement screen, which is the screen a
    Customer is on when they want the receipt.

    `None` for three honest reasons rather than one: no fee has been charged yet, the plan's whole
    price was covered by a reclassification credit, or the row predates receipt numbering. Each of
    them means the same thing to the screen — there is no number to show — and none of them is an
    error.
    """
    requirement_id = engagement.requirement_id
    if engagement.archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
        plan = (
            VisitPlan.objects.filter(requirement_id=requirement_id)
            .exclude(receipt_series="")
            .order_by("-charged_at")
            .first()
        )
        if plan is None:
            return None
        return {
            "kind": "A5_VISIT_PLAN",
            "number": f"{plan.receipt_series}-{plan.receipt_sequence}",
            "series": plan.receipt_series,
            "sequence": plan.receipt_sequence,
            "amount_paise": plan.chargeable_paise,
        }

    # Revision 4: an A3 engagement now grows out of one of two fees. The booking fee is checked
    # first because it is the primary path — an A3 requirement that ran the rate-card cascade never
    # bought an unlock, and one that fell back to the quote flow never paid a booking fee, so the
    # two are mutually exclusive in practice and the order only decides which is found first.
    booking_fee = (
        BookingFee.objects.filter(requirement_id=requirement_id)
        .exclude(receipt_series="")
        .order_by("-activated_at")
        .first()
    )
    if booking_fee is not None:
        return {
            "kind": "A3_BOOKING_FEE",
            "number": f"{booking_fee.receipt_series}-{booking_fee.receipt_sequence}",
            "series": booking_fee.receipt_series,
            "sequence": booking_fee.receipt_sequence,
            "amount_paise": booking_fee.amount_paise,
        }

    unlock = (
        QuoteUnlock.objects.filter(requirement_id=requirement_id)
        .exclude(receipt_series="")
        .order_by("-activated_at")
        .first()
    )
    if unlock is None:
        return None
    return {
        "kind": "A3_QUOTE_UNLOCK",
        "number": f"{unlock.receipt_series}-{unlock.receipt_sequence}",
        "series": unlock.receipt_series,
        "sequence": unlock.receipt_sequence,
        "amount_paise": unlock.price_paise,
    }


def customer_engagements(customer: User) -> QuerySet[Engagement]:
    return (
        Engagement.objects.filter(customer=customer)
        .select_related("requirement", "partner")
        .prefetch_related("stages")
        .order_by("-created_at", "id")
    )


def partner_engagements(partner: PartnerProfile) -> QuerySet[Engagement]:
    return (
        Engagement.objects.filter(partner=partner)
        .select_related("requirement")
        .prefetch_related("stages")
        .order_by("-created_at", "id")
    )


def amendment_for_participant(
    *, user: User, engagement_amendment_id: uuid.UUID
) -> EngagementAmendment:
    """One change request, if the caller is either party to its engagement."""
    link = (
        EngagementAmendment.objects.select_related(
            "amendment", "engagement__requirement__configuration", "engagement__partner", "stage"
        )
        .prefetch_related("amendment__lines")
        .filter(
            Q(engagement__customer=user) | Q(engagement__partner__user=user),
            id=engagement_amendment_id,
        )
        .first()
    )
    if link is None:
        raise RequirementNotFoundError()
    return link


def engagement_amendments(engagement: Engagement) -> QuerySet[EngagementAmendment]:
    return (
        EngagementAmendment.objects.filter(engagement=engagement)
        .select_related("amendment", "stage")
        .prefetch_related("amendment__lines")
        .order_by("-created_at", "id")
    )


def partner_proposals(
    *, partner: PartnerProfile, requirement_id: uuid.UUID | None = None
) -> QuerySet[Proposal]:
    """Every quote this vendor has submitted, newest first, optionally for one requirement.

    Closes what `frontend-execution-plan.md` §7 calls the largest hole in Wave B2: a Partner could
    submit a quote and read it back only by remembering its id. Withdraw, the six proposal states
    and the whole supersession trace were unreachable the moment the tab closed.

    Scoped to `partner`, so the `requirement_id` filter narrows a set the caller already owns and
    cannot be used to discover a requirement they were never invited to.
    """
    queryset = Proposal.objects.filter(partner=partner).select_related("requirement")
    if requirement_id is not None:
        queryset = queryset.filter(requirement_id=requirement_id)
    return queryset.order_by("-submitted_at", "id")


def customer_readable_proposals(requirement: CustomerRequirement) -> QuerySet[Proposal]:
    """The quotes or estimates a paying Customer may read in full.

    Every vendor-confirmed proposal that is still on the table, plus the ones they already acted
    on — `REJECTED` and `LAPSED` rows stay readable because a Customer comparing three quotes needs
    to see the one they turned down, and a dispute needs the history. Superseded and withdrawn rows
    are excluded: a price the vendor has replaced is not an offer.
    """
    return (
        Proposal.objects.filter(requirement=requirement, vendor_confirmed_at__isnull=False)
        .exclude(status__in=(Proposal.Status.SUPERSEDED, Proposal.Status.WITHDRAWN))
        .select_related("partner", "partner__business_profile", "site_visit")
        .order_by("total_paise", "id")
    )


def _transition_events(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """Status changes worth showing a Customer.

    Only three of the twelve statuses produce a timeline row. The rest — `QUOTES_READY`,
    `UNLOCKED`, `SELECTED` — are already visible as the state of the screen the Customer is
    looking at, and repeating them as history is noise that buries the two rows that matter.
    """
    events: list[dict[str, Any]] = []
    for transition in RequirementTransition.objects.filter(requirement=requirement):
        if transition.to_status == CustomerRequirement.Status.MATCHING:
            event_type = "REQUIREMENT_SUBMITTED"
        elif transition.to_status == CustomerRequirement.Status.CLOSED_SLA_BREACH:
            event_type = "SLA_BREACHED"
        elif transition.to_status in CustomerRequirement.CLOSED_STATUSES:
            event_type = "REQUIREMENT_CLOSED"
        else:
            continue
        detail: dict[str, Any] = {}
        if event_type == "REQUIREMENT_CLOSED" and transition.reason_code:
            detail["reason_code"] = transition.reason_code
        events.append(
            {
                "id": str(transition.id),
                "at": transition.occurred_at,
                "type": event_type,
                "detail": detail,
            }
        )
    return events


def requirement_timeline(requirement: CustomerRequirement) -> list[dict[str, Any]]:
    """The Customer-facing history of one request.

    **Matching is aggregate only.** A wave is published as a count of vendors invited, never as
    who they were: before the unlock the Customer has paid nothing, and a vendor list is the
    identity the teaser rules exist to withhold. There is no pre-unlock branch here because there
    is no branch — the identities are not read, so they cannot leak through a later edit.
    """
    events: list[dict[str, Any]] = _transition_events(requirement)

    waves = (
        VendorInvitation.objects.filter(requirement=requirement)
        .values("wave")
        .annotate(vendors_invited=Count("id"))
        .order_by("wave")
    )
    for wave in waves:
        first_of_wave = (
            VendorInvitation.objects.filter(requirement=requirement, wave=wave["wave"])
            .order_by("created_at")
            .first()
        )
        if first_of_wave is None:  # pragma: no cover - the aggregate proves at least one row
            continue
        events.append(
            {
                "id": f"wave-{requirement.id}-{wave['wave']}",
                "at": first_of_wave.created_at,
                "type": "MATCHING_WAVE_SENT",
                "detail": {"vendors_invited": wave["vendors_invited"]},
            }
        )

    for question in RequirementQuestion.objects.filter(requirement=requirement):
        events.append(
            {
                "id": str(question.id),
                "at": question.asked_at,
                "type": "QUESTION_ASKED",
                "detail": {"question_id": str(question.id), "body": question.question},
            }
        )
        if question.answered_at is not None:
            events.append(
                {
                    "id": f"answer-{question.id}",
                    "at": question.answered_at,
                    "type": "QUESTION_ANSWERED",
                    "detail": {"question_id": str(question.id), "body": question.answer},
                }
            )

    for visit in SiteVisit.objects.filter(requirement=requirement):
        events.append(
            {
                "id": str(visit.id),
                "at": visit.created_at,
                "type": "SITE_VISIT_REQUESTED",
                "detail": {"fee_paise": visit.fee_paise},
            }
        )
        if visit.scheduled_for is not None:
            events.append(
                {
                    "id": f"scheduled-{visit.id}",
                    "at": visit.scheduled_for,
                    "type": "SITE_VISIT_SCHEDULED",
                    "detail": {},
                }
            )

    confirmed_quotes = Proposal.objects.filter(
        requirement=requirement,
        vendor_confirmed_at__isnull=False,
    )
    # No proposal id and no partner: before the unlock a quote is a count, not a thing the
    # Customer can address. The teaser list is the only pre-unlock quote surface.
    events.extend(
        {
            "id": f"quote-{proposal.id}",
            "at": proposal.vendor_confirmed_at,
            "type": "QUOTE_RECEIVED",
            "detail": {},
        }
        for proposal in confirmed_quotes
    )

    events.sort(key=lambda event: (event["at"], event["id"]))
    return events


# ---------------------------------------------------------------------------
# Wave C4: the shift-day read (`M2-BE-521`, `522`, `523`)
#
# Two readers, one projection, and the difference between them is `M2-BE-523`. A Partner is
# reading their own roster and gets the membership id their assignment screen sends back. A
# Customer is reading who is coming to their site and gets a name, four digits and a verification
# summary — never `crew_member_id`, which is global and would let two Customers, or two agencies,
# correlate a fact about a worker that neither is entitled to learn from us.
# ---------------------------------------------------------------------------


def stage_crew_rows(
    assignments: Sequence[StageCrewAssignment],
    *,
    include_membership_id: bool,
) -> list[dict[str, Any]]:
    """Assigned workers as the caller is allowed to see them.

    `include_membership_id` is the whole disclosure switch and it is decided by the view from the
    caller's role, never sent by the client. The verification *summary* — a boolean and a date —
    is published for both readers because it is the thing a Customer is entitled to know and the
    thing `M2-BE-523` names; the documents behind it are published to nobody.
    """
    return [
        {
            "membership_id": assignment.membership_id if include_membership_id else None,
            "display_name": assignment.crew_member.display_name,
            "phone_masked": masked_crew_phone(assignment.crew_member.phone_suffix),
            "is_supervisor": assignment.is_supervisor,
            "is_verified": assignment.membership.documents_verified_at is not None,
            "verified_at": assignment.membership.documents_verified_at,
            "status": assignment.status,
            "assigned_at": assignment.assigned_at,
        }
        for assignment in assignments
    ]


def shift_day_payload(
    *,
    stage: EngagementStage,
    include_membership_id: bool,
) -> dict[str, Any]:
    """One shift-day, whole, for whichever party is looking at it.

    Reads rather than creates: `attendance` and `settlement` are `None` until a command touches the
    day, and publishing `null` is the honest answer to "has anything happened yet". Creating the
    rows on a `GET` would make a read change the database, which is how a stage acquires an
    attendance row on the day somebody merely opened the screen.
    """
    from apps.requirements import workforce  # noqa: PLC0415 — read layer calling the domain

    terms = workforce.shift_terms(stage.engagement)
    attendance = ShiftAttendance.objects.filter(stage=stage).first()
    settlement = DaySettlement.objects.filter(stage=stage).first()
    return {
        "stage_id": stage.id,
        "engagement_id": stage.engagement_id,
        "position": stage.position,
        "day_label": stage.label,
        "scheduled_on": stage.scheduled_on,
        "stage_status": stage.status,
        "crew": stage_crew_rows(
            workforce.assigned_crew(stage),
            include_membership_id=include_membership_id,
        ),
        "attendance": attendance,
        "settlement": settlement,
        "per_worker_paise": terms.per_worker_paise,
        "standard_day_hours": terms.standard_day_hours,
        "overtime_hourly_paise": terms.overtime_hourly_paise,
        "add_on_rates": terms.add_on_rates,
    }
