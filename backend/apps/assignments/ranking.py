"""Deterministic candidate ordering, recorded so Operations can explain it.

There is no business ranking in M1. Candidate order is a stable sort on Partner UUID —
arbitrary, but reproducible. Explainability here is therefore not about justifying a
score, because no code computes one. It is about recording honestly what actually decided
the order, and giving every Partner who was considered and passed over a named reason
rather than silent absence from a queryset.

The pool is bounded to the unit's service area on purpose. A wider pool would be both
unbounded to compute and a disclosure of Partner identities with no bearing on the job.
The boundary is written into the document so a reader can see where the explanation stops.

Same-day units also require an active `PartnerOnlineSession` (spec §11.1). Advance
units do not — nobody toggles online on Sunday for a Tuesday job. The boundary is the
same horizon as reachability: `requested_start <= now + M1_TODAY_LEAD_TIME_MINUTES`.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Final
from uuid import UUID

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.assignments.models import AssignmentAttempt
from apps.carts.models import FulfilmentUnit
from apps.partners.models import PartnerApplication, PartnerOnlineSession, PartnerProfile
from apps.partners.selectors import partner_available_during

RANKING_POLICY: Final[str] = "service_area_stable_uuid"
RANKING_POLICY_VERSION: Final[int] = 1


class ExclusionReason(models.TextChoices):
    APPLICATION_NOT_APPROVED = "application_not_approved", "Application not approved"
    VARIANT_NOT_OFFERED = "variant_not_offered", "Variant not offered"
    ALREADY_ATTEMPTED = "already_attempted", "Already attempted for this unit"
    UNAVAILABLE_AT_START = "unavailable_at_start", "Unavailable at the requested start"
    OFFLINE_FOR_SAME_DAY = "OFFLINE_FOR_SAME_DAY", "Offline for a same-day visit"


@dataclass(frozen=True, slots=True)
class CandidateEvaluation:
    partner: PartnerProfile
    exclusions: tuple[str, ...]

    @property
    def included(self) -> bool:
        return not self.exclusions


@dataclass(frozen=True, slots=True)
class UnitRanking:
    """Every Partner the unit's service area offered, classified and in rank order."""

    evaluations: tuple[CandidateEvaluation, ...]

    @property
    def ordered(self) -> tuple[PartnerProfile, ...]:
        return tuple(item.partner for item in self.evaluations if item.included)

    def provenance(self, *, unit: FulfilmentUnit, selected: PartnerProfile) -> dict[str, object]:
        """Build the Operations-readable record of this decision."""

        ranked: list[dict[str, object]] = [
            {
                "partner_id": str(partner.id),
                "rank": index,
                "factors": {"tiebreak_partner_id": str(partner.id)},
            }
            for index, partner in enumerate(self.ordered, start=1)
        ]
        selected_rank = next(
            (entry["rank"] for entry in ranked if entry["partner_id"] == str(selected.id)),
            None,
        )
        return {
            "policy": RANKING_POLICY,
            "policy_version": RANKING_POLICY_VERSION,
            "evaluated_at": timezone.now().isoformat(),
            "pool": {
                "scope": "service_area",
                "service_area_id": str(unit.service_area_id),
                "considered": len(self.evaluations),
            },
            "selected": {"partner_id": str(selected.id), "rank": selected_rank},
            "ranked": ranked,
            "excluded": [
                {"partner_id": str(item.partner.id), "reasons": list(item.exclusions)}
                for item in self.evaluations
                if not item.included
            ],
        }


def unit_variant_ids(unit: FulfilmentUnit) -> tuple[UUID, ...]:
    """The exact set of variants a Partner must offer to serve this whole unit."""

    return tuple(
        unit.lines.filter(cart_item__isnull=False)
        .order_by("position")
        .values_list("cart_item__variant_id", flat=True)
        .distinct()
    )


def is_same_day_unit(*, unit: FulfilmentUnit, now=None) -> bool:
    """Same horizon as reachability (§7): within today's lead-time window from `now`."""

    clock = timezone.now() if now is None else now
    return unit.requested_start <= clock + timedelta(minutes=settings.M1_TODAY_LEAD_TIME_MINUTES)


def _exclusions_for(
    *,
    candidate: PartnerProfile,
    unit: FulfilmentUnit,
    required: frozenset[str],
    attempted: frozenset[str],
    online_partner_ids: frozenset[UUID],
    require_online: bool,
) -> tuple[str, ...]:
    reasons: list[str] = []
    application = getattr(candidate, "application", None)
    if application is None or application.status != PartnerApplication.Status.APPROVED:
        reasons.append(ExclusionReason.APPLICATION_NOT_APPROVED)
    offered = {str(link.variant_id) for link in candidate.service_links.all() if link.is_active}
    if not required or not required.issubset(offered):
        reasons.append(ExclusionReason.VARIANT_NOT_OFFERED)
    if str(candidate.id) in attempted:
        reasons.append(ExclusionReason.ALREADY_ATTEMPTED)
    if require_online and candidate.id not in online_partner_ids:
        reasons.append(ExclusionReason.OFFLINE_FOR_SAME_DAY)
    # Availability is read last and only for otherwise-eligible candidates: it is the one
    # check that costs a query per Partner, and a Partner excluded for the wrong service
    # does not need their calendar opened.
    if not reasons and not partner_available_during(
        partner=candidate,
        service_area=unit.service_area,
        starts_at=unit.requested_start,
        duration_minutes=unit.estimated_duration_minutes,
    ):
        reasons.append(ExclusionReason.UNAVAILABLE_AT_START)
    return tuple(reasons)


def evaluate_unit_candidates(unit: FulfilmentUnit) -> UnitRanking:
    """Classify every Partner in the unit's service area as ranked or excluded."""

    required = frozenset(str(value) for value in unit_variant_ids(unit))
    attempted = frozenset(
        str(value)
        for value in AssignmentAttempt.objects.filter(fulfilment_unit=unit).values_list(
            "candidate_id", flat=True
        )
    )
    pool = list(
        PartnerProfile.objects.filter(
            service_area_links__service_area=unit.service_area,
            service_area_links__is_active=True,
        )
        .select_related("application")
        .prefetch_related("service_links")
        .distinct()
        .order_by("id")
    )
    require_online = is_same_day_unit(unit=unit)
    online_partner_ids: frozenset[UUID] = frozenset()
    if require_online and pool:
        online_partner_ids = frozenset(
            PartnerOnlineSession.objects.filter(
                partner_id__in=[partner.id for partner in pool],
                ended_at__isnull=True,
            ).values_list("partner_id", flat=True)
        )
    return UnitRanking(
        evaluations=tuple(
            CandidateEvaluation(
                partner=candidate,
                exclusions=_exclusions_for(
                    candidate=candidate,
                    unit=unit,
                    required=required,
                    attempted=attempted,
                    online_partner_ids=online_partner_ids,
                    require_online=require_online,
                ),
            )
            for candidate in pool
        )
    )
