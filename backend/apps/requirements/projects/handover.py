"""Digital deliverable handover (`M2-BE-547`).

The two halves of handing something over: the vendor submits the deliverables, and the Customer
accepts them. Both write to the engagement's own `handover_*` columns, and the rows they hang off
are `ProjectDeliverable`.

The boundary is "the thing that is handed over, not the milestone it came from". Approval,
correction and release of a milestone are spine commands in `apps.requirements.stages` and stay
there; what lives here is only the separate act of delivering a file or a location, which Event
and Media work finishes with instead of by standing somewhere. No bytes are received on this path
— files are `StageEvidence` rows the stage evidence rail already uploaded, verified and scanned.
"""

import uuid
from dataclasses import dataclass
from typing import Final

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.requirements import stages
from apps.requirements.exceptions import StageTransitionError
from apps.requirements.models import (
    Engagement,
    EngagementStage,
    ProjectDeliverable,
    StageEvidence,
)
from apps.requirements.projects.base import (
    _locked_engagement,
    _project_stage,
    assert_project_engagement,
)

#: How many rows one handover may carry. The same reasoning as `MAXIMUM_EVIDENCE_PER_STAGE`: a
#: handover a Customer cannot read in one screen is a handover they accept without reading.
MAXIMUM_DELIVERABLES_PER_HANDOVER: Final = 20


@dataclass(frozen=True, slots=True)
class DeliverableInput:
    """One thing the vendor is handing over, before the server has checked it exists."""

    title: str
    #: A `StageEvidence` row already uploaded and verified through the stage evidence rail.
    evidence_id: uuid.UUID | None = None
    #: Or an external location, recorded rather than hosted.
    external_url: str = ""
    stage_id: uuid.UUID | None = None


@transaction.atomic
def submit_project_handover(
    *, engagement_id: uuid.UUID, actor: User, note: str, items: list[DeliverableInput]
) -> Engagement:
    """The vendor hands over the digital deliverables. Partner command.

    Files reuse the stage evidence rail whole — the same presign, the same checksum verification,
    the same scan status — so this command **references** evidence and never receives bytes. A
    second uploader for deliverables would be a second bucket, a second orphan sweep and a second
    set of media-type rules that could disagree with the first.

    A `LINK` is recorded, not hosted, and saying so is more honest than pretending otherwise: a
    40 GB wedding film is never going through this rail, and a handover surface that refused links
    would push the whole exchange back into a private message. What the row buys is that *this*
    Customer accepted *that* location at *that* moment against *this* engagement.

    Re-submitting before acceptance appends rather than replaces. A vendor who forgot a file
    should not have to withdraw a handover to add one, and deleting rows the Customer has already
    looked at would make the record of what was offered depend on what was offered last.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    if engagement.status not in (Engagement.Status.ACTIVE, Engagement.Status.COMPLETING):
        raise StageTransitionError("This project is not at the handover stage.")
    if engagement.handover_accepted_at is not None:
        raise StageTransitionError("The Customer has already accepted this handover.")
    if not items:
        raise StageTransitionError("A handover needs at least one deliverable.")
    already = ProjectDeliverable.objects.filter(engagement=engagement).count()
    if already + len(items) > MAXIMUM_DELIVERABLES_PER_HANDOVER:
        raise StageTransitionError(
            f"A handover can carry up to {MAXIMUM_DELIVERABLES_PER_HANDOVER} deliverables.",
        )

    rows: list[ProjectDeliverable] = []
    for item in items:
        if not item.title.strip():
            raise StageTransitionError("Every deliverable needs a name.")
        stage: EngagementStage | None = None
        if item.stage_id is not None:
            stage = _project_stage(engagement=engagement, stage_id=item.stage_id)
        if item.evidence_id is not None:
            evidence = StageEvidence.objects.filter(
                id=item.evidence_id,
                stage__engagement=engagement,
            ).first()
            if evidence is None:
                # Scoped to this engagement, so an id belonging to somebody else's project reads
                # as "not yours" rather than confirming that it exists.
                raise StageTransitionError("That file is not attached to this project.")
            rows.append(
                ProjectDeliverable(
                    engagement=engagement,
                    stage=stage or evidence.stage,
                    kind=ProjectDeliverable.Kind.FILE,
                    title=item.title.strip()[:200],
                    evidence=evidence,
                    external_url="",
                    submitted_by=actor,
                )
            )
            continue
        url = item.external_url.strip()
        if not url.lower().startswith("https://"):
            # `https` only, and refused rather than coerced. A handover link the Customer opens is
            # a link this platform showed them, and downgrading one to plain http on their behalf
            # is not a decision to take quietly.
            raise StageTransitionError(
                "A deliverable is either a file you uploaded or an https link.",
            )
        rows.append(
            ProjectDeliverable(
                engagement=engagement,
                stage=stage,
                kind=ProjectDeliverable.Kind.LINK,
                title=item.title.strip()[:200],
                evidence=None,
                external_url=url[:1000],
                submitted_by=actor,
            )
        )
    ProjectDeliverable.objects.bulk_create(rows)

    now = timezone.now()
    engagement.handover_submitted_at = now
    engagement.handover_note = note.strip()[:4000]
    engagement.save(
        update_fields=("handover_submitted_at", "handover_note", "updated_at"),
    )
    stages.record_event(
        engagement=engagement,
        stage=None,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="handover_submitted",
        reason=f"{len(rows)} deliverable(s)",
    )
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.project.handover_submitted",
        idempotency_key=f"handover-submitted:{engagement.id}:{now.isoformat()}",
        payload={"engagement_id": str(engagement.id), "deliverables": len(rows)},
    )
    return engagement


@transaction.atomic
def accept_project_handover(*, engagement_id: uuid.UUID, actor: User) -> Engagement:
    """The Customer accepts the deliverables. Customer command.

    Acceptance is its own act rather than a side effect of closing the engagement, because the two
    can legitimately happen at different moments: a photographer delivers the gallery in week two
    of a four-week edit, and the project closes when the last milestone is approved.

    When the project is already `COMPLETING`, accepting the handover finishes it — the Customer
    has just said the only outstanding thing is done, and asking them to tap a second button to
    say so again would be the app's bookkeeping, not theirs.
    """
    engagement = _locked_engagement(engagement_id)
    assert_project_engagement(engagement)
    if engagement.handover_submitted_at is None:
        raise StageTransitionError("There is nothing to accept yet.")
    if engagement.handover_accepted_at is None:
        now = timezone.now()
        engagement.handover_accepted_at = now
        engagement.save(update_fields=("handover_accepted_at", "updated_at"))
        stages.record_event(
            engagement=engagement,
            stage=None,
            from_status=engagement.status,
            to_status=engagement.status,
            actor=actor,
            reason_code="handover_accepted",
        )
    if engagement.status == Engagement.Status.COMPLETING:
        return stages.accept_engagement_completion(engagement_id=engagement.id, actor=actor)
    engagement.refresh_from_db()
    return engagement
