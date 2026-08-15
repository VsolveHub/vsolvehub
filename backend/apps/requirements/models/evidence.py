"""Wave C3: the records written against an engagement and its stages.

`EngagementEvent` is the audit trail, `StageEvidence` (with the upload intent in front of it) is
what the vendor actually showed, and `EngagementAmendment` is the M2 half of one
`fulfilment.ScopeAmendment`. All three hang off the spine in `engagements`; none of them owns a
status machine or a money column that the spine or `apps.fulfilment` already owns.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from .capture import RequirementAttachment

# ---------------------------------------------------------------------------
# Wave C3: the stage spine's own records.
#
# Three models, and each exists because the alternative was a lie in a record somebody will read
# years later:
#
# * `EngagementEvent` — one audit trail for the agreement and its stages. The requirement's own
#   `RequirementTransition` log ends at `ENGAGED`, and pushing forty shift-day approvals into it
#   would bury the six status changes it exists to show a Customer.
# * `StageEvidence` — what the vendor actually showed. A stage approved on nothing is an approval
#   nobody can defend in a dispute.
# * `EngagementAmendment` — the M2 side of the **M1** scope-amendment engine. It carries no
#   status, no lines and no expiry of its own: `fulfilment.ScopeAmendment` owns all three.
# ---------------------------------------------------------------------------


class EngagementEvent(models.Model):
    """Immutable record of every engagement or stage move, and who caused it.

    `stage` is null for an engagement-level move and set for a stage-level one, so one query
    reads the whole agreement's history in order. A row where `from_status == to_status` is
    deliberate and follows the precedent `services.record_transition` established in Wave C2: not
    every auditable act is a state change, and "this Partner submitted evidence at this moment"
    is exactly what a dispute asks for.

    A system-driven move — a review timeout, a payout-hold release — records `actor=None`.
    Signing it with the Customer's name would be a lie in the record that exists to prove who
    made which decision.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement", on_delete=models.PROTECT, related_name="events"
    )
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="events",
    )
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_events",
    )
    reason_code = models.SlugField(max_length=80)
    reason = models.TextField(blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = [
            models.Index(fields=("engagement", "occurred_at")),
            models.Index(fields=("stage", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.reason_code}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Engagement events are immutable.")
        super().save(*args, **kwargs)


class StageEvidenceUpload(models.Model):
    """One signed-upload intent for stage evidence, issued before any bytes exist.

    The same shape as `RequirementAttachmentUpload` and `partners.PartnerDocumentUpload`, and for
    the same reason: the server names the object key and records what it expects, so finalization
    can compare the object that actually arrived against the file the client said it was sending.
    Without the intent row there is nothing to compare against, and "verify the upload" degrades
    to "trust the client".
    """

    class Status(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        VERIFIED = "VERIFIED", "Verified"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        on_delete=models.PROTECT,
        related_name="evidence_uploads",
    )
    kind = models.CharField(max_length=16)
    object_key = models.CharField(max_length=400, unique=True)
    content_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ISSUED)
    expires_at = models.DateTimeField()
    finalized_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="requirements_stage_evidence_upload_size_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("stage", "status", "expires_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.kind}:{self.status}"


class StageEvidence(models.Model):
    """What the vendor showed for one stage. Append-only.

    Evidence is never edited or deleted, only added: a correction cycle produces a second row
    rather than replacing the first, so a dispute reads what was originally offered as well as
    what was offered after the Customer pushed back.

    A `NOTE` carries no object. Everything else carries a verified object key and a scan verdict,
    following `fulfilment.evidence`'s rule that a failed upload is never represented as completed
    evidence.
    """

    class Kind(models.TextChoices):
        NOTE = "NOTE", "Written note"
        PHOTO = "PHOTO", "Photo"
        VIDEO = "VIDEO", "Video"
        DOCUMENT = "DOCUMENT", "Document"

    #: Media kinds. A `NOTE` is the one kind with no bytes behind it.
    MEDIA_KINDS = (Kind.PHOTO, Kind.VIDEO, Kind.DOCUMENT)

    #: **The same choice set as `RequirementAttachment`, deliberately aliased rather than copied.**
    #: One scan pipeline produces one vocabulary, and a second identical `TextChoices` would have
    #: published a second identical OpenAPI component — which the generator resolves by renaming
    #: *both*, silently breaking the `ScanStatusEnum` an already-generated client imports. The
    #: 1.24.0 `ReasonEnum` note in the contract CHANGELOG is this exact failure; aliasing avoids
    #: it at the source rather than papering over it with an override.
    ProcessingStatus = RequirementAttachment.ProcessingStatus

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        "requirements.EngagementStage", on_delete=models.PROTECT, related_name="evidence"
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    note = models.TextField(blank=True)
    object_key = models.CharField(max_length=400, blank=True)
    content_type = models.CharField(max_length=120, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    processing_status = models.CharField(
        max_length=16,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PENDING,
    )
    failure_reason = models.CharField(max_length=200, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_stage_evidence_submitted",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("object_key",),
                condition=~models.Q(object_key=""),
                name="requirements_unique_stage_evidence_object",
            ),
            # A note with no text and a photograph with no object are both "evidence" that shows
            # nothing. Refused here because an approval defends itself with these rows.
            models.CheckConstraint(
                condition=(
                    models.Q(kind="NOTE", object_key="") & ~models.Q(note="")
                    | ~models.Q(kind="NOTE") & ~models.Q(object_key="")
                ),
                name="requirements_stage_evidence_kind_matches_payload",
            ),
        ]
        indexes = [
            models.Index(fields=("stage", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.kind}"


class EngagementAmendment(models.Model):
    """The M2 half of one `fulfilment.ScopeAmendment` (`M2-BE-505`).

    **There is one amendment subsystem in this codebase and it is `apps.fulfilment`.** This row
    adds the two things an M2 amendment has and an M1 one does not — an `Engagement` instead of a
    `Booking`, and a signed delta against a stage list — and borrows everything else:
    `ScopeAmendment` owns the status machine, the expiry rule and the reason; `ScopeAmendmentLine`
    owns the priced lines. Nothing here duplicates a column that lives there.

    `kind` names the two shapes the flow document calls out. A **time extension** is A3's: more
    worker-days at the rate the Customer already agreed to, priced by the server from the frozen
    engagement terms. A **change order** is A5's: additional or reduced project work, priced by
    the vendor line by line, because an A5 outcome has no catalog to price from — which is the
    documented M1 boundary (`fulfilment.amendments` prices only catalog `TASK` lines) stated as an
    extension rather than worked around.
    """

    class Kind(models.TextChoices):
        TIME_EXTENSION = "TIME_EXTENSION", "Extra time on a workforce engagement"
        CHANGE_ORDER = "CHANGE_ORDER", "Changed scope on a project engagement"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="amendments",
    )
    #: The stage this amendment changes. Null for an addition, which creates a stage rather than
    #: altering one.
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="amendments",
    )
    amendment = models.OneToOneField(
        "fulfilment.ScopeAmendment",
        on_delete=models.PROTECT,
        related_name="m2_engagement_amendment",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    #: Signed, in paise. Positive is extra work the Customer pays for; negative is scope taken out
    #: and refunded. Server-calculated from the lines in both directions — a client never states a
    #: total.
    delta_paise = models.BigIntegerField()
    payment_attempt = models.ForeignKey(
        "commerce.PaymentAttempt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_amendments",
    )
    refund = models.ForeignKey(
        "commerce.Refund",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_engagement_amendments",
    )
    applied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # A zero-delta amendment changes nothing and would still ask a Customer to decide
            # something. Refused where it cannot be argued with.
            models.CheckConstraint(
                condition=~models.Q(delta_paise=0),
                name="requirements_engagement_amendment_moves_money",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.kind}:{self.delta_paise}"
