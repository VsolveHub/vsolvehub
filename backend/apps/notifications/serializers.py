"""Kill switch projections and commands, and the in-app notification feed."""

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.notifications.models import KillSwitch, NotificationIntent
from apps.notifications.templates_registry import render_notification

#: Context keys that name the thing a notice is about, in the order a link should prefer them.
#:
#: The server publishes *what* the notice concerns and each app decides where that lives, because
#: the customer and partner apps route the same engagement to different paths. Publishing a URL
#: here would make Django the owner of two route tables it cannot see.
_TARGET_KEYS: tuple[tuple[str, str], ...] = (
    ("engagement_id", "ENGAGEMENT"),
    ("requirement_id", "REQUIREMENT"),
)


class KillSwitchSerializer(serializers.ModelSerializer[KillSwitch]):
    """A switch, with both signatures and both timestamps.

    Who engaged it and why are published rather than kept internal: the question asked during an
    incident is "why did notifications stop at 3am", and an answer that requires a database query
    is an answer nobody gets in time.
    """

    engaged_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    released_by_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = KillSwitch
        fields = (
            "id",
            "scope",
            "target",
            "is_engaged",
            "reason",
            "engaged_by_id",
            "engaged_at",
            "released_by_id",
            "released_at",
            "version",
            "updated_at",
        )
        read_only_fields = fields


class EngageKillSwitchRequestSerializer(serializers.Serializer[dict[str, Any]]):
    scope = serializers.ChoiceField(choices=KillSwitch.Scope.choices)
    #: Empty for a global switch; a slug for one service area or service.
    target = serializers.CharField(max_length=140, allow_blank=True, default="")
    #: Required. An outage nobody can explain afterwards is worse than the outage, and the model
    #: carries a check constraint that says the same thing.
    reason = serializers.CharField(max_length=240)


class ReleaseKillSwitchRequestSerializer(serializers.Serializer[dict[str, Any]]):
    scope = serializers.ChoiceField(choices=KillSwitch.Scope.choices)
    target = serializers.CharField(max_length=140, allow_blank=True, default="")


class NotificationTargetSerializer(serializers.Serializer[dict[str, Any]]):
    """What a notice is about, so an app can decide where to send the reader."""

    kind = serializers.CharField()
    id = serializers.UUIDField()


class NotificationSerializer(serializers.ModelSerializer[NotificationIntent]):
    """One in-app notice as a person reads it.

    `title` and `body` are rendered here rather than stored, which is the whole point of
    `templates_registry`: the feed always shows today's copy, and the row never holds a sentence
    with somebody's address in it.
    """

    title = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()
    target = serializers.SerializerMethodField()

    class Meta:
        model = NotificationIntent
        fields = ("id", "purpose", "title", "body", "target", "created_at", "read_at")
        read_only_fields = fields

    def get_title(self, obj: NotificationIntent) -> str:
        return render_notification(template_code=obj.template_code, context=obj.context).title

    def get_body(self, obj: NotificationIntent) -> str:
        return render_notification(template_code=obj.template_code, context=obj.context).body

    @extend_schema_field(NotificationTargetSerializer(allow_null=True))
    def get_target(self, obj: NotificationIntent) -> dict[str, Any] | None:
        """The most specific thing this notice concerns, or null.

        Null is a real answer — a notice about a closed request that no longer has a page to open
        should lead nowhere rather than to a 404 — so the clients must handle it.
        """

        explicit_kind = obj.context.get("target_kind")
        explicit_id = obj.context.get("target_id")
        if isinstance(explicit_kind, str) and explicit_kind and isinstance(explicit_id, str):
            return {"kind": explicit_kind, "id": explicit_id}

        for key, kind in _TARGET_KEYS:
            value = obj.context.get(key)
            if isinstance(value, str) and value:
                return {"kind": kind, "id": value}
        return None


class NotificationPageSerializer(serializers.Serializer[dict[str, Any]]):
    """The cursor page envelope.

    Declared rather than implied: drf-spectacular cannot see a paginator instantiated inside a
    plain `APIView`, so an operation declaring a bare array would publish a shape the view never
    sends — the defect `RequirementSummaryPageSerializer` was written to correct.
    """

    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = NotificationSerializer(many=True)


class UnreadNotificationCountSerializer(serializers.Serializer[dict[str, Any]]):
    """The badge number, and nothing else."""

    unread = serializers.IntegerField()


class MarkNotificationReadRequestSerializer(serializers.Serializer[dict[str, Any]]):
    """Mark one notice read, or all of them.

    Exactly one of the two is required. "Neither" would be a request with no meaning, and "both"
    would leave the server guessing which the person actually pressed.
    """

    notification_id = serializers.UUIDField(required=False)
    all = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        has_id = attrs.get("notification_id") is not None
        if has_id == bool(attrs.get("all")):
            raise serializers.ValidationError(
                "Send either notification_id or all, not both and not neither."
            )
        return attrs
