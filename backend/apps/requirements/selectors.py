"""Read models for the M2 requirement surface.

Everything here is a projection. No function writes, and none of them re-implements a rule the
domain owns — `missing_answer_codes` reads the same `required` flag that
`carts.item_inputs.validate_scope` reads, and nothing else. A second copy of the validity rules is
exactly what the contract's `missing_required_answers` field exists to avoid, so keeping this
narrow is load-bearing.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.db.models import Count, Q, QuerySet

from apps.catalog.models import ServiceVariant
from apps.identity.hashing import keyed_hash
from apps.identity.models import User
from apps.partners.models import PartnerCapability, PartnerProfile, PartnerServiceArea
from apps.requirements.exceptions import RequirementNotFoundError
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementQuestion,
    RequirementTransition,
    SiteVisit,
    VendorInvitation,
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
