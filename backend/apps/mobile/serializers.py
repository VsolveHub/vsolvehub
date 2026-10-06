"""Serializers for native sign-in."""

from rest_framework import serializers

from apps.identity.serializers import AuthenticatedSessionSerializer, OtpVerifySerializer
from apps.mobile.models import PushDevice


class MobileOtpVerifySerializer(OtpVerifySerializer):
    """Same OTP body as the web, with a required installation id."""

    device_identifier = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=128,
        write_only=True,
    )


class MobileAuthenticatedSessionSerializer(AuthenticatedSessionSerializer):
    session_token = serializers.CharField(read_only=True)


class PushDeviceRegisterSerializer(serializers.Serializer[dict[str, object]]):
    expo_push_token = serializers.CharField(max_length=200)
    app = serializers.ChoiceField(choices=("customer", "partner"))
    platform = serializers.ChoiceField(choices=("ios", "android"))
    app_version = serializers.CharField(max_length=32)

    def validate_expo_push_token(self, value: str) -> str:
        if value.startswith(("ExponentPushToken[", "ExpoPushToken[")):
            return value
        raise serializers.ValidationError("Enter a valid Expo push token.")


class PushDeviceSerializer(serializers.ModelSerializer[PushDevice]):
    class Meta:
        model = PushDevice
        fields = ("id", "app", "platform", "app_version", "last_registered_at")
        read_only_fields = fields


class PushDeviceUnregisterSerializer(serializers.Serializer[dict[str, object]]):
    expo_push_token = serializers.CharField(max_length=200)


class AppConfigQuerySerializer(serializers.Serializer[dict[str, object]]):
    app = serializers.ChoiceField(choices=("customer", "partner"))
    platform = serializers.ChoiceField(choices=("ios", "android"))
    version = serializers.CharField(max_length=32)


class AppConfigSerializer(serializers.Serializer[dict[str, object]]):
    minimum_version = serializers.CharField()
    latest_version = serializers.CharField()
    update_required = serializers.BooleanField()
    store_url = serializers.CharField(allow_blank=True)
