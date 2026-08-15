"""Wave C4: the shift-day — who was promised, who came, and what was settled at day end.

`StageCrewAssignment`, `ShiftAttendance`, `DaySettlement`, `SafetyIncident` and
`CashDemandReport`, all of them hanging off one `EngagementStage`. Nothing here holds, moves or
books wage money; the one online charge on this path is `BookingFee` in `rate_cards`.
"""

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.partners.models import PartnerProfile

# ---------------------------------------------------------------------------
# Wave C4 (`M2-BE-521..539`): the shift-day.
#
# A3 maps a stage to a shift-day (`07-state-machines-and-permissions.md` §5), and everything below
# hangs off that one sentence. Five models, and the split between them is the split between three
# different kinds of claim:
#
# * `StageCrewAssignment` — who was promised, per **stage**, because multi-day labour rotates faces
#   legitimately and a per-engagement roster cannot say who is coming on Thursday.
# * `ShiftAttendance` — what the supervisor says happened, and the Customer's one-tap answer. One
#   row per shift-day, never one per worker: the workers do not carry the app, the supervisor does.
# * `DaySettlement` — the evening dual tap. Its money columns are a **record of a peer-to-peer
#   payment this platform never touches**, kept because the settlement evidence pack and the UPI
#   deep-link both need the exact published amount.
# * `SafetyIncident` — a first-class report, never a cancellation reason.
# * `CashDemandReport` — a Customer's one-tap account of an extra demanded in cash on site.
#
# Nothing here holds, moves or books wage money, and nothing here may be extended to. The one
# online charge on this path is the booking fee, and it lives in `BookingFee` above.
# ---------------------------------------------------------------------------


class StageCrewAssignment(models.Model):
    """One named worker on one shift-day (`M2-BE-522`).

    **Per stage, not per engagement.** A four-day shifting job is four shift-days and the gang that
    turns up on day three is legitimately not the gang from day one; a roster hung off the
    engagement would either forbid that or record a lie about who was there.

    The cross-agency conflict rule is a **database constraint**, not a check in a service. Crew
    identity is global — `partners.CrewMember` resolves one person from a keyed hash of their
    number, so the same worker promised through two agencies is one row — and
    `requirements_crew_member_one_shift_a_day` makes promising them twice on one date impossible
    rather than unlikely. `assign_crew` raises `m2_crew_conflict` first, with the name and the date
    in the message, because a `409` a supervisor can act on beats an `IntegrityError`; the
    constraint is what holds when two supervisors tap at the same moment.

    `shift_date` is denormalised from `EngagementStage.scheduled_on` for exactly that constraint —
    a unique index cannot reach across a join. `assign_crew` refuses a stage with no scheduled date
    rather than defaulting one, because "which day is this crew for" is not a question the server
    may answer on the supervisor's behalf.
    """

    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        RELEASED = "RELEASED", "Released"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        on_delete=models.PROTECT,
        related_name="crew_assignments",
    )
    #: Denormalised from `stage.engagement`, so "is this worker double-booked" is one query
    #: against this table instead of a join through two aggregates on every assignment.
    partner = models.ForeignKey(
        PartnerProfile,
        on_delete=models.PROTECT,
        related_name="m2_stage_crew_assignments",
    )
    membership = models.ForeignKey(
        "partners.PartnerCrewMembership",
        on_delete=models.PROTECT,
        related_name="stage_assignments",
    )
    #: The global person. Denormalised from the membership because the conflict rule is about the
    #: **person**, not about one agency's row for them.
    crew_member = models.ForeignKey(
        "partners.CrewMember",
        on_delete=models.PROTECT,
        related_name="stage_assignments",
    )
    shift_date = models.DateField()
    is_supervisor = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ASSIGNED)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_crew_assignments_made",
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    released_at = models.DateTimeField(null=True, blank=True)
    #: Why a name came off the shift. A substitution is a release plus an assignment, and the
    #: reason is what tells the Customer's notification which of the two it was.
    released_reason_code = models.SlugField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("stage", "assigned_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("stage", "membership"),
                condition=models.Q(status="ASSIGNED"),
                name="requirements_unique_active_stage_crew",
            ),
            # `m2_crew_conflict`, as a fact the database holds. Scoped to `ASSIGNED` so a released
            # name can be re-assigned, and so a substitution is not blocked by the person it
            # replaced.
            models.UniqueConstraint(
                fields=("crew_member", "shift_date"),
                condition=models.Q(status="ASSIGNED"),
                name="requirements_crew_member_one_shift_a_day",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="RELEASED") | models.Q(released_at__isnull=False),
                name="requirements_released_assignment_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("stage", "status")),
            models.Index(fields=("partner", "shift_date")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.crew_member_id}:{self.status}"


class ShiftAttendance(models.Model):
    """How many of the booked crew turned up, once per shift-day (`M2-BE-524` to `527`).

    **Supervisor-level, deliberately.** ADR-0009 and `SIM-02` both refuse per-worker check-in and
    check-out with offline sync: the workers mostly do not carry smartphones, the supervisor does,
    and a per-worker attendance product would be a device dependency the market cannot meet
    pretending to be rigour. So the supervisor states a count, the Customer confirms or disputes it
    in one tap, and that is the whole mechanism.

    Per-worker detail exists in exactly one place — `disputed_worker_details`, written **only** by
    a Customer dispute (`M2-BE-526`). Collecting it up front would be collecting four names a day
    from a supervisor to answer a question nobody had asked.

    Arrival lives here too (`M2-BE-524`) and is the **non-OTP fallback as the default path**: M2
    proves arrival by either party confirming it, and the start OTP is M3. Nothing here waits for
    a code that does not exist yet.

    A missing check-out settles at the agreed shift length and says so (`M2-BE-527`). It is
    `flagged_for_review`, not disputed — the crew leaving without the supervisor closing the day is
    ordinary, and treating it as a dispute would open a case against a vendor for a missed tap.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Nothing recorded yet"
        SUPERVISOR_CONFIRMED = "SUPERVISOR_CONFIRMED", "The supervisor recorded the day"
        CUSTOMER_CONFIRMED = "CUSTOMER_CONFIRMED", "The Customer agreed"
        DISPUTED = "DISPUTED", "The Customer disputed the count"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.OneToOneField(
        "requirements.EngagementStage",
        on_delete=models.PROTECT,
        related_name="attendance",
    )
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="shift_attendances",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)

    #: The crew this day was booked for, snapshotted from the booking so a later amendment cannot
    #: quietly change what "full attendance" meant on a day that has already been settled.
    expected_count = models.PositiveSmallIntegerField()
    #: What the supervisor says turned up. Null until they say.
    present_count = models.PositiveSmallIntegerField(null=True, blank=True)

    #: Arrival, on the non-OTP path. Either party may confirm it — both were at the site.
    arrival_confirmed_at = models.DateTimeField(null=True, blank=True)
    arrival_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_shift_arrivals_confirmed",
    )
    #: The published length of a day on this booking's card, frozen. `M2-BE-527` settles a missing
    #: check-out at this, so it must be the number that was published rather than today's card.
    #:
    #: **Null on the quote-flow fallback**, where nobody ever published a day length: the vendor
    #: quoted a rate per worker per day and was never asked what a day is. Nullable rather than
    #: eight — an assumed shift length is the number that decides when overtime starts, and this
    #: platform inventing it is the on-site renegotiation with a server behind it. A null row is
    #: `flagged_for_review` with `day_length_not_published` instead, and overtime against it is
    #: refused rather than measured from a made-up clock.
    standard_day_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    shift_ended_at = models.DateTimeField(null=True, blank=True)
    #: True when the day closed without anybody recording an end time. The settlement still runs —
    #: the amount never depended on the end time, only overtime does — and this is what puts the
    #: row in front of Operations.
    checkout_missing = models.BooleanField(default=False)
    flagged_for_review = models.BooleanField(default=False)
    flag_reason_code = models.SlugField(max_length=80, blank=True)

    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_shift_attendances_confirmed",
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    responded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_shift_attendances_answered",
    )
    dispute_note = models.TextField(blank=True)
    #: `[{"name": ..., "was_present": bool, "note": ...}]`, and **only** on a dispute. The list is
    #: the Customer's account of which named workers they say were not there; it is evidence in a
    #: case, never an attendance record of its own.
    disputed_worker_details = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(expected_count__gt=0),
                name="requirements_attendance_expects_somebody",
            ),
            # Nobody may record more workers than the day was booked for. An extra worker is a
            # scope amendment at the published rate, which is `M2-BE-538` — not a number typed
            # into an attendance box, which is how a settlement grows without an agreement.
            models.CheckConstraint(
                condition=models.Q(present_count__isnull=True)
                | models.Q(present_count__lte=models.F("expected_count")),
                name="requirements_attendance_within_booked_crew",
            ),
            models.CheckConstraint(
                condition=models.Q(status="PENDING") | models.Q(present_count__isnull=False),
                name="requirements_confirmed_attendance_has_a_count",
            ),
            models.CheckConstraint(
                condition=models.Q(standard_day_hours__isnull=True)
                | (models.Q(standard_day_hours__gt=0) & models.Q(standard_day_hours__lte=24)),
                name="requirements_attendance_day_within_a_day",
            ),
            # A day whose length nobody published has to say so. The pair is the whole of
            # `M2-BE-527`'s honesty: either there is a published shift length to settle a missing
            # check-out against, or the row is flagged and a human reads it.
            models.CheckConstraint(
                condition=models.Q(standard_day_hours__isnull=False)
                | models.Q(flagged_for_review=True),
                name="requirements_unpublished_day_length_is_flagged",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "flagged_for_review")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.present_count}/{self.expected_count}"

    @property
    def shortfall_count(self) -> int:
        """How many booked workers did not turn up. Zero until a day has been recorded."""
        if self.present_count is None:
            return 0
        return max(self.expected_count - self.present_count, 0)


class DaySettlement(models.Model):
    """The evening "Day settled?" dual tap (`M2-BE-536`, `537`).

    **The platform never holds this money.** ADR-0009: wages are direct, daily, peer-to-peer at day
    end, and that norm is encoded here rather than fought. Every column below is a *record*: the
    published amount the two sides should have exchanged, and two timestamps saying who agreed they
    did. No `PaymentAttempt`, no ledger entry, no refund, no payout — and none may be added.

    **Settlement is per worker-day present, never per job.** `amount_paise` is
    `workers_present x per_worker_paise` plus whatever extras both sides agreed through the
    amendment engine, and the database constraint says so. A 3-of-4 day settles at three workers'
    published rate because that is what was delivered; billing the fourth would be charging for a
    person who was not there, and discounting the three would be repricing a rate both sides
    accepted.

    **A one-sided claim is unproven, not false.** Either party may tap first; the fee, the crew and
    the engagement all carry on either way. Only both taps make `SETTLED`, and Operations reading a
    `SUPERVISOR_CLAIMED` row a week later is reading exactly what happened — one person says they
    were paid and the other has not said anything — which is a different sentence from "they were
    paid" and from "they were not". A cash dispute where both sides lie remains unadjudicable, as
    the plan accepted for `LEAD_ONLY`; the tap trail is the mitigation, not a proof machine.
    """

    class Status(models.TextChoices):
        AWAITING_BOTH = "AWAITING_BOTH", "Neither side has confirmed"
        SUPERVISOR_CLAIMED = "SUPERVISOR_CLAIMED", "Only the supervisor has confirmed"
        CUSTOMER_CLAIMED = "CUSTOMER_CLAIMED", "Only the Customer has confirmed"
        SETTLED = "SETTLED", "Both sides confirmed"

    class ShortfallChoice(models.TextChoices):
        """What the Customer chose to do about workers who did not arrive (`M2-BE-537`).

        `CANCEL_SHORTFALL` is read narrowly and deliberately: it cancels **the missing part of this
        day**, free — no charge for the absent workers and no make-good owed. Cancelling the
        remaining days of an engagement is a different act with different money behind it
        (`M2-BE-545`, Wave C5), and quietly folding it in here would let one tap end a booking.
        """

        CONTINUE_SHORT = "CONTINUE_SHORT", "Carry on with the crew that came"
        ADD_DAY = "ADD_DAY", "Ask the lead for an extra day to make it up"
        CANCEL_SHORTFALL = "CANCEL_SHORTFALL", "Cancel the missing workers, free"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.OneToOneField(
        "requirements.EngagementStage",
        on_delete=models.PROTECT,
        related_name="day_settlement",
    )
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="day_settlements",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AWAITING_BOTH,
    )

    #: What the lead receives for one worker for one day, frozen from the booking. The wage
    #: component plus the supervision margin — never the Customer's all-in rate, which includes
    #: Vsolve's booking fee and is not owed to anybody at day end.
    per_worker_paise = models.PositiveBigIntegerField()
    workers_present = models.PositiveSmallIntegerField()
    workers_expected = models.PositiveSmallIntegerField()
    #: Overtime and add-ons accepted through the M1 amendment engine against this shift-day, at the
    #: card's published rates. Zero unless both sides agreed to something (`M2-BE-531`, `538`).
    extras_paise = models.PositiveBigIntegerField(default=0)
    #: The exact published amount the UPI link carries. Server-calculated, in integer paise.
    amount_paise = models.PositiveBigIntegerField()

    shortfall_choice = models.CharField(
        max_length=20,
        choices=ShortfallChoice.choices,
        blank=True,
    )
    #: Set when the Customer chose `ADD_DAY`. The extra day is the lead's to offer through the
    #: amendment engine — the platform records the request and does not extend somebody's
    #: commitment on their behalf.
    make_good_requested_at = models.DateTimeField(null=True, blank=True)

    supervisor_confirmed_at = models.DateTimeField(null=True, blank=True)
    supervisor_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_day_settlements_confirmed_as_supervisor",
    )
    customer_confirmed_at = models.DateTimeField(null=True, blank=True)
    customer_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_day_settlements_confirmed_as_customer",
    )
    settled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "id")
        constraints = [
            # Per worker-day present, never per job — the arithmetic of `M2-BE-537` where the
            # database can refuse a violation instead of a reconciliation report finding one.
            models.CheckConstraint(
                condition=models.Q(
                    amount_paise=models.F("per_worker_paise") * models.F("workers_present")
                    + models.F("extras_paise")
                ),
                name="requirements_day_settlement_reconciles",
            ),
            models.CheckConstraint(
                condition=models.Q(workers_present__lte=models.F("workers_expected")),
                name="requirements_day_settlement_within_booked_crew",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="SETTLED")
                | (
                    models.Q(supervisor_confirmed_at__isnull=False)
                    & models.Q(customer_confirmed_at__isnull=False)
                    & models.Q(settled_at__isnull=False)
                ),
                name="requirements_settled_day_has_both_taps",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "created_at")),
        ]

    def __str__(self) -> str:
        return f"{self.stage_id}:{self.amount_paise}:{self.status}"


class SafetyIncident(models.Model):
    """Something went wrong on site, reported as its own record (`M2-BE-530`).

    **Never a cancellation reason**, which is the whole reason this table exists rather than a
    reason code on a cancellation. Construction labour carries real liability, and a platform that
    filed "a worker fell" as "job cancelled — site unsafe" would have no way, two years later, to
    say what was reported, when, by whom, and what was done about it. `GAP-022` is that sentence.

    Reportable by **both parties and Operations**: the Customer who saw it, the lead whose worker
    it was, and the operator a phone call reaches. `reporter_role` records which, and is derived
    from the caller rather than sent by them.

    The report body is frozen after it is written. A safety report that can be edited afterwards is
    not evidence, and the fields Operations adds — status, the resolution note — are deliberately
    the only ones that move. This follows `Engagement.save`'s frozen-terms rule, in the one other
    table where "somebody will remember not to" is not good enough.
    """

    class Severity(models.TextChoices):
        NEAR_MISS = "NEAR_MISS", "A near miss"
        MINOR = "MINOR", "Minor injury or damage"
        SERIOUS = "SERIOUS", "Serious injury or damage"
        CRITICAL = "CRITICAL", "Critical: life-threatening or fatal"

    class Status(models.TextChoices):
        REPORTED = "REPORTED", "Reported"
        UNDER_REVIEW = "UNDER_REVIEW", "Operations is reviewing it"
        RESOLVED = "RESOLVED", "Closed by Operations"

    class ReporterRole(models.TextChoices):
        CUSTOMER = "CUSTOMER", "The Customer"
        PARTNER = "PARTNER", "The vendor or their supervisor"
        OPERATIONS = "OPERATIONS", "Operations"

    #: Written once and then frozen. The record of what was reported may not be rewritten by the
    #: party it reflects on — or by the party who filed it, once Operations has read it.
    FROZEN_REPORT_FIELDS = (
        "engagement",
        "stage",
        "reported_by",
        "reporter_role",
        "severity",
        "category_code",
        "description",
        "occurred_at",
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="safety_incidents",
    )
    #: The shift-day it happened on, when it is known. Null for something reported about the
    #: engagement as a whole, or after the day it belongs to has closed.
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="safety_incidents",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_safety_incidents_reported",
    )
    reporter_role = models.CharField(max_length=16, choices=ReporterRole.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    #: What kind of thing happened, as a slug: `fall`, `electrical`, `vehicle`, `abuse`. Open
    #: rather than an enum, because publishing a fixed list of the ways a site can hurt somebody
    #: guarantees the one that happens is not on it.
    category_code = models.SlugField(max_length=80)
    description = models.TextField()
    occurred_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REPORTED)
    resolution_note = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="m2_safety_incidents_resolved",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-occurred_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(status="RESOLVED") | models.Q(resolved_at__isnull=False),
                name="requirements_resolved_incident_has_a_timestamp",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "status")),
            models.Index(fields=("status", "severity", "occurred_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.severity}:{self.status}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            update_fields = set(kwargs.get("update_fields") or ())
            if not update_fields or update_fields.intersection(self.FROZEN_REPORT_FIELDS):
                raise ValueError(
                    "A safety report is frozen once filed. Operations may change its status and "
                    "add a resolution; nobody may rewrite what was reported."
                )
        super().save(*args, **kwargs)


class CashDemandReport(models.Model):
    """A Customer's one-tap report that a cash extra was demanded on site (`M2-BE-539`).

    ADR-0009 makes the on-site renegotiation the failure A3 is designed against: the preset asks
    the price-moving facts, the card publishes the number, and every genuine extra goes through the
    amendment engine at a published rate. This is what the Customer taps when it happens anyway.

    **It is never proof on its own**, and the model is shaped to keep that true. There is no
    verdict column, no admission, no vendor response and no money: the report is one party's
    account, it is recorded immutably, and `apps.partners.standing` counts it towards a pattern
    against a threshold the owner sets. One report changes nothing at all.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    engagement = models.ForeignKey(
        "requirements.Engagement",
        on_delete=models.PROTECT,
        related_name="cash_demand_reports",
    )
    stage = models.ForeignKey(
        "requirements.EngagementStage",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cash_demand_reports",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="m2_cash_demand_reports",
    )
    #: What they say they were asked for, if they said. Optional because the report has to be one
    #: tap, and a required amount would turn "they demanded extra" into a form.
    amount_claimed_paise = models.PositiveBigIntegerField(null=True, blank=True)
    note = models.TextField(blank=True)
    reported_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-reported_at", "id")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_claimed_paise__isnull=True)
                | models.Q(amount_claimed_paise__gt=0),
                name="requirements_cash_demand_amount_positive",
            ),
        ]
        indexes = [
            models.Index(fields=("engagement", "reported_at")),
        ]

    def __str__(self) -> str:
        return f"{self.engagement_id}:{self.reported_at:%Y-%m-%d}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise ValueError("A cash-demand report is immutable.")
        super().save(*args, **kwargs)
