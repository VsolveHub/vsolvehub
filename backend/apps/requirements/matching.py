"""Candidate eligibility, invitation waves and quote slots.

Ordering follows the contract `apps.assignments.ranking` already established for A1: every Partner
the pool offered is classified, every excluded Partner gets a *named* reason, and the decision is
recorded so Operations can explain it later. M2 adds reasons; it does not start a second record.

Capacity is held softly the moment a vendor accepts. Checking only at reconfirmation is what lets
one agency accept six Saturdays, win four and staff one.
"""

import hashlib
import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Final

from django.db import models, transaction
from django.utils import timezone

from apps.partners.capabilities import clustered_partner_ids
from apps.partners.models import (
    PartnerCapability,
    PartnerCrewMembership,
    PartnerProfile,
    PartnerServiceArea,
)
from apps.requirements.exceptions import (
    InvitationExpiredError,
    InvitationTransitionError,
    QuoteSlotConflictError,
    QuoteSlotsExhaustedError,
)
from apps.requirements.models import (
    CapacityHold,
    CustomerRequirement,
    RequirementSnapshot,
    VendorInvitation,
)
from apps.requirements.sla import add_business_hours

MATCHING_POLICY: Final[str] = "m2_capability_area_language_responsiveness"
MATCHING_POLICY_VERSION: Final[int] = 1

#: A vendor who has not opened the app in this long is not invited. Every wave spent on a dormant
#: account burns the Customer's delivery promise.
RESPONSIVENESS_WINDOW_DAYS: Final[int] = 21

#: How many vendors to invite per wave. Bounded so one requirement is not shown to a whole city.
DEFAULT_WAVE_SIZE: Final[int] = 3


class ExclusionReason(models.TextChoices):
    """Why a Partner was passed over. Named, never silent absence from a queryset."""

    CAPABILITY_NOT_APPROVED = "capability_not_approved", "No approved capability for this lifecycle"
    CAPABILITY_SUSPENDED = "capability_suspended", "Capability suspended"
    AREA_NOT_SERVED = "area_not_served", "Does not serve this area"
    LANGUAGE_MISMATCH = "language_mismatch", "Cannot work in the requirement's language"
    UNRESPONSIVE = "unresponsive", "Has not responded recently"
    CAPACITY_COMMITTED = "capacity_committed", "Already committed for these dates"
    CREW_TOO_SMALL = "crew_too_small", "Roster smaller than the requested headcount"
    ALREADY_INVITED = "already_invited", "Already invited to this requirement"
    CLUSTER_ALREADY_HOLDS_SLOT = "cluster_already_holds_slot", "Same owner already holds a slot"


@dataclass(frozen=True, slots=True)
class CandidateEvaluation:
    partner: PartnerProfile
    exclusions: tuple[str, ...]

    @property
    def included(self) -> bool:
        return not self.exclusions


@dataclass(frozen=True, slots=True)
class RequirementMatching:
    """Every Partner the pool offered, classified and in a stable order."""

    evaluations: tuple[CandidateEvaluation, ...]

    @property
    def ordered(self) -> tuple[PartnerProfile, ...]:
        included = [item.partner for item in self.evaluations if item.included]
        return tuple(sorted(included, key=lambda partner: str(partner.id)))

    def provenance(self, *, requirement: CustomerRequirement) -> dict[str, object]:
        ranked = [
            {"partner_id": str(partner.id), "rank": index}
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


def _has_committed_capacity(*, partner: PartnerProfile, starts_on: date, ends_on: date) -> bool:
    return CapacityHold.objects.filter(
        partner=partner,
        status=CapacityHold.Status.ACTIVE,
        starts_on__lte=ends_on,
        ends_on__gte=starts_on,
    ).exists()


def evaluate_candidates(
    *,
    requirement: CustomerRequirement,
    candidates: Sequence[PartnerProfile] | None = None,
) -> RequirementMatching:
    """Classify the pool. Hard eligibility only; ordering is a stable sort on Partner id."""
    if candidates is None:
        partner_ids = PartnerServiceArea.objects.filter(
            service_area=requirement.service_area, is_active=True
        ).values_list("partner_id", flat=True)
        candidates = list(PartnerProfile.objects.filter(id__in=list(partner_ids)))

    starts_on, ends_on = _requested_days(requirement)
    requested_crew = int(requirement.answers.get("worker_count") or 0)
    fresh_since = timezone.now() - timedelta(days=RESPONSIVENESS_WINDOW_DAYS)

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

    evaluations: list[CandidateEvaluation] = []
    for partner in candidates:
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

        if not PartnerServiceArea.objects.filter(
            partner=partner, service_area=requirement.service_area, is_active=True
        ).exists():
            reasons.append(ExclusionReason.AREA_NOT_SERVED)

        if partner.id in invited_partner_ids:
            reasons.append(ExclusionReason.ALREADY_INVITED)

        cluster_key = _cluster_key(partner)
        if cluster_key in held_clusters:
            reasons.append(ExclusionReason.CLUSTER_ALREADY_HOLDS_SLOT)

        if partner.online_sessions.filter(started_at__gte=fresh_since).count() == 0:
            reasons.append(ExclusionReason.UNRESPONSIVE)

        if _has_committed_capacity(partner=partner, starts_on=starts_on, ends_on=ends_on):
            reasons.append(ExclusionReason.CAPACITY_COMMITTED)

        if requested_crew:
            roster = PartnerCrewMembership.objects.filter(
                partner=partner, status=PartnerCrewMembership.Status.ACTIVE
            ).count()
            if roster < requested_crew:
                reasons.append(ExclusionReason.CREW_TOO_SMALL)

        evaluations.append(CandidateEvaluation(partner=partner, exclusions=tuple(reasons)))

    return RequirementMatching(evaluations=tuple(evaluations))


def _cluster_key(partner: PartnerProfile) -> str:
    """A stable key for the beneficial owner behind this Partner account."""
    linked = clustered_partner_ids(partner)
    return hashlib.sha256(",".join(sorted(str(pid) for pid in linked)).encode()).hexdigest()


def live_slot_count(requirement: CustomerRequirement) -> int:
    return VendorInvitation.objects.filter(
        requirement=requirement,
        status__in=VendorInvitation.SLOT_HOLDING_STATUSES,
    ).count()


def _max_slots(requirement: CustomerRequirement) -> int:
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
