"""Wave C4 (`M2-BE-521..539`): the shift-day.

The crew on one day, the attendance recorded against it, the evening settlement, the extras a day
can carry, and the two first-class records a day can produce — a safety incident and a cash-demand
report. The boundary is the day: everything an A3 booking becomes once work starts. The A5
equivalent is `projects`.
"""

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.requirements.models import (
    CashDemandReport,
    DaySettlement,
    SafetyIncident,
    ShiftAttendance,
)
from apps.requirements.workforce import MAXIMUM_DISPUTED_WORKERS

# ---------------------------------------------------------------------------
# Wave C4 (`M2-BE-521..539`): the shift-day.
#
# One rule shapes every read below and it is the disclosure rule, not a preference:
# **the Customer never receives `crew_member_id`** (`M2-BE-523`). Crew identity is global — one
# person is one row however many agencies carry them — so handing that id to a Customer would let
# two bookings be correlated into a fact about a worker that nobody is entitled to learn from us.
# The Customer gets a name, four digits of phone and whether the platform has verified the
# person's documents, which is what "policy-approved crew identity and verification summaries"
# means.
#
# The second rule is that **no serializer here carries wage money into a payment field**. The
# settlement's `amount_paise` is a published figure the two parties exchange peer-to-peer, and
# `upi_payment_link` is a deep link into the Customer's own UPI app. Neither is a charge, and there
# is no checkout shape in this section for that reason.
# ---------------------------------------------------------------------------


class StageCrewMemberSerializer(serializers.Serializer[dict[str, Any]]):
    """One named worker on one shift-day, at the disclosure the reader is entitled to.

    `membership_id` is present for the Partner — it is their own roster row and the id their
    assignment screen sends back — and **null for the Customer**. The global `crew_member_id`
    appears for nobody.
    """

    membership_id = serializers.UUIDField(read_only=True, allow_null=True)
    display_name = serializers.CharField(read_only=True)
    #: `xxxxxx 4821`. Not a redaction of a number we hold — `CrewMember` stores a keyed hash and
    #: four digits, never the number itself, so this is all there is.
    phone_masked = serializers.CharField(read_only=True)
    is_supervisor = serializers.BooleanField(read_only=True)
    #: The verification *summary*, which is the whole of what `M2-BE-523` publishes: whether this
    #: platform has checked the person's documents, and when. Never the documents, never their
    #: kinds, never their numbers.
    is_verified = serializers.BooleanField(read_only=True)
    verified_at = serializers.DateTimeField(read_only=True, allow_null=True)
    status = serializers.CharField(read_only=True)
    assigned_at = serializers.DateTimeField(read_only=True)


class CrewAssignSerializer(serializers.Serializer[dict[str, Any]]):
    """The **whole** crew for this shift-day, every time (`M2-BE-522`, `528`).

    A set, not a delta. The supervisor sends who is coming and the server reconciles the day to it:
    names that dropped off are released with a reason, new names are assigned. That makes a
    substitution one call a client cannot half-perform, and makes a retried tap a no-op.
    """

    membership_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=40,
    )
    #: Why somebody came off the shift, when this call is a substitution. Carried into the
    #: Customer's notification, which is what tells a replacement from a cancellation.
    reason_code = serializers.SlugField(max_length=80, required=False, allow_blank=True, default="")


class StageCrewListSerializer(serializers.Serializer[dict[str, Any]]):
    crew = StageCrewMemberSerializer(many=True, read_only=True)
    #: How many workers this day was booked for. The assignment screen needs it to say "3 of 4
    #: named" without a second request, and the server refuses a longer list than this anyway.
    expected_count = serializers.IntegerField(read_only=True)
    shift_date = serializers.DateField(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class ShiftAttendanceSerializer(serializers.ModelSerializer[ShiftAttendance]):
    """What the supervisor said, and what the Customer answered (`M2-BE-524` to `527`).

    `present_count` is null until somebody records the day, and that is a real state rather than a
    zero: "nobody has said" and "nobody came" are different facts and a settlement depends on
    which.

    `disputed_worker_details` is populated **only** by a Customer dispute (`M2-BE-526`). It is the
    Customer's account of who they say was not there — evidence in a case, never an attendance
    record of its own, and nothing derives a count from it.
    """

    shortfall_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ShiftAttendance
        fields = (
            "id",
            "status",
            "expected_count",
            "present_count",
            "shortfall_count",
            "arrival_confirmed_at",
            "standard_day_hours",
            "shift_ended_at",
            "checkout_missing",
            "flagged_for_review",
            "flag_reason_code",
            "confirmed_at",
            "responded_at",
            "dispute_note",
            "disputed_worker_details",
        )
        read_only_fields = fields


class ShiftAttendanceRecordSerializer(serializers.Serializer[dict[str, Any]]):
    """The supervisor's one action for the day (`M2-BE-525`).

    One count, and deliberately **no per-worker roll call**. `SIM-02` refuses per-worker check-in
    and check-out with offline sync outright: the workers mostly do not carry smartphones, the
    supervisor does, and a per-worker product would be a device dependency the market cannot meet
    wearing the clothes of rigour.
    """

    present_count = serializers.IntegerField(min_value=0)
    #: When the crew finished. **Optional, and its absence is the point** (`M2-BE-527`): a missing
    #: check-out settles at the agreed shift length and is flagged for review rather than disputed.
    #: A supervisor whose crew left at six and who closed the day at nine has done nothing wrong.
    shift_ended_at = serializers.DateTimeField(required=False, allow_null=True, default=None)


#: The Customer's two answers to a recorded day. One tap each, and there is no third.
ATTENDANCE_RESPONSES = (
    ("CONFIRM", "The count is right"),
    ("DISPUTE", "That is not who was here"),
)

#: What the Customer chose to do about workers who did not arrive (`M2-BE-537`). Published from
#: the serializer rather than the model so the wire vocabulary and the column can be read
#: separately, exactly as the decline reasons are.
SHORTFALL_CHOICES = (
    ("CONTINUE_SHORT", "Carry on with the crew that came"),
    ("ADD_DAY", "Ask the lead for an extra day to make it up"),
    ("CANCEL_SHORTFALL", "Cancel the missing workers, free"),
)


class DisputedWorkerSerializer(serializers.Serializer[dict[str, Any]]):
    """One line of a Customer's dispute. Their account, in their words."""

    name = serializers.CharField(max_length=120, allow_blank=True, default="")
    was_present = serializers.BooleanField(default=False)
    note = serializers.CharField(max_length=400, allow_blank=True, default="")


class ShiftAttendanceResponseSerializer(serializers.Serializer[dict[str, Any]]):
    """Confirm the day or dispute it (`M2-BE-525`, `526`, `537`)."""

    response = serializers.ChoiceField(choices=ATTENDANCE_RESPONSES)
    #: Required by the server when workers were short and the answer is `CONFIRM`. The day settles
    #: at the present workers' rate whichever choice is made; the choice decides what happens to
    #: the missing worker-days, not to the money for the ones who came.
    shortfall_choice = serializers.ChoiceField(
        choices=SHORTFALL_CHOICES,
        required=False,
        allow_blank=True,
        default="",
    )
    #: Only read on `DISPUTE`. The one place per-worker detail is ever collected.
    #:
    #: `max_length` is the server's own `workforce.MAXIMUM_DISPUTED_WORKERS`, imported rather than
    #: retyped and published so a client can bound its own form instead of discovering the limit
    #: as a `400`. The domain still enforces it — this is the same number said out loud, not a
    #: replacement for the check.
    worker_details = DisputedWorkerSerializer(
        many=True,
        required=False,
        default=list,
        # Supported at runtime — `max_length` is in DRF's own `LIST_SERIALIZER_KWARGS` and is
        # forwarded by `many_init` — but `rest_framework-stubs` declares it only on `ListField`,
        # so strict mypy sees an unexpected keyword on the `many=True` construction.
        max_length=MAXIMUM_DISPUTED_WORKERS,  # type: ignore[call-arg]
        # And said out loud, because `max_length` on a `ListSerializer` is **enforced and not
        # published**: drf-spectacular emits no `maxItems` for it, so without this line the bound
        # existed only as a `400` a client discovered by hitting it.
        help_text=(
            f"At most {MAXIMUM_DISPUTED_WORKERS} workers may be itemised in one dispute. A "
            "dispute naming more people than that is not a shift-day."
        ),
    )
    note = serializers.CharField(max_length=2000, allow_blank=True, default="")


class DaySettlementSerializer(serializers.ModelSerializer[DaySettlement]):
    """The evening dual tap, and the exact published amount behind it (`M2-BE-536`, `537`).

    **This is a record of a payment Vsolve never touches.** There is no checkout here, no
    `payment_attempt_id`, no refund and no payout — the wage money is peer-to-peer, daily, at day
    end, and the platform's whole part in it is to state the number both sides already agreed and
    remember who said they were paid.

    `upi_payment_link` is null whenever the lead has published no VPA, which is an ordinary state
    and not an error: the amount is still shown and the crew is still paid the way they were paid
    before this app existed.

    **It is a `SerializerMethodField`, and Wave C5 made it one because it was a reader with no
    writer** (RULES §3(b), the fourth instance in four waves). `DaySettlement` has no
    `upi_payment_link` column — the value is computed by `workforce.upi_payment_link` — and the
    only thing that ever populated it was a manual injection into the settlement *command's* own
    response body. So the deep link was absent before the tap and gone after a reload: it existed
    for exactly one HTTP response and never appeared on `m2_shift_day_read`, which is the screen a
    Customer actually opens in the evening. DRF made that invisible rather than loud, answering
    `null` for the missing attribute instead of raising, so nothing failed and the one convenience
    `M2-BE-536` exists to offer was simply never there.

    Computing it here fixes both surfaces at once and leaves no second place to forget.
    """

    upi_payment_link = serializers.SerializerMethodField()
    #: Declared rather than inherited from the model so the published enum admits `""`.
    #:
    #: The column is `blank=True` and **rests at `""`** — no shortfall, nothing chosen — but a
    #: `ModelSerializer` renders it from `ShortfallChoice.choices`, which does not contain the
    #: empty string. Every settlement that never had a shortfall therefore carried a value the
    #: schema said was impossible, and a generated client either widened the type by hand or
    #: membership-tested instead of comparing. The **request** shape a few lines up already had
    #: this right with `allow_blank=True`; the response did not. Closed in 1.31.0.
    shortfall_choice = serializers.ChoiceField(
        choices=SHORTFALL_CHOICES,
        read_only=True,
        allow_blank=True,
    )

    class Meta:
        model = DaySettlement
        fields = (
            "id",
            "status",
            "per_worker_paise",
            "workers_present",
            "workers_expected",
            "extras_paise",
            "amount_paise",
            "shortfall_choice",
            "make_good_requested_at",
            "supervisor_confirmed_at",
            "customer_confirmed_at",
            "settled_at",
            "upi_payment_link",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_upi_payment_link(self, obj: DaySettlement) -> str | None:
        """The lead's UPI deep link at the exact published amount, or `None`.

        Imported inside the method, following `selectors.shift_day_payload`: the read layer calls
        the domain, and a module-level import here would run serializers -> workforce -> stages at
        import time for a value only this one field needs.
        """
        from apps.requirements import workforce  # noqa: PLC0415 - read layer calling the domain

        return workforce.upi_payment_link(obj)


class ShiftDaySerializer(serializers.Serializer[dict[str, Any]]):
    """One shift-day, whole: the day, the crew on it, the attendance and the settlement.

    One read rather than four, for the reason `RateCardStateSerializer` gives: the crew screen, the
    attendance screen and the settlement screen are the same screen at three moments of one
    evening, and four endpoints would let them disagree about which day the user is looking at.

    `attendance` and `settlement` are null until somebody touches the day — created lazily, because
    the engagement is opened inside a payment callback and four more inserts in that transaction
    are four more ways for a Customer's money to fail to confirm.
    """

    stage_id = serializers.UUIDField(read_only=True)
    engagement_id = serializers.UUIDField(read_only=True)
    position = serializers.IntegerField(read_only=True)
    #: The shift-day's own name, "Day 3". Not `label` — `Serializer.label` is DRF's own attribute
    #: and shadowing it with a field is an assignment mypy refuses and DRF would resolve at random.
    day_label = serializers.CharField(read_only=True)
    #: Which calendar day this is. **Null blocks crew assignment** rather than defaulting to today:
    #: the cross-agency conflict rule is "this person, on this date", and a server-chosen date
    #: would make the guard check a day nobody is working.
    scheduled_on = serializers.DateField(read_only=True, allow_null=True)
    stage_status = serializers.CharField(read_only=True)
    crew = StageCrewMemberSerializer(many=True, read_only=True)
    attendance = ShiftAttendanceSerializer(read_only=True, allow_null=True)
    settlement = DaySettlementSerializer(read_only=True, allow_null=True)
    #: What one worker costs for one day on this booking: the wage component plus the supervision
    #: margin. **Not** the Customer's all-in rate — that includes Vsolve's booking fee, which was
    #: charged online and is owed to nobody at day end.
    per_worker_paise = serializers.IntegerField(read_only=True)
    #: Null on the quote-flow fallback, where nobody published a day length or an overtime rate.
    #: Overtime is refused there rather than measured against an assumed shift.
    standard_day_hours = serializers.IntegerField(read_only=True, allow_null=True)
    overtime_hourly_paise = serializers.IntegerField(read_only=True, allow_null=True)
    add_on_rates = serializers.DictField(child=serializers.IntegerField(), read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


#: The two extras a shift-day can carry, both priced by the server from the frozen card.
SHIFT_EXTRA_KINDS = (
    ("OVERTIME", "Hours past the published shift"),
    ("ADD_ON", "A published add-on from the rate card"),
)


class ShiftExtraSerializer(serializers.Serializer[dict[str, Any]]):
    """Ask the Customer to approve overtime or an add-on (`M2-BE-531`, `538`).

    **There is no amount field, and there never will be.** The vendor names what and how much of
    it; the server names the money, from the rate card frozen on the engagement at booking. A
    vendor who could type a number here could re-price a job the Customer booked at a published
    rate, which is precisely the on-site renegotiation ADR-0009 exists to leave nowhere to live.
    """

    kind = serializers.ChoiceField(choices=SHIFT_EXTRA_KINDS)
    #: Overtime only. Worker-hours are computed server-side from the day's present count — a
    #: vendor states the hours, never the crew size they are multiplied by.
    hours = serializers.IntegerField(min_value=0, max_value=12, default=0)
    #: Add-on only, and it must be a code on the frozen card. Anything else is refused rather than
    #: priced, because an extra with no published rate is the renegotiation itself.
    add_on_code = serializers.SlugField(max_length=80, allow_blank=True, default="")
    worker_days = serializers.IntegerField(min_value=0, max_value=200, default=0)
    reason = serializers.CharField(max_length=240)


#: How bad it was. A published vocabulary because Operations routes on it and both apps render it.
SAFETY_INCIDENT_SEVERITIES = (
    ("NEAR_MISS", "A near miss"),
    ("MINOR", "Minor injury or damage"),
    ("SERIOUS", "Serious injury or damage"),
    ("CRITICAL", "Critical: life-threatening or fatal"),
)

#: The two moves Operations may make on a report. Not the whole status set: `REPORTED` is where a
#: report starts and nobody may put it back there.
SAFETY_INCIDENT_DECISIONS = (
    ("UNDER_REVIEW", "Operations is reviewing it"),
    ("RESOLVED", "Closed by Operations"),
)


class SafetyIncidentSerializer(serializers.ModelSerializer[SafetyIncident]):
    """A first-class safety record (`M2-BE-530`). **Never a cancellation reason.**

    A job that has to end because a site is unsafe ends through cancellation *with* a safety report
    beside it, so both facts exist separately and either can be read without the other. Filing "a
    worker fell" as "job cancelled, site unsafe" is how a platform ends up unable to say, two years
    later, what was reported and what was done about it.
    """

    class Meta:
        model = SafetyIncident
        fields = (
            "id",
            "engagement",
            "stage",
            "reporter_role",
            "severity",
            "category_code",
            "description",
            "occurred_at",
            "status",
            "resolution_note",
            "resolved_at",
            "created_at",
        )
        read_only_fields = fields


class SafetyIncidentListSerializer(serializers.Serializer[dict[str, Any]]):
    incidents = SafetyIncidentSerializer(many=True, read_only=True)
    server_now = serializers.DateTimeField(read_only=True)


class SafetyIncidentReportSerializer(serializers.Serializer[dict[str, Any]]):
    """File a report. `reporter_role` is derived from the caller and is deliberately not here."""

    severity = serializers.ChoiceField(choices=SAFETY_INCIDENT_SEVERITIES)
    #: Open rather than an enum. Publishing a fixed list of the ways a site can hurt somebody
    #: guarantees the one that happens is not on it.
    category_code = serializers.SlugField(max_length=80)
    description = serializers.CharField(max_length=8000)
    occurred_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    stage_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class SafetyIncidentDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    """Operations moves a report to review or to a close. It can never rewrite the report."""

    decision = serializers.ChoiceField(choices=SAFETY_INCIDENT_DECISIONS)
    resolution_note = serializers.CharField(max_length=8000, allow_blank=True, default="")


class CashDemandReportSerializer(serializers.ModelSerializer[CashDemandReport]):
    """A Customer's one-tap account of a cash extra demanded on site (`M2-BE-539`).

    There is no verdict field, no vendor response and no money on this shape, because a report is
    never proof on its own. It is recorded immutably and counted towards a pattern against a
    threshold the owner sets; one report changes nothing at all.
    """

    class Meta:
        model = CashDemandReport
        fields = (
            "id",
            "engagement",
            "stage",
            "amount_claimed_paise",
            "note",
            "reported_at",
        )
        read_only_fields = fields


class CashDemandSerializer(serializers.Serializer[dict[str, Any]]):
    #: Optional, because the report has to be one tap. A required amount turns "they demanded
    #: extra" into a form, and the form is what stops it being reported.
    amount_claimed_paise = serializers.IntegerField(
        min_value=1, required=False, allow_null=True, default=None
    )
    note = serializers.CharField(max_length=4000, allow_blank=True, default="")
    stage_id = serializers.UUIDField(required=False, allow_null=True, default=None)
