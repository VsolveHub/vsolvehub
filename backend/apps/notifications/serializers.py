"""Kill switch projections and commands."""

from typing import Any

from rest_framework import serializers

from apps.notifications.models import KillSwitch


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
