"""Candidate eligibility, invitation waves and quote slots.

Ordering follows the contract `apps.assignments.ranking` already established for A1: every Partner
the pool offered is classified, every excluded Partner gets a *named* reason, and the decision is
recorded so Operations can explain it later. M2 adds reasons; it does not start a second record.

Capacity is held softly the moment a vendor accepts. Checking only at reconfirmation is what lets
one agency accept six Saturdays, win four and staff one.
"""

import hashlib
import json
import math
import statistics
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Final
from zoneinfo import ZoneInfo

from django.db import models, transaction
from django.utils import timezone

from apps.carts.availability import (
    earliest_reachable_by_partner_ids,
    reserved_partner_ids,
    usable_location_fix,
)
from apps.catalog.models import ServiceVariant
from apps.partners.capabilities import (
    capability_serves_area,
    clustered_partner_ids,
    language_subtag,
    partner_language_subtags,
    partner_unavailable_on,
)
from apps.partners.models import (
    PartnerCapability,
    PartnerCrewMembership,
    PartnerLocation,
    PartnerProfile,
    PartnerServiceArea,
)
from apps.requirements.exceptions import (
    CapacityUnavailableError,
    InvitationExpiredError,
    InvitationTransitionError,
    QuoteSlotConflictError,
    QuoteSlotsExhaustedError,
)
from apps.requirements.models import (
    CapacityHold,
    CustomerRequirement,
    RateCardBooking,
    RequirementSnapshot,
    VendorInvitation,
    VisitPlan,
)
from apps.requirements.sla import add_business_hours

MATCHING_POLICY: Final[str] = "m2_capability_area_language_travel_capacity_responsiveness"
#: Bumped from 1 when eligibility gained language, travel feasibility, calendar availability and
#: the A1 reservation grid, and ordering stopped being a stable sort on Partner id. An invitation
#: written under version 1 was decided by different rules, and Operations explaining a past
#: decision needs to know which.
MATCHING_POLICY_VERSION: Final[int] = 2

#: A vendor who has not opened the app in this long is not invited. Every wave spent on a dormant
#: account burns the Customer's delivery promise.
RESPONSIVENESS_WINDOW_DAYS: Final[int] = 21

#: How many vendors to invite per wave. Bounded so one requirement is not shown to a whole city.
DEFAULT_WAVE_SIZE: Final[int] = 3

#: Distance is ranked in coarse bands, not in metres. A vendor 4.1 km away is not meaningfully
#: closer than one 4.9 km away, and ranking on the difference would make the order jitter with
#: every GPS fix while looking precise.
DISTANCE_BAND_KM: Final[int] = 5

_EARTH_RADIUS_KM: Final[int] = 6371


class ExclusionReason(models.TextChoices):
    """Why a Partner was passed over. Named, never silent absence from a queryset."""

    CAPABILITY_NOT_APPROVED = "capability_not_approved", "No approved capability for this lifecycle"
    CAPABILITY_SUSPENDED = "capability_suspended", "Capability suspended"
    AREA_NOT_SERVED = "area_not_served", "Does not serve this area"
    CALENDAR_UNAVAILABLE = "calendar_unavailable", "Says they are not working on these dates"
    LANGUAGE_MISMATCH = "language_mismatch", "Cannot work in the requirement's language"
    TRAVEL_NOT_FEASIBLE = "travel_not_feasible", "Cannot reach the site by the requested start"
    UNRESPONSIVE = "unresponsive", "Has not responded recently"
    CAPACITY_COMMITTED = "capacity_committed", "Already committed for these dates"
    CREW_TOO_SMALL = "crew_too_small", "Roster smaller than the requested headcount"
    ALREADY_INVITED = "already_invited", "Already invited to this requirement"
    CLUSTER_ALREADY_HOLDS_SLOT = "cluster_already_holds_slot", "Same owner already holds a slot"


@dataclass(frozen=True, slots=True)
class RankingSignals:
    """Why one included candidate sits where it does. Recorded, never shown to a vendor.

    `distance_band_km` is `None` when we have no fresh position for this Partner, which is the
    ordinary case for a workforce agency that never runs the technician app. `assumed_distance_band`
    is what the sort actually used: the median band of the candidates we *do* know, so an unknown
    vendor is treated as typical for the pool rather than pushed to the back of every wave for not
    carrying a phone.
    """

    is_prior_partner: bool
    distance_band_km: int | None
    assumed_distance_band: int
    last_invited_at: datetime | None

    def sort_key(self, partner: PartnerProfile) -> tuple[int, int, float, str]:
        return (
            0 if self.is_prior_partner else 1,
            self.distance_band_km
            if self.distance_band_km is not None
            else self.assumed_distance_band,
            # Least-recent first. Never invited sorts before everyone, which is how a new vendor
            # gets a first enquiry instead of waiting behind the incumbents forever.
            self.last_invited_at.timestamp() if self.last_invited_at is not None else float("-inf"),
            str(partner.id),
        )

    def as_record(self) -> dict[str, object]:
        return {
            "is_prior_partner": self.is_prior_partner,
            "distance_band_km": self.distance_band_km,
            "assumed_distance_band_km": self.assumed_distance_band,
            "last_invited_at": (
                self.last_invited_at.isoformat() if self.last_invited_at is not None else None
            ),
        }


@dataclass(frozen=True, slots=True)
class CandidateEvaluation:
    partner: PartnerProfile
    exclusions: tuple[str, ...]
    signals: RankingSignals | None = None

    @property
    def included(self) -> bool:
        return not self.exclusions


@dataclass(frozen=True, slots=True)
class RequirementMatching:
    """Every Partner the pool offered, classified and in a stable order."""

    evaluations: tuple[CandidateEvaluation, ...]

    @property
    def ordered(self) -> tuple[PartnerProfile, ...]:
        """Included candidates, best first.

        Ordering is explainable rather than clever: a vendor this Customer has used before, then
        the nearest band, then whoever has waited longest for an enquiry, then Partner id as a
        stable tie-break so two runs over the same pool cannot disagree.
        """
        included = [item for item in self.evaluations if item.included]
        return tuple(
            item.partner
            for item in sorted(
                included,
                key=lambda item: (
                    item.signals.sort_key(item.partner)
                    if item.signals is not None
                    else (1, 0, float("-inf"), str(item.partner.id))
                ),
            )
        )

    def provenance(self, *, requirement: CustomerRequirement) -> dict[str, object]:
        signals_by_partner = {
            item.partner.id: item.signals for item in self.evaluations if item.signals is not None
        }
        ranked = [
            {
                "partner_id": str(partner.id),
                "rank": index,
                "signals": (
                    signals_by_partner[partner.id].as_record()
                    if partner.id in signals_by_partner
                    else {}
                ),
            }
            for index, partner in enumerate(self.ordered, start=1)
        ]
        return {
            "policy": MATCHING_POLICY,
            "policy_version": MATCHING_POLICY_VERSION,
            "evaluated_at": timezone.now().isoformat(),
            "pool": {
                "scope": "service_area",
                "service_area_id": str(requirement.service_area_id),
                "considered": len(self.evaluations),
            },
            "ranked": ranked,
            "excluded": [
                {"partner_id": str(item.partner.id), "reasons": list(item.exclusions)}
                for item in self.evaluations
                if not item.included
            ],
        }


def snapshot_requirement(requirement: CustomerRequirement) -> RequirementSnapshot:
    """Freeze what a vendor is about to be shown, reusing an identical existing snapshot.

    Two vendors invited against unchanged content share one row: the snapshot answers "what did
    this vendor quote against", and identical content is the same answer.
    """
    payload = {
        "archetype": requirement.archetype,
        "answers": requirement.answers,
        "additional_details": requirement.additional_details,
        "requested_start": (
            requirement.requested_start.isoformat() if requirement.requested_start else None
        ),
        "service_by": requirement.service_by.isoformat() if requirement.service_by else None,
        "budget_min_paise": requirement.budget_min_paise,
        "budget_max_paise": requirement.budget_max_paise,
        "language": requirement.language,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    content_hash = hashlib.sha256(encoded.encode()).hexdigest()

    existing = RequirementSnapshot.objects.filter(
        requirement=requirement, content_hash=content_hash
    ).first()
    if existing is not None:
        return existing

    return RequirementSnapshot.objects.create(
        requirement=requirement,
        archetype=requirement.archetype,
        answers=requirement.answers,
        additional_details=requirement.additional_details,
        requested_start=requirement.requested_start,
        service_by=requirement.service_by,
        budget_min_paise=requirement.budget_min_paise,
        budget_max_paise=requirement.budget_max_paise,
        language=requirement.language,
        content_hash=content_hash,
    )


def _requested_days(requirement: CustomerRequirement) -> tuple[date, date]:
    start = (
        requirement.requested_start.date() if requirement.requested_start else timezone.localdate()
    )
    duration = int(requirement.answers.get("duration_days") or 1)
    return start, start + timedelta(days=max(duration - 1, 0))


def occupied_span(requirement: CustomerRequirement) -> tuple[datetime, datetime]:
    """The requested day range as an instant range, in the service area's own timezone.

    Half-open — `[first day 00:00, last day + 1 00:00)` — because that is what
    `carts.availability.reserved_partner_ids` compares against, and the exclusion constraint behind
    it uses `[)` bounds. Computing it in the area's timezone rather than the server's is what stops
    a job on the 14th from reading as the 13th for anyone east of UTC.
    """
    starts_on, ends_on = _requested_days(requirement)
    area = requirement.service_area
    zone = ZoneInfo(area.timezone) if area is not None else timezone.get_current_timezone()
    start = datetime.combine(starts_on, datetime.min.time(), tzinfo=zone)
    end = datetime.combine(ends_on + timedelta(days=1), datetime.min.time(), tzinfo=zone)
    return start, end


def _held_capacity_partner_ids(
    *,
    partner_ids: Sequence[uuid.UUID],
    starts_on: date,
    ends_on: date,
) -> set[uuid.UUID]:
    if not partner_ids:
        return set()
    return set(
        CapacityHold.objects.filter(
            partner_id__in=list(partner_ids),
            status=CapacityHold.Status.ACTIVE,
            starts_on__lte=ends_on,
            ends_on__gte=starts_on,
        )
        .values_list("partner_id", flat=True)
        .distinct()
    )


def committed_capacity_partner_ids(
    *,
    requirement: CustomerRequirement,
    partner_ids: Sequence[uuid.UUID],
) -> set[uuid.UUID]:
    """Partners already spoken for on the requested days, by either notion of "busy".

    Two records answer that question and until now only one was read. `CapacityHold` is M2's own
    soft claim, taken when a vendor accepts an enquiry. `assignments.Reservation` is the M1 booking
    grid, which is where an A1 visit lives. A vendor holding an A1 job on Saturday was invisible to
    M2, so they could be invited, accept, and then have to choose which Customer to disappoint —
    `M2-BE-306`.
    """
    starts_on, ends_on = _requested_days(requirement)
    span_start, span_end = occupied_span(requirement)
    return _held_capacity_partner_ids(
        partner_ids=partner_ids, starts_on=starts_on, ends_on=ends_on
    ) | set(
        reserved_partner_ids(
            partner_ids=partner_ids,
            starts_at=span_start,
            ends_at=span_end,
        )
    )


def _distance_bands(
    *,
    requirement: CustomerRequirement,
    partner_ids: Sequence[uuid.UUID],
) -> tuple[dict[uuid.UUID, int], int]:
    """Coarse distance bands from each Partner's last fresh position, plus the pool's median.

    The median is what an unknown position is scored as. Sorting unknowns last would hand every
    enquiry to whichever vendors happen to run the technician app; sorting them first would make
    deleting a location fix a ranking strategy. Treating them as typical does neither.
    """
    address = requirement.address
    if address is None or not partner_ids:
        return {}, 0

    bands: dict[uuid.UUID, int] = {}
    for location in PartnerLocation.objects.filter(partner_id__in=list(partner_ids)):
        fix = usable_location_fix(location)
        if fix is None:
            continue
        distance_km = _haversine_km(
            float(fix.latitude),
            float(fix.longitude),
            float(address.latitude),
            float(address.longitude),
        )
        bands[fix.partner_id] = int(distance_km // DISTANCE_BAND_KM)

    assumed = int(statistics.median(bands.values())) if bands else 0
    return bands, assumed


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _prior_partner_ids(requirement: CustomerRequirement) -> set[uuid.UUID]:
    """Vendors this Customer has engaged with before, on any earlier requirement.

    "Engaged with" means they accepted or quoted, not merely that they were invited: an invitation
    the Customer never saw a response to is not a relationship.
    """
    return set(
        VendorInvitation.objects.filter(
            requirement__customer_id=requirement.customer_id,
            status__in=(
                VendorInvitation.Status.ACCEPTED,
                VendorInvitation.Status.QUOTED,
            ),
        )
        .exclude(requirement_id=requirement.id)
        .values_list("partner_id", flat=True)
        .distinct()
    )


def _last_invited_at(partner_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, datetime]:
    if not partner_ids:
        return {}
    rows = (
        VendorInvitation.objects.filter(partner_id__in=list(partner_ids))
        .values("partner_id")
        .annotate(latest=models.Max("created_at"))
    )
    return {row["partner_id"]: row["latest"] for row in rows}


@dataclass(frozen=True, slots=True)
class _PoolFacts:
    """Everything about the requirement and the pool that does not vary per candidate.

    Resolved once and handed to `_exclusions_for`, so the per-candidate function reads as a list of
    eligibility rules rather than a list of queries. The alternative — one long loop — is what
    tipped `evaluate_candidates` past the branch ceiling when language, travel and calendar joined
    the filters, and it is also what makes a rule easy to add and hard to notice.
    """

    requirement: CustomerRequirement
    starts_on: date
    requested_crew: int
    fresh_since: datetime
    requirement_language: str
    invited_partner_ids: set[uuid.UUID]
    held_clusters: set[str]
    committed: set[uuid.UUID]
    reachable_by: dict[uuid.UUID, datetime]


def _capability_exclusions(
    *,
    partner: PartnerProfile,
    pool: _PoolFacts,
) -> tuple[list[str], PartnerCapability | None]:
    requirement = pool.requirement
    reasons: list[str] = []
    capability = PartnerCapability.objects.filter(
        partner=partner, variant=requirement.variant
    ).first()
    if capability is None or capability.status not in (
        PartnerCapability.Status.APPROVED,
        PartnerCapability.Status.SUSPENDED,
    ):
        reasons.append(ExclusionReason.CAPABILITY_NOT_APPROVED)
    elif capability.status == PartnerCapability.Status.SUSPENDED:
        reasons.append(ExclusionReason.CAPABILITY_SUSPENDED)
    elif capability.archetype != requirement.archetype:
        reasons.append(ExclusionReason.CAPABILITY_NOT_APPROVED)
    return reasons, capability


def _coverage_exclusions(
    *,
    partner: PartnerProfile,
    capability: PartnerCapability | None,
    pool: _PoolFacts,
) -> list[str]:
    requirement = pool.requirement
    reasons: list[str] = []
    serves_area = PartnerServiceArea.objects.filter(
        partner=partner, service_area=requirement.service_area, is_active=True
    ).exists()
    # The capability's own area scoping can only subtract from the Partner's coverage, so both have
    # to hold. A capability approved for one city does not travel with the account.
    if not serves_area or (
        capability is not None
        and requirement.service_area is not None
        and not capability_serves_area(capability, requirement.service_area)
    ):
        reasons.append(ExclusionReason.AREA_NOT_SERVED)

    if requirement.service_area is not None and partner_unavailable_on(
        partner=partner,
        service_area=requirement.service_area,
        on_day=pool.starts_on,
    ):
        reasons.append(ExclusionReason.CALENDAR_UNAVAILABLE)

    # An undeclared language is not a mismatch. Excluding on silence would empty the pool for every
    # vendor who registered before the field existed.
    declared_languages = partner_language_subtags(partner)
    if declared_languages and pool.requirement_language not in declared_languages:
        reasons.append(ExclusionReason.LANGUAGE_MISMATCH)
    return reasons


def _exclusions_for(*, partner: PartnerProfile, pool: _PoolFacts) -> list[str]:
    """Every named reason this Partner is not a candidate. Empty means eligible."""
    requirement = pool.requirement
    capability_reasons, capability = _capability_exclusions(partner=partner, pool=pool)
    reasons = capability_reasons + _coverage_exclusions(
        partner=partner, capability=capability, pool=pool
    )

    if partner.id in pool.invited_partner_ids:
        reasons.append(ExclusionReason.ALREADY_INVITED)
    if _cluster_key(partner) in pool.held_clusters:
        reasons.append(ExclusionReason.CLUSTER_ALREADY_HOLDS_SLOT)
    if not partner.online_sessions.filter(started_at__gte=pool.fresh_since).exists():
        reasons.append(ExclusionReason.UNRESPONSIVE)
    if partner.id in pool.committed:
        reasons.append(ExclusionReason.CAPACITY_COMMITTED)

    earliest = pool.reachable_by.get(partner.id)
    if (
        requirement.requested_start is not None
        and earliest is not None
        and earliest > requirement.requested_start
    ):
        reasons.append(ExclusionReason.TRAVEL_NOT_FEASIBLE)

    if pool.requested_crew:
        roster = PartnerCrewMembership.objects.filter(
            partner=partner, status=PartnerCrewMembership.Status.ACTIVE
        ).count()
        if roster < pool.requested_crew:
            reasons.append(ExclusionReason.CREW_TOO_SMALL)
    return reasons


def evaluate_candidates(
    *,
    requirement: CustomerRequirement,
    candidates: Sequence[PartnerProfile] | None = None,
) -> RequirementMatching:
    """Classify the pool, then order the survivors on recorded signals.

    Hard eligibility first — approval, area, calendar, language, travel, capacity, responsiveness,
    crew size, no duplicate and no cluster collision — and every passed-over Partner gets a named
    reason, exactly as `assignments.ranking` established for A1. Ordering is `M2-BE-303`: prior
    relationship, distance band, least-recent invitation, stable tie-break.
    """
    if candidates is None:
        partner_ids = PartnerServiceArea.objects.filter(
            service_area=requirement.service_area, is_active=True
        ).values_list("partner_id", flat=True)
        candidates = list(PartnerProfile.objects.filter(id__in=list(partner_ids)))

    candidate_ids = [partner.id for partner in candidates]
    starts_on, _ends_on = _requested_days(requirement)
    requested_crew = int(requirement.answers.get("worker_count") or 0)
    fresh_since = timezone.now() - timedelta(days=RESPONSIVENESS_WINDOW_DAYS)
    requirement_language = language_subtag(requirement.language)

    invited_partner_ids = set(
        VendorInvitation.objects.filter(requirement=requirement).values_list(
            "partner_id", flat=True
        )
    )
    held_clusters = set(
        VendorInvitation.objects.filter(
            requirement=requirement,
            status__in=VendorInvitation.SLOT_HOLDING_STATUSES,
        )
        .exclude(cluster_key="")
        .values_list("cluster_key", flat=True)
    )
    committed = committed_capacity_partner_ids(requirement=requirement, partner_ids=candidate_ids)
    # Travel feasibility for the *requested date*: a vendor who could not physically be on site by
    # the time the Customer asked for is not a candidate, however well they match otherwise. This
    # only ever bites on same-day and imminent work, which is exactly where it should.
    reachable_by = (
        earliest_reachable_by_partner_ids(
            partner_ids=candidate_ids,
            destination=requirement.address,
            now=timezone.now(),
        )
        if requirement.requested_start is not None
        else {}
    )
    distance_bands, assumed_band = _distance_bands(
        requirement=requirement, partner_ids=candidate_ids
    )
    prior_partners = _prior_partner_ids(requirement)
    last_invited = _last_invited_at(candidate_ids)

    pool = _PoolFacts(
        requirement=requirement,
        starts_on=starts_on,
        requested_crew=requested_crew,
        fresh_since=fresh_since,
        requirement_language=requirement_language,
        invited_partner_ids=invited_partner_ids,
        held_clusters=held_clusters,
        committed=committed,
        reachable_by=reachable_by,
    )

    evaluations = [
        CandidateEvaluation(
            partner=partner,
            exclusions=tuple(_exclusions_for(partner=partner, pool=pool)),
            signals=RankingSignals(
                is_prior_partner=partner.id in prior_partners,
                distance_band_km=distance_bands.get(partner.id),
                assumed_distance_band=assumed_band,
                last_invited_at=last_invited.get(partner.id),
            ),
        )
        for partner in candidates
    ]

    return RequirementMatching(evaluations=tuple(evaluations))


def cluster_key(partner: PartnerProfile) -> str:
    """A stable key for the beneficial owner behind this Partner account.

    Public since Wave C2R: the rate-card crew cascade builds its own waves on the M1 dispatch
    clock rather than on business hours, and it has to apply the *same* one-invitation-per-owner
    rule. A second hash of the same cluster would be a second answer to "is this the same agency",
    which is exactly the question the global crew-identity check exists to have one answer to.
    """
    linked = clustered_partner_ids(partner)
    return hashlib.sha256(",".join(sorted(str(pid) for pid in linked)).encode()).hexdigest()


#: Retained so the private name keeps working for the callers below and for the existing test that
#: reaches for it. One function, two names, no second implementation.
_cluster_key = cluster_key


def live_slot_count(requirement: CustomerRequirement) -> int:
    return VendorInvitation.objects.filter(
        requirement=requirement,
        status__in=VendorInvitation.SLOT_HOLDING_STATUSES,
    ).count()


def _max_slots(requirement: CustomerRequirement) -> int:
    """How many vendors may hold a slot on this requirement at once.

    **A5 is bounded by the visit plan, not by `max_quotes`** (`M2-BE-215`). The plan size *is* the
    product the Customer chose — "two professionals will visit" — so inviting on the variant's quote
    ceiling instead would send four vendors to a home that paid for two, and the fourth would find
    every share taken. `VOID` is excluded because a voided plan bought nothing.

    A5 with no plan falls through to the configured ceiling rather than to zero:
    `submit_requirement` already refuses an A5 requirement without a plan, so reaching here without
    one means Operations reclassified an in-flight A3, and stalling matching is the wrong recovery.

    **A rate-card A3 requirement has exactly one slot** (revision 4). "First accept wins" is not a
    convention in the cascade caller — it is this number. Leaving the quote ceiling in place would
    let a second lead accept a job the first one is already holding, and both would arrive.
    """
    if RateCardBooking.objects.filter(
        requirement=requirement,
        status__in=RateCardBooking.DISPATCHABLE_STATUSES,
    ).exists():
        return 1
    if requirement.archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
        plan = (
            VisitPlan.objects.filter(requirement=requirement)
            .exclude(status=VisitPlan.Status.VOID)
            .first()
        )
        if plan is not None:
            return plan.plan_size
    configuration = requirement.configuration
    return configuration.max_quotes if configuration is not None else 3


@transaction.atomic
def invite_wave(
    *,
    requirement_id: uuid.UUID,
    size: int = DEFAULT_WAVE_SIZE,
) -> list[VendorInvitation]:
    """Invite the next bounded wave of eligible vendors.

    Bounded twice: by the wave size, and by how many quote slots the requirement still has free.
    Over-inviting is how a small city's whole vendor pool gets burned on one job.
    """
    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    if requirement.status not in CustomerRequirement.LIVE_STATUSES:
        raise InvitationTransitionError("This request is not open for matching.")

    free_slots = _max_slots(requirement) - live_slot_count(requirement)
    if free_slots <= 0:
        return []

    matching = evaluate_candidates(requirement=requirement)
    snapshot = snapshot_requirement(requirement)
    provenance = matching.provenance(requirement=requirement)
    wave = (
        VendorInvitation.objects.filter(requirement=requirement).aggregate(
            highest=models.Max("wave")
        )["highest"]
        or 0
    ) + 1

    responds_by = _invitation_deadline(requirement)
    # One invitation per beneficial owner per wave. Two accounts of the same owner in one wave
    # would otherwise race each other for a slot the cluster can only hold once.
    chosen: list[PartnerProfile] = []
    seen_clusters: set[str] = set()
    for partner in matching.ordered:
        key = _cluster_key(partner)
        if key in seen_clusters:
            continue
        seen_clusters.add(key)
        chosen.append(partner)
        if len(chosen) >= min(size, free_slots):
            break

    return [
        VendorInvitation.objects.create(
            requirement=requirement,
            partner=partner,
            snapshot=snapshot,
            cluster_key=_cluster_key(partner),
            wave=wave,
            responds_by=responds_by,
            ranking_provenance=provenance,
        )
        for partner in chosen
    ]


def _invitation_deadline(requirement: CustomerRequirement) -> datetime | None:
    """Invitation deadlines run in business hours, like every other M2 clock."""
    area = requirement.service_area
    if area is None:
        return None
    windows = list(area.operating_windows.all())
    exceptions = list(area.operating_exceptions.all())
    if not windows and not exceptions:
        return None
    configuration = requirement.configuration
    hours = configuration.first_quote_sla_hours if configuration is not None else None
    if hours is None:
        return None
    return add_business_hours(
        start=timezone.now(), hours=hours, windows=windows, exceptions=exceptions
    )


@transaction.atomic
def accept_invitation(*, invitation_id: uuid.UUID) -> VendorInvitation:
    """Vendor takes a quote slot and a soft hold on their own capacity."""
    invitation = (
        VendorInvitation.objects.select_for_update()
        .select_related("requirement")
        .get(pk=invitation_id)
    )

    if invitation.status == VendorInvitation.Status.ACCEPTED:
        return invitation
    if invitation.status != VendorInvitation.Status.INVITED:
        raise InvitationTransitionError("This invitation can no longer be accepted.")
    if invitation.responds_by is not None and invitation.responds_by <= timezone.now():
        raise InvitationExpiredError()

    requirement = invitation.requirement
    if requirement.status in CustomerRequirement.CLOSED_STATUSES:
        raise InvitationTransitionError("This request is closed.")

    # Slot accounting is checked under the row lock, so two vendors racing for the last slot
    # cannot both win it.
    others = (
        VendorInvitation.objects.filter(
            requirement=requirement,
            status__in=VendorInvitation.SLOT_HOLDING_STATUSES,
        )
        .exclude(pk=invitation.pk)
        .count()
    )
    if others >= _max_slots(requirement):
        raise QuoteSlotsExhaustedError()

    if invitation.cluster_key:
        conflict = (
            VendorInvitation.objects.filter(
                requirement=requirement,
                cluster_key=invitation.cluster_key,
                status__in=(
                    VendorInvitation.Status.ACCEPTED,
                    VendorInvitation.Status.QUOTED,
                ),
            )
            .exclude(pk=invitation.pk)
            .exists()
        )
        if conflict:
            raise QuoteSlotConflictError()

    # The vendor's own diary, checked at the moment they commit rather than only when the wave was
    # built. Both notions of "busy" are read: an M2 hold from another enquiry and an A1 booking on
    # the M1 reservation grid. Until this landed, an agency could hold a Saturday A1 visit and
    # accept a Saturday workforce enquiry, and neither record knew about the other — `M2-BE-306`.
    if invitation.partner_id in committed_capacity_partner_ids(
        requirement=requirement,
        partner_ids=[invitation.partner_id],
    ):
        raise CapacityUnavailableError()

    invitation.status = VendorInvitation.Status.ACCEPTED
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=("status", "accepted_at", "updated_at"))

    starts_on, ends_on = _requested_days(requirement)
    CapacityHold.objects.update_or_create(
        invitation=invitation,
        defaults={
            "partner": invitation.partner,
            "starts_on": starts_on,
            "ends_on": ends_on,
            "crew_size": int(requirement.answers.get("worker_count") or 1),
            "strength": CapacityHold.Strength.SOFT,
            "status": CapacityHold.Status.ACTIVE,
        },
    )
    return invitation


@transaction.atomic
def decline_invitation(*, invitation_id: uuid.UUID, reason_code: str) -> VendorInvitation:
    """Decline and release the slot so a replacement can be invited."""
    if not reason_code:
        raise InvitationTransitionError("Declining needs a reason.")

    invitation = VendorInvitation.objects.select_for_update().get(pk=invitation_id)
    if invitation.status in (
        VendorInvitation.Status.DECLINED,
        VendorInvitation.Status.EXPIRED,
        VendorInvitation.Status.WITHDRAWN,
    ):
        return invitation
    if invitation.status == VendorInvitation.Status.QUOTED:
        raise InvitationTransitionError("Withdraw the quote instead of declining.")

    invitation.status = VendorInvitation.Status.DECLINED
    invitation.decline_reason_code = reason_code
    invitation.save(update_fields=("status", "decline_reason_code", "updated_at"))
    _release_hold(invitation)
    return invitation


@transaction.atomic
def expire_invitation(*, invitation_id: uuid.UUID) -> VendorInvitation:
    invitation = VendorInvitation.objects.select_for_update().get(pk=invitation_id)
    if invitation.status not in (
        VendorInvitation.Status.INVITED,
        VendorInvitation.Status.ACCEPTED,
    ):
        return invitation

    invitation.status = VendorInvitation.Status.EXPIRED
    invitation.save(update_fields=("status", "updated_at"))
    _release_hold(invitation)
    return invitation


@transaction.atomic
def withdraw_invitation(
    *, invitation_id: uuid.UUID, reason_code: str = "requirement_changed"
) -> VendorInvitation:
    """Penalty-free exit, used when the requirement changed under the vendor."""
    invitation = VendorInvitation.objects.select_for_update().get(pk=invitation_id)
    if invitation.status in (
        VendorInvitation.Status.DECLINED,
        VendorInvitation.Status.EXPIRED,
        VendorInvitation.Status.WITHDRAWN,
    ):
        return invitation

    invitation.status = VendorInvitation.Status.WITHDRAWN
    invitation.decline_reason_code = reason_code
    invitation.save(update_fields=("status", "decline_reason_code", "updated_at"))
    _release_hold(invitation)
    return invitation


def _release_hold(invitation: VendorInvitation) -> None:
    CapacityHold.objects.filter(invitation=invitation, status=CapacityHold.Status.ACTIVE).update(
        status=CapacityHold.Status.RELEASED, released_at=timezone.now()
    )


@transaction.atomic
def expire_invitation_and_replace(*, invitation_id: uuid.UUID) -> list[VendorInvitation]:
    """Expire one unanswered invitation, release its slot and invite a replacement.

    Returns the replacement invitations, empty when there was nothing to do.

    **The idempotency lives in the ordering, not in a key.** A system job has no actor, so
    `execute_idempotent` does not apply; instead the requirement row is locked *before* the
    invitation is examined, and the replacement is invited only when this call is the one that
    actually moved the invitation out of `INVITED`/`ACCEPTED`. Two overlapping sweeps therefore
    serialise on the requirement, and the second finds the invitation already `EXPIRED` and invites
    nobody — which is the whole difference between a watchdog and a vendor-spam machine.

    The requirement is locked first on purpose. `invite_wave` locks the requirement and
    `accept_invitation` locks the invitation, so parent-then-child is the only order that cannot
    invert against either of them.
    """
    invitation = VendorInvitation.objects.select_related("requirement").get(pk=invitation_id)
    CustomerRequirement.objects.select_for_update().get(pk=invitation.requirement_id)

    locked = VendorInvitation.objects.select_for_update().get(pk=invitation_id)
    if locked.status not in (
        VendorInvitation.Status.INVITED,
        VendorInvitation.Status.ACCEPTED,
    ):
        return []

    expire_invitation(invitation_id=locked.pk)

    requirement = CustomerRequirement.objects.get(pk=locked.requirement_id)
    if requirement.status not in CustomerRequirement.LIVE_STATUSES:
        # Nothing to replace on a closed or already-selected requirement. `invite_wave` refuses
        # this too; checking here keeps the refusal out of the sweep's error path.
        return []
    # One out, one in. Sizing the replacement wave to the slot that was just released is what stops
    # a burst of expiries from inviting a whole city on the next tick.
    return invite_wave(requirement_id=requirement.pk, size=1)


def expired_invitation_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        VendorInvitation.objects.filter(
            status__in=(
                VendorInvitation.Status.INVITED,
                VendorInvitation.Status.ACCEPTED,
            ),
            responds_by__isnull=False,
            responds_by__lt=moment,
        ).values_list("id", flat=True)
    )


def open_matching_on_submission(*, requirement_id: uuid.UUID) -> list[VendorInvitation]:
    """Invite the opening vendor wave for a requirement that has just been submitted.

    This is the consumer half of `m2.requirement.submitted`. Until it existed the event was
    emitted by `services.submit_requirement` and consumed by nothing, so a submitted A5 project
    or A3 quote request sat at `MATCHING` with no invitation ever written and no vendor able to
    see it at all. Every other caller of `invite_wave` opens a *later* wave — a rematch, a
    replacement, a fallback from the cascade — so the opening wave was the one nobody owned.

    Two guards, and both are about not putting one job in front of vendors twice:

    * **A rate-card booking owns its own dispatch.** `crew_dispatch.book_at_published_rate`
      submits through the ordinary command on purpose (one submission path, one set of rules)
      and then runs the A1 offer cascade itself. Opening a quote wave here as well would offer
      the same job on two different commercial terms at once.
    * **Existing invitations mean matching has already opened.** Outbox delivery is
      at-least-once, so a re-driven event has to settle on the same outcome; without this,
      every redelivery would open another wave.

    A requirement that has left its live statuses is skipped rather than raised on. The event is
    a fact about the past, and a request cancelled between submission and delivery is not a
    failure worth retrying.
    """
    if RateCardBooking.objects.filter(requirement_id=requirement_id).exists():
        return []
    if VendorInvitation.objects.filter(requirement_id=requirement_id).exists():
        return []
    requirement = CustomerRequirement.objects.filter(pk=requirement_id).first()
    if requirement is None or requirement.status not in CustomerRequirement.LIVE_STATUSES:
        return []
    return invite_wave(requirement_id=requirement_id)
