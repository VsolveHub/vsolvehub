"""Durable idempotency and transactional outbox records."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class IdempotencyRecord(models.Model):
    """Stores the authoritative result for a retryable command."""

    class Status(models.TextChoices):
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="idempotency_records",
    )
    operation = models.CharField(max_length=120)
    key = models.CharField(max_length=128)
    request_fingerprint = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROCESSING)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("actor", "operation", "key"),
                name="foundation_unique_actor_operation_idempotency_key",
                nulls_distinct=False,
            ),
        ]
        indexes = [models.Index(fields=("operation", "key"))]

    def __str__(self) -> str:
        return f"{self.operation}:{self.key}"


class OutboxEvent(models.Model):
    """An event committed with domain state and delivered at-least-once after commit."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        PUBLISHED = "PUBLISHED", "Published"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    aggregate_type = models.CharField(max_length=100)
    aggregate_id = models.UUIDField()
    event_type = models.CharField(max_length=160)
    idempotency_key = models.CharField(max_length=128)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    available_at = models.DateTimeField(default=timezone.now)
    last_error = models.CharField(max_length=500, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("event_type", "idempotency_key"),
                name="foundation_unique_outbox_event_idempotency_key",
            ),
        ]
        indexes = [
            models.Index(fields=("status", "available_at")),
            models.Index(fields=("aggregate_type", "aggregate_id")),
        ]

    def __str__(self) -> str:
        return f"{self.event_type}:{self.id}"
