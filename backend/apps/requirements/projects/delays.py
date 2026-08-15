"""Customer-caused delay and the schedule extension (`M2-BE-544`).

The whole life of a `ProjectDelayClaim`: the vendor raises one, the Customer accepts or rejects
it, and an unanswered one expires. Accepting it shifts this milestone and every later one, which
is the only write in this slice that touches anything outside the claim itself.

The boundary is **the schedule and nothing but the schedule**. No function here moves a paisa, and
none can: a delay that costs money is extra work priced through the M1 amendment engine. If a
change to a project's dates would also change what the Customer owes, it does not belong in this
module.
"""

import uuid
from datetime import datetime, timedelta
from typing import Final

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.requirements import pricing, stages
from apps.requirements.exceptions import AmendmentNotActionableError, StageTransitionError
from apps.requirements.models import (
    Engagement,
    EngagementStage,
    ProjectDelayClaim,
    StageEvidence,
)
from apps.requirements.projects.base import _assert_engagement_open, assert_project_engagement

#: The most calendar days one delay claim may ask for. A sanity bound and explicitly **not** a
#: policy: a vendor who needs a quarter of a year back is renegotiating the project rather than
#: extending it, and that is a scope amendment or a cancellation. Bounding it here rather than on
#: the model keeps the table free of anything that looks like an owner decision.
MAXIMUM_EXTENSION_DAYS: Final = 90


@transaction.atomic
def raise_delay_claim(
    *,
    stage_id: uuid.UUID,
    actor: User,
    reason_code: str,
    description: str,
    extension_days: int,
    evidence_ids: list[uuid.UUID] | None = None,
) -> ProjectDelayClaim:
    """The vendor says the Customer held this milestone up, and asks for the days back.

    **No money moves and none can.** `ProjectDelayClaim` has no amount column, deliberately: a
    delay that costs money is extra work priced through the M1 amendment engine, which the
    Customer accepts and pays for. A single record that could do both would let "the site was
    locked" arrive as a bill the Customer never agreed to.

    Evidence is the stage's own `StageEvidence` rows, uploaded through the rail that already
    exists. The claim references them rather than owning them, so the same photograph can answer a
    dispute about the same milestone without being uploaded twice — and so a claim carries the
    scan status the evidence rail already computes rather than a second, weaker one.

    One live claim per stage, held by `requirements_one_live_delay_claim_per_stage`. Two open
    claims on one milestone would be two answers the Customer has to give about one week.
    """
    stage = (
        EngagementStage.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement__configuration", "engagement__partner")
        .get(pk=stage_id)
    )
    engagement = stage.engagement
    assert_project_engagement(engagement)
    _assert_engagement_open(engagement)
    if stage.status not in EngagementStage.OPEN_STATUSES:
        raise StageTransitionError("This milestone is finished, so its dates cannot move.")
    if not reason_code:
        raise StageTransitionError("A delay claim needs a reason code.")
    if not description.strip():
        raise StageTransitionError("Say what held the work up.")
    if extension_days <= 0:
        raise StageTransitionError("A delay claim has to ask for at least one day.")
    if extension_days > MAXIMUM_EXTENSION_DAYS:
        raise StageTransitionError(
            f"A delay claim can ask for at most {MAXIMUM_EXTENSION_DAYS} days. Longer than that "
            "is a change to the project, not an extension.",
        )
    if ProjectDelayClaim.objects.filter(
        stage=stage,
        status__in=ProjectDelayClaim.LIVE_STATUSES,
    ).exists():
        raise AmendmentNotActionableError(
            "A delay claim on this milestone is already waiting for the Customer.",
        )

    # Raises `m2_policy_unavailable` when the owner has set no response window. Reused from the
    # amendment engine rather than given its own knob: it is the same promise — how long the
    # Customer has to answer the vendor about the agreed work — and a second unset value would
    # block a second command on a decision nobody has been asked for.
    expires_at = pricing.amendment_response_deadline(engagement.requirement)

    claim = ProjectDelayClaim.objects.create(
        engagement=engagement,
        stage=stage,
        raised_by=actor,
        reason_code=reason_code[:80],
        description=description.strip(),
        extension_days=extension_days,
        expires_at=expires_at,
    )
    wanted = list(evidence_ids or [])
    if wanted:
        # Scoped to this stage, so a foreign id reads as "not on this milestone" rather than
        # confirming that somebody else's evidence exists.
        claim.evidence.set(StageEvidence.objects.filter(stage=stage, id__in=wanted))
    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=stage.status,
        to_status=stage.status,
        actor=actor,
        reason_code="delay_claim_raised",
        reason=f"+{extension_days}d: {claim.reason_code}",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.delay_claimed",
        idempotency_key=f"delay-claim:{claim.id}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "delay_claim_id": str(claim.id),
            "extension_days": extension_days,
        },
    )
    return claim


@transaction.atomic
def decide_delay_claim(
    *, delay_claim_id: uuid.UUID, actor: User, accept: bool, note: str = ""
) -> ProjectDelayClaim:
    """The Customer answers a delay claim. Accepting moves the schedule and nothing else.

    An accepted claim shifts **this milestone and every one after it**, because a project is a
    sequence: a week lost on the first-fix is a week lost on everything that follows, and moving
    only the delayed milestone would produce an agreement whose remaining dates say the vendor can
    make it up by working two milestones at once.

    A milestone with no date is left alone rather than given one. `engagements._a5_stages` takes
    dates from the estimate's own `ends_on`, which is optional — a vendor who priced milestones
    without dating them has a project with no schedule to extend, and inventing dates for it here
    would be the server writing an agreement neither party made.
    """
    claim = (
        ProjectDelayClaim.objects.select_for_update(of=("self",))
        .select_related("engagement__requirement", "stage")
        .get(pk=delay_claim_id)
    )
    if claim.status != ProjectDelayClaim.Status.SUBMITTED:
        raise AmendmentNotActionableError("This delay claim has already been decided.")
    if claim.expires_at <= timezone.now():
        expire_delay_claim(delay_claim_id=claim.id)
        raise AmendmentNotActionableError("This delay claim expired before it was answered.")

    now = timezone.now()
    claim.decided_by = actor
    claim.decided_at = now
    claim.decision_note = note.strip()[:2000]
    if not accept:
        claim.status = ProjectDelayClaim.Status.REJECTED
        claim.save(
            update_fields=("status", "decided_by", "decided_at", "decision_note", "updated_at")
        )
        stages.record_event(
            engagement=claim.engagement,
            stage=claim.stage,
            from_status=ProjectDelayClaim.Status.SUBMITTED,
            to_status=claim.status,
            actor=actor,
            reason_code="delay_claim_rejected",
            reason=claim.decision_note,
        )
        return claim

    claim.status = ProjectDelayClaim.Status.ACCEPTED
    claim.applied_days = claim.extension_days
    claim.save(
        update_fields=(
            "status",
            "applied_days",
            "decided_by",
            "decided_at",
            "decision_note",
            "updated_at",
        )
    )
    shifted = _shift_schedule_from(
        engagement=claim.engagement,
        from_position=claim.stage.position,
        days=claim.extension_days,
    )
    stages.record_event(
        engagement=claim.engagement,
        stage=claim.stage,
        from_status=ProjectDelayClaim.Status.SUBMITTED,
        to_status=claim.status,
        actor=actor,
        reason_code="delay_claim_accepted",
        reason=f"+{claim.extension_days}d on {shifted} milestone(s): {claim.decision_note}",
    )
    return claim


def _shift_schedule_from(*, engagement: Engagement, from_position: int, days: int) -> int:
    """Move this milestone and every later one by `days`. Returns how many actually moved.

    `original_terms` is untouched, which is the whole of `M2-BE-549` on this path: the date the
    Customer agreed to and the date the work is now due are both readable, and the difference
    between them is the extension somebody accepted.
    """
    moved = 0
    for stage in (
        EngagementStage.objects.select_for_update()
        .filter(
            engagement=engagement,
            position__gte=from_position,
            scheduled_on__isnull=False,
        )
        .exclude(status=EngagementStage.Status.CANCELLED)
        .order_by("position")
    ):
        if stage.scheduled_on is None:  # pragma: no cover - excluded by the filter above
            continue
        stage.scheduled_on = stage.scheduled_on + timedelta(days=days)
        stage.save(update_fields=("scheduled_on", "updated_at"))
        moved += 1
    return moved


@transaction.atomic
def expire_delay_claim(*, delay_claim_id: uuid.UUID) -> ProjectDelayClaim:
    """The Customer never answered. Idempotent by state, for overlapping sweeps.

    Expiry is a **refusal**, not a silent acceptance: an unanswered claim leaves the agreed dates
    standing. Treating silence as consent would let a vendor move a Customer's schedule by filing
    a claim on a Friday afternoon.
    """
    claim = ProjectDelayClaim.objects.select_for_update(of=("self",)).get(pk=delay_claim_id)
    if claim.status != ProjectDelayClaim.Status.SUBMITTED:
        return claim
    if claim.expires_at > timezone.now():
        return claim
    claim.status = ProjectDelayClaim.Status.EXPIRED
    claim.save(update_fields=("status", "updated_at"))
    stages.record_event(
        engagement=claim.engagement,
        stage=claim.stage,
        from_status=ProjectDelayClaim.Status.SUBMITTED,
        to_status=claim.status,
        actor=None,
        reason_code="delay_claim_expired",
    )
    return claim


def expired_delay_claim_ids(*, at: datetime | None = None) -> list[uuid.UUID]:
    moment = at or timezone.now()
    return list(
        ProjectDelayClaim.objects.filter(
            status=ProjectDelayClaim.Status.SUBMITTED,
            expires_at__lt=moment,
        ).values_list("id", flat=True)
    )
