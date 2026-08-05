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

from apps.cases.models import ALLOWED_RESOLUTIONS, OperationsCase, OperationsCaseEvent


class OperationsCaseEventSerializer(serializers.ModelSerializer[OperationsCaseEvent]):
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = OperationsCaseEvent
        fields = ("id", "kind", "actor_id", "body", "context", "created_at")
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
    owner_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)
    allowed_resolutions = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()
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
            "summary",
            "detail",
            "due_at",
            "is_overdue",
            "version",
            "resolution",
            "resolution_note",
            "resolved_at",
            "holds_payout",
            "allowed_resolutions",
            "events",
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

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        subjects = [attrs.get(field) for field in ("booking_id", "order_id", "partner_id")]
        if len([value for value in subjects if value is not None]) != 1:
            raise serializers.ValidationError(
                "A case is about exactly one booking, order or partner."
            )
        return attrs


class VersionedCaseCommandSerializer(serializers.Serializer[dict[str, Any]]):
    expected_version = serializers.IntegerField(min_value=1)


class EscalateCaseRequestSerializer(VersionedCaseCommandSerializer):
    severity = serializers.ChoiceField(choices=OperationsCase.Severity.choices)


class ResolveCaseRequestSerializer(VersionedCaseCommandSerializer):
    resolution = serializers.CharField(max_length=48)
    note = serializers.CharField(max_length=480)


class CaseNoteRequestSerializer(serializers.Serializer[dict[str, Any]]):
    body = serializers.CharField(max_length=1000)
    #: Records that something was actually sent to a person, rather than an internal note. The
    #: distinction matters when reconstructing what Operations told whom, and when.
    is_communication = serializers.BooleanField(default=False)
