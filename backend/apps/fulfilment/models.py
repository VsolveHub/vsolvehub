"""Post-booking fulfilment: state history, OTP, work, evidence, amendment and completion.

`commerce.Booking` is the aggregate root (one row per `FulfilmentUnit`, per the domain model).
Everything here is scoped to a `Booking` and is append-only except where explicitly noted.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commerce.models import Booking, PaymentAttempt
from apps.partners.models import PartnerProfile


class BookingStatusHistory(models.Model):
    """Immutable evidence of every transition a Booking has gone through.

    Mirrors `apps.assignments.models.DispatchCommandAudit`: actor, source/target state, reason,
    idempotency key and request/trace identity, exactly as `03-lifecycle-and-state-machines.md`
    requires for every fulfilment transition.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="status_history")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    command = models.CharField(max_length=64)
    from_status = models.CharField(max_length=32)
    to_status = models.CharField(max_length=32)
    reason = models.CharField(max_length=240, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    request_trace_id = models.CharField(max_length=64, blank=True)
    context = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=("booking", "created_at"))]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.from_status}->{self.to_status}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Booking status history rows are immutable.")
        super().save(*args, **kwargs)


class BookingOtp(models.Model):
    """Start-OTP challenge, scoped to one Booking.

    Hashed, short-lived, single-use, attempt-limited.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="otp_challenges")
    code_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("booking", "created_at"))]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.created_at.isoformat()}"

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_locked(self) -> bool:
        return self.failed_attempts >= self.max_attempts


class WorkSession(models.Model):
    """The authoritative work-start event. One per Booking."""

    class StartedVia(models.TextChoices):
        CUSTOMER_OTP = "CUSTOMER_OTP", "Customer OTP"
        OPERATIONS_ASSISTED = "OPERATIONS_ASSISTED", "Operations assisted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="work_session")
    started_at = models.DateTimeField()
    started_via = models.CharField(max_length=24, choices=StartedVia.choices)
    assisted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    assisted_reason = models.CharField(max_length=240, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.booking_id)


class ScopeAmendment(models.Model):
    """A Partner-proposed scope/material change, priced from the active catalog."""

    class Status(models.TextChoices):
        PROPOSED = "PROPOSED", "Proposed"
        CUSTOMER_APPROVED = "CUSTOMER_APPROVED", "Customer approved"
        CUSTOMER_DECLINED = "CUSTOMER_DECLINED", "Customer declined"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        AUTHORIZED = "AUTHORIZED", "Authorized"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="scope_amendments")
    proposed_by = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    reason = models.CharField(max_length=240)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PROPOSED)
    version = models.PositiveIntegerField(default=1)
    evidence_required = models.BooleanField(default=True)
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("booking", "status"))]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.id}"


class ScopeAmendmentLine(models.Model):
    class Kind(models.TextChoices):
        TASK = "TASK", "Task"
        MATERIAL = "MATERIAL", "Material"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    amendment = models.ForeignKey(ScopeAmendment, on_delete=models.PROTECT, related_name="lines")
    position = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    code = models.CharField(max_length=140)
    label = models.CharField(max_length=240)
    quantity = models.PositiveIntegerField(default=1)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("amendment", "position"),
                name="fulfilment_unique_amendment_line_position",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.amendment_id}:{self.position}"


class PriceRevision(models.Model):
    """The immutable, authorized price change produced by one approved ScopeAmendment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="price_revisions")
    amendment = models.OneToOneField(
        ScopeAmendment, on_delete=models.PROTECT, related_name="price_revision"
    )
    payment_attempt = models.ForeignKey(
        PaymentAttempt,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="fulfilment_price_revisions",
    )
    delta_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    authorized_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.id)


class WorkTask(models.Model):
    """The one thing a `WorkOutcome` always points to.

    Materialized one-per-`FulfilmentUnitLine` at the first `IN_PROGRESS` transition
    (`kind=ORIGINAL`), and one-per-line when a `ScopeAmendment` is authorized (`kind=AMENDMENT`).
    """

    class Kind(models.TextChoices):
        ORIGINAL = "ORIGINAL", "Original scope"
        AMENDMENT = "AMENDMENT", "Approved amendment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="work_tasks")
    fulfilment_unit_line = models.ForeignKey(
        "carts.FulfilmentUnitLine",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="work_tasks",
    )
    scope_amendment_line = models.ForeignKey(
        ScopeAmendmentLine,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="work_tasks",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    position = models.PositiveSmallIntegerField()
    code = models.CharField(max_length=140)
    label = models.CharField(max_length=240)
    quantity = models.PositiveIntegerField(default=1)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("booking", "position"),
                name="fulfilment_unique_work_task_position",
            ),
            models.UniqueConstraint(
                fields=("fulfilment_unit_line",),
                condition=models.Q(fulfilment_unit_line__isnull=False),
                name="fulfilment_unique_task_per_unit_line",
            ),
            models.UniqueConstraint(
                fields=("scope_amendment_line",),
                condition=models.Q(scope_amendment_line__isnull=False),
                name="fulfilment_unique_task_per_amendment_line",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        kind="ORIGINAL",
                        fulfilment_unit_line__isnull=False,
                        scope_amendment_line__isnull=True,
                    )
                    | models.Q(
                        kind="AMENDMENT",
                        fulfilment_unit_line__isnull=True,
                        scope_amendment_line__isnull=False,
                    )
                ),
                name="fulfilment_work_task_kind_matches_source",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.position}"


class WorkEvidence(models.Model):
    """Private, purpose-bound evidence.

    A failed upload is never represented as completed evidence.
    """

    class Kind(models.TextChoices):
        BEFORE = "BEFORE", "Before"
        AFTER = "AFTER", "After"
        CONTACT_ATTEMPT = "CONTACT_ATTEMPT", "Contact attempt"
        SAFETY = "SAFETY", "Safety"
        DAMAGE = "DAMAGE", "Damage"
        AMENDMENT = "AMENDMENT", "Amendment"
        COMPLETION = "COMPLETION", "Completion"
        WAIT = "WAIT", "Wait"

    class ProcessingStatus(models.TextChoices):
        PENDING = "PENDING", "Pending scan"
        CLEAN = "CLEAN", "Clean"
        FAILED = "FAILED", "Failed scan"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="evidence")
    work_task = models.ForeignKey(
        WorkTask, null=True, blank=True, on_delete=models.PROTECT, related_name="evidence"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    object_key = models.CharField(max_length=255, unique=True)
    content_type = models.CharField(max_length=100)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    processing_status = models.CharField(
        max_length=16,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("booking", "kind"))]

    def __str__(self) -> str:
        return self.object_key


class CustomerContactAttempt(models.Model):
    """One masked contact attempt during the Customer-unavailable wait workflow."""

    class Outcome(models.TextChoices):
        NO_ANSWER = "NO_ANSWER", "No answer"
        ANSWERED = "ANSWERED", "Answered"
        DELIVERY_FAILED = "DELIVERY_FAILED", "Delivery failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="contact_attempts")
    attempted_at = models.DateTimeField()
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("attempted_at",)

    def __str__(self) -> str:
        return f"{self.booking_id}:{self.attempted_at.isoformat()}"


class CompletionSubmission(models.Model):
    """Partner completion submission.

    One per Booking; a resubmission after abort is not modelled.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField(
        Booking, on_delete=models.PROTECT, related_name="completion_submission"
    )
    submitted_by = models.ForeignKey(PartnerProfile, on_delete=models.PROTECT)
    notes = models.CharField(max_length=1000, blank=True)
    safety_damage_declared = models.BooleanField(default=False)
    submitted_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.booking_id)


class WorkOutcome(models.Model):
    class Outcome(models.TextChoices):
        COMPLETED = "COMPLETED", "Completed"
        PARTIAL = "PARTIAL", "Partial"
        NOT_STARTED = "NOT_STARTED", "Not started"
        BLOCKED = "BLOCKED", "Blocked"
        NOT_APPLICABLE = "NOT_APPLICABLE", "Not applicable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    completion_submission = models.ForeignKey(
        CompletionSubmission, on_delete=models.PROTECT, related_name="outcomes"
    )
    work_task = models.ForeignKey(WorkTask, on_delete=models.PROTECT, related_name="outcomes")
    outcome = models.CharField(max_length=20, choices=Outcome.choices)
    quantity = models.PositiveIntegerField(default=0)
    reason = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("completion_submission", "work_task"),
                name="fulfilment_unique_outcome_per_task",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.completion_submission_id}:{self.work_task_id}"


class CompletionResponse(models.Model):
    class Decision(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        DISPUTED = "DISPUTED", "Disputed"
        AUTO_FINALIZED = "AUTO_FINALIZED", "Auto-finalized"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    completion_submission = models.OneToOneField(
        CompletionSubmission, on_delete=models.PROTECT, related_name="response"
    )
    responded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT
    )
    decision = models.CharField(max_length=20, choices=Decision.choices)
    dispute_reason = models.CharField(max_length=500, blank=True)
    disputed_outcomes = models.ManyToManyField(WorkOutcome, blank=True, related_name="disputes")
    responded_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return str(self.completion_submission_id)
