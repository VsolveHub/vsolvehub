"""Operations cases: the record of a human decision, and the audit that justifies it.

`06-fulfilment-safety-quality-and-disputes.md` gives every case a type, severity, owner, due
time, status and a *required terminal result*. That last column is the load-bearing one, and it
is why this is a typed model rather than a ticket with free text: "cases may escalate, but they
may not close merely because a notification was sent". A case closes by naming what actually
happened to the booking, the money or the person.

## Why events are append-only

A case is the paper trail for a decision that moved money or affected someone's safety. An
editable history is not a paper trail. `OperationsCaseEvent` refuses `save()` on an existing row
for the same reason `BookingStatusHistory` and `DispatchCommandAudit` do.

## Why the subject is three nullable keys rather than a generic relation

A case is about a Booking, an Order or a Partner — never something arbitrary. Three explicit
foreign keys keep referential integrity, let PostgreSQL index them, and make an impossible case
(one about nothing, or about two unrelated things) a database error rather than a convention.
A `GenericForeignKey` would buy flexibility this domain does not want.
"""

import uuid
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commerce.models import Booking, Order
from apps.partners.models import PartnerProfile


class OperationsCase(models.Model):
    """One piece of work owned by a named Operations team, with a deadline it is measured on."""

    class Kind(models.TextChoices):
        # The seven rows of the case-ownership table, plus quality.
        ASSIGNMENT = "ASSIGNMENT", "Assignment or recovery"
        LATE_NO_SHOW = "LATE_NO_SHOW", "Late or no-show"
        CUSTOMER_UNAVAILABLE = "CUSTOMER_UNAVAILABLE", "Customer unavailable"
        PARTIAL_WORK = "PARTIAL_WORK", "Partial or aborted work"
        QUALITY = "QUALITY", "Quality or warranty"
        SAFETY = "SAFETY", "Safety or damage"
        PAYMENT = "PAYMENT", "Payment ambiguity"
        REFUND = "REFUND", "Refund ambiguity"
        PAYOUT = "PAYOUT", "Payout ambiguity"

    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        NORMAL = "NORMAL", "Normal"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        WAITING = "WAITING", "Waiting on someone"
        RESOLVED = "RESOLVED", "Resolved"
        CANCELLED = "CANCELLED", "Cancelled"

    class Team(models.TextChoices):
        DISPATCH = "DISPATCH", "Dispatch Operations"
        BOOKING_SUPPORT = "BOOKING_SUPPORT", "Booking support"
        QUALITY_SUPPORT = "QUALITY_SUPPORT", "Quality support"
        SAFETY = "SAFETY", "Restricted safety team"
        FINANCE = "FINANCE", "Finance Operations"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=24, choices=Kind.choices)
    severity = models.CharField(max_length=8, choices=Severity.choices, default=Severity.NORMAL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    owner_team = models.CharField(max_length=20, choices=Team.choices)
    #: The individual who claimed it. A case always has a team; an owner is optional until
    #: somebody picks it up, which is what makes an unclaimed queue visible.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="owned_operations_cases",
    )

    booking = models.ForeignKey(
        Booking, null=True, blank=True, on_delete=models.PROTECT, related_name="operations_cases"
    )
    order = models.ForeignKey(
        Order, null=True, blank=True, on_delete=models.PROTECT, related_name="operations_cases"
    )
    partner = models.ForeignKey(
        PartnerProfile,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="operations_cases",
    )

    summary = models.CharField(max_length=240)
    #: Why the case exists, in the words of whatever opened it. Free text, never parsed.
    detail = models.TextField(blank=True)
    due_at = models.DateTimeField()
    version = models.PositiveIntegerField(default=1)

    #: What actually happened. A case may not reach `RESOLVED` without one — see
    #: `apps.cases.services.resolve_case`, which enforces it at the command boundary.
    resolution = models.CharField(max_length=48, blank=True)
    resolution_note = models.CharField(max_length=480, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    #: Set while a case is holding money back. Read by the payout selector, so a disputed or
    #: unsafe job cannot be paid out from under an open investigation.
    holds_payout = models.BooleanField(default=False)

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        indexes = [
            models.Index(fields=("status", "due_at")),
            models.Index(fields=("owner_team", "status")),
            models.Index(fields=("kind", "status")),
        ]
        constraints = [
            models.CheckConstraint(
                # A case about nothing cannot be worked, and a case about everything cannot be
                # owned. Exactly one subject.
                condition=(
                    models.Q(booking__isnull=False, order__isnull=True, partner__isnull=True)
                    | models.Q(booking__isnull=True, order__isnull=False, partner__isnull=True)
                    | models.Q(booking__isnull=True, order__isnull=True, partner__isnull=False)
                ),
                name="cases_exactly_one_subject",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="RESOLVED") | ~models.Q(resolution=""),
                name="cases_resolved_requires_a_resolution",
            ),
            models.UniqueConstraint(
                fields=("idempotency_key",),
                condition=~models.Q(idempotency_key=""),
                name="cases_unique_open_key",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.status}"

    @property
    def is_overdue(self) -> bool:
        return self.status not in TERMINAL_CASE_STATUSES and timezone.now() > self.due_at


TERMINAL_CASE_STATUSES = frozenset(
    {OperationsCase.Status.RESOLVED, OperationsCase.Status.CANCELLED}
)

#: Which team owns each case type on creation, straight from the ownership table. Held here
#: rather than passed in, so an opener cannot route a safety case to booking support.
DEFAULT_TEAM: dict[str, str] = {
    OperationsCase.Kind.ASSIGNMENT: OperationsCase.Team.DISPATCH,
    OperationsCase.Kind.LATE_NO_SHOW: OperationsCase.Team.BOOKING_SUPPORT,
    OperationsCase.Kind.CUSTOMER_UNAVAILABLE: OperationsCase.Team.BOOKING_SUPPORT,
    OperationsCase.Kind.PARTIAL_WORK: OperationsCase.Team.QUALITY_SUPPORT,
    OperationsCase.Kind.QUALITY: OperationsCase.Team.QUALITY_SUPPORT,
    OperationsCase.Kind.SAFETY: OperationsCase.Team.SAFETY,
    OperationsCase.Kind.PAYMENT: OperationsCase.Team.FINANCE,
    OperationsCase.Kind.REFUND: OperationsCase.Team.FINANCE,
    OperationsCase.Kind.PAYOUT: OperationsCase.Team.FINANCE,
}

#: Response SLA per severity. A due time is what makes "cases may not close merely because a
#: notification was sent" measurable rather than aspirational.
SLA_HOURS: dict[str, int] = {
    OperationsCase.Severity.URGENT: 1,
    OperationsCase.Severity.HIGH: 4,
    OperationsCase.Severity.NORMAL: 24,
    OperationsCase.Severity.LOW: 72,
}

#: The terminal results the ownership table requires, per case type. A resolution outside this
#: set is refused: it is how "documented outcome" stays a real constraint instead of a habit.
ALLOWED_RESOLUTIONS: dict[str, frozenset[str]] = {
    OperationsCase.Kind.ASSIGNMENT: frozenset({"REPLACED", "RESCHEDULED", "REFUNDED"}),
    OperationsCase.Kind.LATE_NO_SHOW: frozenset({"PERFORMED", "CANCELLED", "VISIT_FEE_DECIDED"}),
    OperationsCase.Kind.CUSTOMER_UNAVAILABLE: frozenset(
        {"PERFORMED", "CANCELLED", "VISIT_FEE_DECIDED"}
    ),
    OperationsCase.Kind.PARTIAL_WORK: frozenset({"LINES_SETTLED", "REFUNDED"}),
    OperationsCase.Kind.QUALITY: frozenset({"CALLBACK_BOOKED", "DENIED_WITH_REASON", "SETTLED"}),
    OperationsCase.Kind.SAFETY: frozenset({"PROTECTIVE_ACTION_TAKEN", "DOCUMENTED_NO_ACTION"}),
    OperationsCase.Kind.PAYMENT: frozenset({"RECONCILED"}),
    OperationsCase.Kind.REFUND: frozenset({"RECONCILED"}),
    OperationsCase.Kind.PAYOUT: frozenset({"PAID_ONCE", "RESERVATION_RELEASED"}),
}


def default_due_at(severity: str) -> Any:
    return timezone.now() + timedelta(hours=SLA_HOURS[severity])


class OperationsCaseEvent(models.Model):
    """Append-only: every state change, note and outbound message on a case.

    Communication lives here rather than in a separate table because "we told the customer" and
    "we changed the severity" are the same kind of fact for an auditor reconstructing what
    Operations knew and when.
    """

    class Kind(models.TextChoices):
        OPENED = "OPENED", "Opened"
        CLAIMED = "CLAIMED", "Claimed"
        STATUS_CHANGED = "STATUS_CHANGED", "Status changed"
        SEVERITY_CHANGED = "SEVERITY_CHANGED", "Severity changed"
        NOTE = "NOTE", "Note"
        COMMUNICATION = "COMMUNICATION", "Communication sent"
        RESOLVED = "RESOLVED", "Resolved"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(OperationsCase, on_delete=models.PROTECT, related_name="events")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    body = models.CharField(max_length=1000, blank=True)
    context = models.JSONField(default=dict)
    idempotency_key = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=("case", "created_at"))]

    def __str__(self) -> str:
        return f"{self.case_id}:{self.kind}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Operations case events are immutable.")
        super().save(*args, **kwargs)
