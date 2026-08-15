"""Wave C5 (`M2-BE-541..549`): the A5 project surface.

One whole-project read and the six commands around it — delay claims, the handover, the transfer
to a replacement vendor and early termination. The boundary is the milestone: this is what an A5
engagement becomes once work starts, where `shifts` is what an A3 booking becomes.
"""

from typing import Any

from rest_framework import serializers

from apps.requirements.models import (
    Engagement,
    EngagementStage,
    ProjectDelayClaim,
    ProjectDeliverable,
    ProjectTransfer,
)

# ---------------------------------------------------------------------------
# Wave C5 (`M2-BE-541..549`): the A5 project surface.
#
# One read and six commands. The read is deliberately whole — the milestone list, the money, the
# warranty, the handover and whatever recovery is in flight are the same screen at five moments of
# one project, and a client assembling it from five endpoints would render four of them against a
# state the fifth had already left.
#
# Every milestone shape below publishes the agreed reading **and** the current one (`M2-BE-549`).
# A project screen that can only say what is due now is useless in the argument it exists for.
# ---------------------------------------------------------------------------


class ProjectMilestoneSerializer(serializers.Serializer[dict[str, Any]]):
    """One A5 milestone, as agreed and as it stands (`M2-BE-541`, `549`).

    Not a `ModelSerializer` on `EngagementStage`: half of these fields are the frozen
    `original_terms` snapshot unpacked, and `schedule_shift_days` is arithmetic the server does so
    that a date difference is not computed in whatever timezone a browser happens to be in.

    `kind` is the field to read before rendering anything: a `MATERIAL_ADVANCE` is money spent on
    goods, not a milestone somebody performs, and it does not refund like unearned work.
    """

    stage_id = serializers.UUIDField(read_only=True)
    position = serializers.IntegerField(read_only=True)
    #: **`milestone_label`, not `label`.** `label` is DRF's own `Serializer` attribute and a field
    #: of that name shadows it — mypy refuses the assignment and DRF would resolve it at random.
    #: The same trap Wave C4 hit with `ShiftDay.day_label`, recorded again because a client
    #: reaching for `label` is the obvious guess.
    milestone_label = serializers.CharField(read_only=True)
    #: What this milestone hands over, from the estimate the Customer selected. Blank is a real
    #: state: a vendor may price milestones without describing them.
    deliverable = serializers.CharField(read_only=True, allow_blank=True)
    #: `ChoiceField`, not `CharField`. Wave C4 closed the same gap on `CrewOffer.status`: these
    #: three have spoken a published vocabulary since 1.24.0 and a bare string would make every
    #: generated client widen them back to `string`, which is how an exhaustive switch silently
    #: stops being exhaustive.
    kind = serializers.ChoiceField(choices=EngagementStage.Kind.choices, read_only=True)
    amount_paise = serializers.IntegerField(read_only=True)
    scheduled_on = serializers.DateField(read_only=True, allow_null=True)
    status = serializers.ChoiceField(choices=EngagementStage.Status.choices, read_only=True)
    funding_state = serializers.ChoiceField(
        choices=EngagementStage.FundingState.choices, read_only=True
    )
    funded_paise = serializers.IntegerField(read_only=True)
    refunded_amount_paise = serializers.IntegerField(read_only=True)
    #: Why a recovery took this milestone out of the live agreement. Blank on every live stage.
    #: `material_advance_left_with_vendor` is the one to render differently: that money is **not**
    #: coming back, and telling a Customer a cancelled row will be refunded when it will not is
    #: worse than saying nothing.
    cancellation_reason_code = serializers.CharField(read_only=True, allow_blank=True)

    #: Every "as agreed" reading is `original_` plus the current field's own name, so the pairing
    #: is mechanical: `original_milestone_label` against `milestone_label`, and so on.
    original_milestone_label = serializers.CharField(read_only=True, allow_blank=True)
    original_deliverable = serializers.CharField(read_only=True, allow_blank=True)
    original_amount_paise = serializers.IntegerField(read_only=True)
    original_scheduled_on = serializers.DateField(read_only=True, allow_null=True)
    #: How far this milestone has moved from the date it was agreed at, in days. Null when either
    #: reading has no date — a vendor who priced milestones without dating them has a project with
    #: no schedule, and a zero there would claim otherwise.
    schedule_shift_days = serializers.IntegerField(read_only=True, allow_null=True)


class ProjectDeliverableSerializer(serializers.ModelSerializer[ProjectDeliverable]):
    """One handed-over item (`M2-BE-547`).

    A `FILE` carries `evidence`, which is the id of a row on the ordinary stage evidence rail —
    the same presign, checksum and scan status every other M2 attachment gets. A `LINK` carries
    `external_url` and is **recorded rather than hosted**, said out loud because a Customer
    clicking it is leaving this platform.
    """

    class Meta:
        model = ProjectDeliverable
        fields = (
            "id",
            "stage",
            "kind",
            "title",
            "evidence",
            "external_url",
            "created_at",
        )
        read_only_fields = fields


class ProjectHandoverSerializer(serializers.Serializer[dict[str, Any]]):
    """The handover as a whole, and the two timestamps that decide whether a project can close.

    `submitted_at` set with `accepted_at` null is the state in which
    `m2_engagement_completion_accept` refuses — that refusal is the entire mechanism keeping Event
    and Media delivery on the platform.
    """

    submitted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    accepted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    note = serializers.CharField(read_only=True, allow_blank=True)
    deliverables = ProjectDeliverableSerializer(many=True, read_only=True)


class ProjectDelayClaimSerializer(serializers.ModelSerializer[ProjectDelayClaim]):
    """A vendor's claim that the Customer held a milestone up (`M2-BE-544`).

    **There is no amount on this shape and none may be added.** A delay that costs money is extra
    work, and extra work is a scope amendment the Customer accepts and pays for. A single record
    that could carry both would let "the site was locked" arrive as a bill.

    `evidence` lists ids on the stage's own evidence rail. `applied_days` is what the schedule
    actually moved by — equal to `extension_days` on an accepted claim and zero on every other,
    which is what lets a screen show a history rather than a running total it has to reconstruct.
    """

    class Meta:
        model = ProjectDelayClaim
        fields = (
            "id",
            "stage",
            "reason_code",
            "description",
            "evidence",
            "extension_days",
            "applied_days",
            "status",
            "expires_at",
            "decision_note",
            "decided_at",
            "created_at",
        )
        read_only_fields = fields


class ProjectTransferSerializer(serializers.ModelSerializer[ProjectTransfer]):
    """A proposed or applied move of the remaining milestones to another vendor (`M2-BE-545`).

    The two numbers a Customer decides on are `previous_remaining_paise` and
    `replacement_remaining_paise`; `delta_paise` is their difference and is held equal by a
    database constraint, so a client may render it without checking the arithmetic.

    `material_advance_outstanding_paise` is the number nobody enjoys: money the Customer already
    paid the abandoning vendor for materials, which this transfer deliberately does **not**
    recover and does **not** hand to the replacement. Render it as an open question for support,
    never as a pending refund.

    `to_partner` is a bare id rather than a vendor card. Identity disclosure on this surface is the
    same ladder every other M2 read obeys, and a transfer proposal is not the place to widen it.
    """

    class Meta:
        model = ProjectTransfer
        fields = (
            "id",
            "status",
            "reason_code",
            "note",
            "to_partner",
            "previous_remaining_paise",
            "replacement_remaining_paise",
            "delta_paise",
            "refunded_paise",
            "material_advance_outstanding_paise",
            "stage_prices",
            "expires_at",
            "decided_at",
            "applied_at",
            "created_at",
        )
        read_only_fields = fields


class ProjectPlanSerializer(serializers.Serializer[dict[str, Any]]):
    """The whole A5 project, in one read.

    The money block is the same six columns `EngagementSerializer` publishes, repeated here so a
    project screen needs one request rather than two, plus the two retention numbers. `M2-BE-504`
    guarantees `staged_total_paise == total_paise + amendment_delta_paise` by constraint, so
    "agreed, then changed by, now" needs no arithmetic in the client.

    `retention_withheld_paise` is what has actually been held so far and climbs as milestones are
    approved; `retention_paise` is where it is going. They are equal only once the last milestone
    is approved, which is exactly when `warranty_ends_at` appears.
    """

    engagement_id = serializers.UUIDField(read_only=True)
    status = serializers.ChoiceField(choices=Engagement.Status.choices, read_only=True)
    commercial_mode = serializers.ChoiceField(
        choices=Engagement.CommercialMode.choices, read_only=True
    )
    total_paise = serializers.IntegerField(read_only=True)
    staged_total_paise = serializers.IntegerField(read_only=True)
    amendment_delta_paise = serializers.IntegerField(read_only=True)
    funded_total_paise = serializers.IntegerField(read_only=True)
    approved_total_paise = serializers.IntegerField(read_only=True)
    released_total_paise = serializers.IntegerField(read_only=True)
    refunded_total_paise = serializers.IntegerField(read_only=True)
    retention_paise = serializers.IntegerField(read_only=True)
    retention_withheld_paise = serializers.IntegerField(read_only=True)
    warranty_ends_at = serializers.DateTimeField(read_only=True, allow_null=True)
    milestones = ProjectMilestoneSerializer(many=True, read_only=True)
    handover = ProjectHandoverSerializer(read_only=True)
    delay_claims = ProjectDelayClaimSerializer(many=True, read_only=True)
    #: The most recent transfer, in whatever state it is. Null when this project has never had
    #: one, which is almost all of them.
    transfer = ProjectTransferSerializer(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


class DelayClaimCreateSerializer(serializers.Serializer[dict[str, Any]]):
    """Raise a delay claim. Deliberately carries no amount — see `ProjectDelayClaimSerializer`."""

    #: Open rather than an enum, like `SafetyIncidentReportSerializer.category_code` and for the
    #: same reason: a fixed list of the ways a Customer can hold a site up guarantees the one that
    #: happened is not on it.
    reason_code = serializers.SlugField(max_length=80)
    description = serializers.CharField(max_length=8000)
    extension_days = serializers.IntegerField(min_value=1, max_value=90)
    #: Ids from this stage's own evidence rail. The server refuses any that are not on this stage,
    #: so a foreign id reads as "not on this milestone" rather than confirming it exists.
    evidence_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class DelayClaimDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    accept = serializers.BooleanField()
    note = serializers.CharField(max_length=2000, allow_blank=True, default="")


class DeliverableInputSerializer(serializers.Serializer[dict[str, Any]]):
    """One item in a handover. Exactly one of `evidence_id` and `external_url`.

    Validated here as well as by `requirements_deliverable_has_exactly_one_body`, because a client
    that sent both should be told which field is wrong rather than shown a 500 from a check
    constraint.
    """

    title = serializers.CharField(max_length=200)
    stage_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    evidence_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    external_url = serializers.URLField(
        max_length=1000, required=False, allow_blank=True, default=""
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        has_file = attrs.get("evidence_id") is not None
        has_link = bool(attrs.get("external_url"))
        if has_file == has_link:
            raise serializers.ValidationError(
                "A deliverable is either an uploaded file or an https link, and not both.",
            )
        return attrs


class HandoverSubmitSerializer(serializers.Serializer[dict[str, Any]]):
    note = serializers.CharField(max_length=4000, allow_blank=True, default="")
    items = DeliverableInputSerializer(many=True)


class TransferQuoteSerializer(serializers.Serializer[dict[str, Any]]):
    """The replacement's price for one unfinished milestone."""

    stage_id = serializers.UUIDField()
    amount_paise = serializers.IntegerField(min_value=1)


class ProjectTransferProposeSerializer(serializers.Serializer[dict[str, Any]]):
    """Operations names the replacement and their price for every unfinished milestone.

    Priced **per milestone**, never as a lump: a replacement who names one number for "the rest of
    it" has not said which of the agreed milestones they are doing, and the Customer would be
    accepting a total against a scope nobody restated.
    """

    to_partner_id = serializers.UUIDField()
    reason_code = serializers.SlugField(max_length=80)
    note = serializers.CharField(max_length=2000, allow_blank=True, default="")
    quotes = TransferQuoteSerializer(many=True)


class ProjectTransferDecisionSerializer(serializers.Serializer[dict[str, Any]]):
    accept = serializers.BooleanField()


class ProjectTerminationSerializer(serializers.Serializer[dict[str, Any]]):
    """End a project early. Carries no remedy, because this command decides none.

    Who owes whom what when a project ends early is the cancellation policy engine in Wave C6
    (`M2-BE-701`, `706`). What this does is return money nobody earned, which is the absence of a
    remedy rather than one.
    """

    reason_code = serializers.SlugField(max_length=80)
    note = serializers.CharField(max_length=2000, allow_blank=True, default="")
