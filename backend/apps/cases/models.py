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

## Why the subject is a fixed set of nullable keys rather than a generic relation

A case is about a Booking, an Order, a Partner and — since Wave C6 — an M2 requirement or
engagement. Never something arbitrary. Explicit foreign keys keep referential integrity, let
PostgreSQL index them, and make an impossible case (one about nothing, or about two unrelated
things) a database error rather than a convention. A `GenericForeignKey` would buy flexibility
this domain does not want.

Wave C6 extended this table rather than building an M2 case subsystem beside it, which is the
same decision Wave C3 took about the amendment engine. One queue, one severity SLA, one audit
trail and one `holds_payout` column that the payout selector already reads: a second case model
would have meant a second Operations home screen, and an operator with two inboxes has none.
"""

import uuid
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.commerce.models import Booking, Order
from apps.partners.models import PartnerProfile

#: Every column that can be a case's subject, in one place, because the "exactly one subject"
#: check constraint is **generated from this tuple** rather than typed out beside it. RULES §3(a):
#: a constraint that enumerates a list the code also keeps is a list that drifts, and
#: `makemigrations --check` cannot see the drift because model state and migration state agree
#: with each other while both disagree with the code. Wave C6 added two subjects to a three-way
#: constraint; typing the five-way version by hand is exactly how the sixth gets missed.
CASE_SUBJECT_FIELDS: tuple[str, ...] = (
    "booking",
    "order",
    "partner",
    "requirement",
    "engagement",
)


def _exactly_one_subject() -> models.Q:
    """`(a and not b and not c…) or (b and not a and not c…) or …`, built from the tuple."""

    condition: models.Q | None = None
    for subject in CASE_SUBJECT_FIELDS:
        term = models.Q(**{f"{field}__isnull": field != subject for field in CASE_SUBJECT_FIELDS})
        condition = term if condition is None else condition | term
    if condition is None:  # pragma: no cover - the tuple is never empty
        raise ValueError("A case needs at least one possible subject.")
    return condition


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
        # Wave C6 / `M2-BE-703`. Four M2 claims that the nine above genuinely cannot carry,
        # because each has a *different required terminal result* and that column is what makes a
        # case closeable rather than merely closable.
        CANCELLATION_CONFLICT = "CANCELLATION_CONFLICT", "Conflicting cancellation claims"
        ATTENDANCE = "ATTENDANCE", "Disputed attendance"
        STAGE = "STAGE", "Disputed stage or milestone"
        OFF_PLATFORM = "OFF_PLATFORM", "Off-platform payment claim"
        #: `M2-BE-708`. A chargeback on the booking, unlock or visit-plan fee itself. Its own kind
        #: rather than `PAYMENT`, because it holds payout and `PAYMENT` deliberately does not:
        #: widening the M1 kind would change what an A1 payment-ambiguity case does to a
        #: technician's earnings, which is not this wave's decision to take.
        CHARGEBACK = "CHARGEBACK", "Chargeback on a platform fee"

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
    #: The two M2 subjects, as lazy references: `apps.requirements` imports `apps.cases`, so a
    #: concrete import here would close the cycle at module-load time.
    requirement = models.ForeignKey(
        "requirements.CustomerRequirement",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="operations_cases",
    )
    engagement = models.ForeignKey(
        "requirements.Engagement",
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
    #: Exactly which M2 ledger entries **this** case froze (`M2-BE-709`), so closing it releases
    #: those and only those.
    #:
    #: It has to be a record rather than a re-derivation, because `PENDING` is overloaded on
    #: purpose: `stages._hold_stage_payout` writes every approved stage's earning `PENDING` to
    #: carry its dispute window, so a case that released "every `PENDING` entry on this
    #: engagement" when it closed would pay out stages whose own window had not run yet. Kept as
    #: ids rather than a join table because it is written once, read once, and never queried by.
    held_ledger_entry_ids = models.JSONField(default=list, blank=True)

    # --- Wave C6 (`M2-BE-704`): response deadlines, appeals and audited manual overrides. ------
    #
    # `due_at` above is the deadline **Operations** is measured on. These are the deadline the
    # *parties* are measured on, and they are a different promise: an operator missing an SLA is
    # a staffing problem, whereas a party missing a response window is a fact a decision rests on.
    # One clock rather than one per party, because both sides answer the same question about the
    # same event and two clocks would let a decision be taken while one of them was still running.

    #: When the named parties' window to respond closes. Null when the variant set no window —
    #: the case still runs, nobody is timed out against a clock nobody set.
    response_due_at = models.DateTimeField(null=True, blank=True)
    appeal_requested_at = models.DateTimeField(null=True, blank=True)
    appeal_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    appeal_reason = models.CharField(max_length=480, blank=True)
    appeal_decided_at = models.DateTimeField(null=True, blank=True)
    appeal_decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    #: `UPHELD` keeps the original resolution; `OVERTURNED` reopens the case for a second decision.
    #: Blank until an appeal is decided.
    appeal_outcome = models.CharField(max_length=16, blank=True)

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
                # owned. Exactly one subject, derived from `CASE_SUBJECT_FIELDS`.
                condition=_exactly_one_subject(),
                name="cases_exactly_one_subject",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="RESOLVED") | ~models.Q(resolution=""),
                name="cases_resolved_requires_a_resolution",
            ),
            models.CheckConstraint(
                # An appeal cannot be decided before it is asked for, and a decided appeal names
                # its outcome. Two nullable timestamps and a blank string, so nothing is
                # enumerated here and there is no list to drift.
                condition=models.Q(appeal_decided_at__isnull=True)
                | (models.Q(appeal_requested_at__isnull=False) & ~models.Q(appeal_outcome="")),
                name="cases_decided_appeal_was_requested",
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
    # Wave C6. `OFF_PLATFORM` is deliberately **not** Finance even though it is a claim about
    # money: nobody is reconciling a payment here, they are deciding whether two people's accounts
    # of a conversation can be squared, and that is booking support's work.
    OperationsCase.Kind.CANCELLATION_CONFLICT: OperationsCase.Team.BOOKING_SUPPORT,
    OperationsCase.Kind.ATTENDANCE: OperationsCase.Team.QUALITY_SUPPORT,
    OperationsCase.Kind.STAGE: OperationsCase.Team.QUALITY_SUPPORT,
    OperationsCase.Kind.OFF_PLATFORM: OperationsCase.Team.BOOKING_SUPPORT,
    OperationsCase.Kind.CHARGEBACK: OperationsCase.Team.FINANCE,
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
    # Wave C6. Each set names what actually happened to the claim, never "reviewed" or "closed":
    # `04-acceptance-and-cutover.md` §H requires that a conflicting cancellation, a disputed
    # attendance and an off-platform claim all reach a **documented finding**, and a resolution
    # vocabulary that admitted "handled" would let the finding be skipped.
    OperationsCase.Kind.CANCELLATION_CONFLICT: frozenset(
        {"CANCELLATION_UPHELD", "CANCELLATION_REVERSED", "SETTLED"}
    ),
    OperationsCase.Kind.ATTENDANCE: frozenset(
        {"ATTENDANCE_CONFIRMED", "SHORTFALL_SETTLED", "DENIED_WITH_REASON"}
    ),
    OperationsCase.Kind.STAGE: frozenset({"STAGE_APPROVED", "STAGE_CORRECTED", "STAGE_REFUNDED"}),
    # Neither value is a verdict on a person. `M2-AC-705`/`706` require a neutral evidence process
    # in both directions, and `SUBSTANTIATED` records that the account was borne out by evidence —
    # what follows from that is the standing record, which is a separate decision with its own
    # unset owner threshold.
    OperationsCase.Kind.OFF_PLATFORM: frozenset({"SUBSTANTIATED", "UNSUBSTANTIATED", "SETTLED"}),
    # Three real endings for a chargeback and no fourth: the bank gave it back, we defended it
    # successfully, or we wrote it off. "Responded to the bank" is not an ending.
    OperationsCase.Kind.CHARGEBACK: frozenset({"RECOVERED", "REPRESENTED", "WRITTEN_OFF"}),
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
        # Wave C6 (`M2-BE-704`, `709`). Six more facts an auditor reconstructing a decision needs
        # and could not previously read: what was shown, by when somebody had to answer, that the
        # decision was challenged and how that went, that an operator overrode a rule by hand, and
        # every movement of the payout hold.
        EVIDENCE = "EVIDENCE", "Evidence submitted"
        DEADLINE_SET = "DEADLINE_SET", "Response deadline set"
        APPEAL_REQUESTED = "APPEAL_REQUESTED", "Appeal requested"
        APPEAL_DECIDED = "APPEAL_DECIDED", "Appeal decided"
        OVERRIDE = "OVERRIDE", "Manual override"
        PAYOUT_HOLD_CHANGED = "PAYOUT_HOLD_CHANGED", "Payout hold changed"

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


class OperationsCaseEvidence(models.Model):
    """What a party put in front of the decision (`M2-BE-704`). Append-only.

    **This is not an uploader.** It points at bytes that already came through one of the two
    verified rails M2 has — a `RequirementAttachment` the Customer uploaded with the request, or a
    `StageEvidence` row the vendor submitted for a stage — and adds the statement that says what
    the file is supposed to prove. Wave C5 recorded the rule this follows: "the stage-evidence
    presign is the rail to reuse, not a second uploader". A third presign, scan pipeline and
    object-key namespace would be a third place for a malware verdict to be forgotten.

    The consequence is deliberate and worth stating: a party can only submit as evidence something
    they have already legitimately put on the platform. Somebody who wants to show a photograph
    they have never uploaded uploads it first, through the rail that scans it.
    """

    class Party(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        PARTNER = "PARTNER", "Partner"
        OPERATIONS = "OPERATIONS", "Operations"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(OperationsCase, on_delete=models.PROTECT, related_name="evidence")
    party = models.CharField(max_length=16, choices=Party.choices)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    #: What this is meant to prove, in the submitter's words. Never parsed.
    statement = models.CharField(max_length=1000, blank=True)
    requirement_attachment = models.ForeignKey(
        "requirements.RequirementAttachment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="case_evidence",
    )
    stage_evidence = models.ForeignKey(
        "requirements.StageEvidence",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="case_evidence",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=("case", "created_at"))]
        constraints = [
            models.CheckConstraint(
                # At most one artifact — a row pointing at two files cannot say which one the
                # statement is about.
                condition=models.Q(requirement_attachment__isnull=True)
                | models.Q(stage_evidence__isnull=True),
                name="cases_evidence_points_at_one_artifact",
            ),
            models.CheckConstraint(
                # And it has to show *something*: a blank statement with no artifact is a row
                # that proves nothing while making the queue look answered.
                condition=~models.Q(statement="")
                | models.Q(requirement_attachment__isnull=False)
                | models.Q(stage_evidence__isnull=False),
                name="cases_evidence_shows_something",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.case_id}:{self.party}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("Operations case evidence is immutable.")
        super().save(*args, **kwargs)
