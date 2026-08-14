"""Operations case projections and command bodies.

One projection, not three: unlike a Booking, a case has exactly one audience. Operations opens
it, works it and closes it, and nobody else may read it at all — a case can quote a Customer's
complaint verbatim and name a Partner in a safety report, so there is no Customer-facing or
Partner-facing shape to publish.
"""

from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.cases.models import (
    ALLOWED_RESOLUTIONS,
    CASE_SUBJECT_FIELDS,
    OperationsCase,
    OperationsCaseEvent,
    OperationsCaseEvidence,
)

#: The request-body names of the subject columns, derived from the model's own tuple rather than
#: retyped — RULES §3(a) applied to a validator instead of a constraint. The model gained two
#: subjects in Wave C6 and this list would otherwise still be checking three.
CASE_SUBJECT_ID_FIELDS: tuple[str, ...] = tuple(f"{field}_id" for field in CASE_SUBJECT_FIELDS)


class OperationsCaseEventSerializer(serializers.ModelSerializer[OperationsCaseEvent]):
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = OperationsCaseEvent
        fields = ("id", "kind", "actor_id", "body", "context", "created_at")
        read_only_fields = fields


class OperationsCaseEvidenceSerializer(serializers.ModelSerializer[OperationsCaseEvidence]):
    """What a party put in front of the decision (`M2-BE-704`).

    Publishes the **reference**, never a URL. Reading the bytes goes through the rail that owns
    them — the requirement-attachment or stage-evidence read — which is where the scan verdict and
    the object-level check already live. A signed link minted here would be a second door into
    somebody's file with none of the first door's guards.
    """

    submitted_by_id = serializers.UUIDField(read_only=True)
    requirement_attachment_id = serializers.UUIDField(read_only=True, allow_null=True)
    stage_evidence_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = OperationsCaseEvidence
        fields = (
            "id",
            "party",
            "submitted_by_id",
            "statement",
            "requirement_attachment_id",
            "stage_evidence_id",
            "created_at",
        )
        read_only_fields = fields


class OperationsCaseSerializer(serializers.ModelSerializer[OperationsCase]):
    """One case, with the vocabulary a reviewer needs to close it.

    `allowed_resolutions` is published rather than hardcoded in the console. The set is a domain
    rule that differs per case kind, and a UI carrying its own copy would offer a button the
    server refuses the first time the two drift — the same reason `recovery_action` is published
    on Booking Groups instead of being inferred from status.
    """

    booking_id = serializers.UUIDField(read_only=True, allow_null=True)
    order_id = serializers.UUIDField(read_only=True, allow_null=True)
    partner_id = serializers.UUIDField(read_only=True, allow_null=True)
    #: Wave C6's two M2 subjects. Additive: an M1 case answers `null` to both, exactly as it
    #: always answered `null` to two of the three subjects it already had.
    requirement_id = serializers.UUIDField(read_only=True, allow_null=True)
    engagement_id = serializers.UUIDField(read_only=True, allow_null=True)
    owner_id = serializers.UUIDField(read_only=True, allow_null=True)
    appeal_requested_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    appeal_decided_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)
    allowed_resolutions = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
    evidence = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = OperationsCase
        fields = (
            "id",
            "kind",
            "severity",
            "status",
            "owner_team",
            "owner_id",
            "booking_id",
            "order_id",
            "partner_id",
            "requirement_id",
            "engagement_id",
            "summary",
            "detail",
            "due_at",
            "response_due_at",
            "is_overdue",
            "version",
            "resolution",
            "resolution_note",
            "resolved_at",
            "holds_payout",
            "held_ledger_entry_ids",
            "appeal_requested_at",
            "appeal_requested_by_id",
            "appeal_reason",
            "appeal_decided_at",
            "appeal_decided_by_id",
            "appeal_outcome",
            "allowed_resolutions",
            "events",
            "evidence",
            "server_now",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_allowed_resolutions(self, instance: OperationsCase) -> list[str]:
        return sorted(ALLOWED_RESOLUTIONS[instance.kind])

    @extend_schema_field(OperationsCaseEventSerializer(many=True))
    def get_events(self, instance: OperationsCase) -> Any:
        return OperationsCaseEventSerializer(instance.events.all(), many=True).data

    @extend_schema_field(OperationsCaseEvidenceSerializer(many=True))
    def get_evidence(self, instance: OperationsCase) -> Any:
        return OperationsCaseEvidenceSerializer(instance.evidence.all(), many=True).data

    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(self, _instance: OperationsCase) -> str:
        """`due_at` is a deadline a console counts down to, so it needs a server clock beside it
        for the same reason every other deadline in this contract does."""

        return timezone.now().isoformat()


class OperationsCaseListSerializer(serializers.ModelSerializer[OperationsCase]):
    """The queue row. No events and no detail — a list of two hundred cases should not carry
    two hundred audit trails, and the body of a safety report is not queue-scanning material."""

    booking_id = serializers.UUIDField(read_only=True, allow_null=True)
    partner_id = serializers.UUIDField(read_only=True, allow_null=True)
    owner_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = OperationsCase
        fields = (
            "id",
            "kind",
            "severity",
            "status",
            "owner_team",
            "owner_id",
            "booking_id",
            "partner_id",
            "summary",
            "due_at",
            "is_overdue",
            "version",
            "holds_payout",
            "created_at",
        )
        read_only_fields = fields


class OpenCaseRequestSerializer(serializers.Serializer[dict[str, Any]]):
    kind = serializers.ChoiceField(choices=OperationsCase.Kind.choices)
    summary = serializers.CharField(max_length=240)
    severity = serializers.ChoiceField(
        choices=OperationsCase.Severity.choices, default=OperationsCase.Severity.NORMAL
    )
    detail = serializers.CharField(max_length=4000, allow_blank=True, default="")
    booking_id = serializers.UUIDField(required=False, allow_null=True)
    order_id = serializers.UUIDField(required=False, allow_null=True)
    partner_id = serializers.UUIDField(required=False, allow_null=True)
    requirement_id = serializers.UUIDField(required=False, allow_null=True)
    engagement_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        subjects = [attrs.get(field) for field in CASE_SUBJECT_ID_FIELDS]
        if len([value for value in subjects if value is not None]) != 1:
            raise serializers.ValidationError(
                "A case is about exactly one booking, order, partner, request or engagement."
            )
        return attrs


class VersionedCaseCommandSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)


class EscalateCaseRequestSerializer(VersionedCaseCommandSerializer):
    severity = serializers.ChoiceField(choices=OperationsCase.Severity.choices)


class ResolveCaseRequestSerializer(VersionedCaseCommandSerializer):
    resolution = serializers.CharField(max_length=48)
    note = serializers.CharField(max_length=480)


class CaseResponseDeadlineRequestSerializer(VersionedCaseCommandSerializer):
    """`M2-BE-712`'s deadline extension, applied to a case's party window. Forward only."""

    response_due_at = serializers.DateTimeField()
    reason = serializers.CharField(max_length=480)


class CaseAppealDecisionRequestSerializer(VersionedCaseCommandSerializer):
    """`UPHELD` keeps the resolution; `OVERTURNED` reopens the case for a second decision."""

    outcome = serializers.ChoiceField(choices=(("UPHELD", "Upheld"), ("OVERTURNED", "Overturned")))
    note = serializers.CharField(max_length=480)


class CaseOverrideRequestSerializer(VersionedCaseCommandSerializer):
    """An audited manual override of a resolved case's terminal result.

    Still checked against the case kind's `allowed_resolutions`: an override is permission to
    reach a *different* documented outcome, never permission to reach an undocumented one.
    """

    resolution = serializers.CharField(max_length=48)
    note = serializers.CharField(max_length=480)


class CaseNoteRequestSerializer(serializers.Serializer[dict[str, Any]]):
    body = serializers.CharField(max_length=1000)
    #: Records that something was actually sent to a person, rather than an internal note. The
    #: distinction matters when reconstructing what Operations told whom, and when.
    is_communication = serializers.BooleanField(default=False)


class OperationsCasePageSerializer(serializers.Serializer[dict[str, Any]]):
    """The paginated envelope the queue actually returns.

    Declared explicitly because `responses={200: Serializer(many=True)}` publishes a bare array,
    and the view returns `{next, previous, results}`. A generated client built from the array
    shape reads `page.next` off an array and gets `undefined` — a contract that lies about its
    own response, which is worse than one that omits it.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = OperationsCaseListSerializer(many=True)


class TeamQueueSerializer(serializers.Serializer[dict[str, Any]]):
    owner_team = serializers.ChoiceField(choices=OperationsCase.Team.choices)
    open = serializers.IntegerField()
    unclaimed = serializers.IntegerField()


class CaseQueueSummarySerializer(serializers.Serializer[dict[str, Any]]):
    """The Operations home screen, counted over the whole queue rather than one page.

    Every field here is an aggregate the console cannot compute for itself: the case list is
    cursor-paginated, so a client counting its own rows would publish "the first fifty" as a
    total. `server_now` travels with the counts because the screen renders relative deadlines,
    and a clock-skewed browser would otherwise turn a real number into a wrong one.
    """

    server_now = serializers.DateTimeField()
    breaching_sla = serializers.IntegerField()
    oldest_overdue_minutes = serializers.IntegerField(allow_null=True)
    mine_open = serializers.IntegerField()
    mine_due_soon = serializers.IntegerField()
    holding_payout = serializers.IntegerField()
    teams = TeamQueueSerializer(many=True)
