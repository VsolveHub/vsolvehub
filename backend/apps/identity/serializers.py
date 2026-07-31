"""Identity request and response contracts."""

from rest_framework import serializers

from apps.identity.models import (
    CommunicationPreference,
    ConsentReceipt,
    PrivacyRequest,
    User,
    UserSession,
)
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number


class PhoneNumberField(serializers.CharField):
    def to_internal_value(self, data: str) -> str:
        value = super().to_internal_value(data)
        try:
            return normalize_phone_number(value)
        except InvalidPhoneNumberError as exc:
            raise serializers.ValidationError(str(exc), code="invalid_phone_number") from exc


class OtpRequestSerializer(serializers.Serializer[dict[str, object]]):
    phone_number = PhoneNumberField(max_length=32, trim_whitespace=True)
    device_identifier = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=128,
        write_only=True,
    )


class OtpIssuedSerializer(serializers.Serializer[dict[str, object]]):
    challenge_id = serializers.UUIDField(read_only=True)
    expires_in_seconds = serializers.IntegerField(read_only=True)
    resend_after_seconds = serializers.IntegerField(read_only=True)
    development_code = serializers.CharField(
        read_only=True,
        allow_null=True,
        required=False,
    )


class OtpVerifySerializer(serializers.Serializer[dict[str, object]]):
    challenge_id = serializers.UUIDField()
    phone_number = PhoneNumberField(max_length=32, trim_whitespace=True)
    code = serializers.RegexField(regex=r"^\d{6}$", min_length=6, max_length=6, write_only=True)
    device_identifier = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=128,
        write_only=True,
    )
    device_label = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
        write_only=True,
    )


class UserSerializer(serializers.ModelSerializer[User]):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "phone_number", "full_name", "email", "roles")
        read_only_fields = fields

    def get_roles(self, user: User) -> list[str]:
        return list(
            user.userrole_set.filter(revoked_at__isnull=True)
            .order_by("role__code")
            .values_list("role__code", flat=True),
        )


class AuthenticatedSessionSerializer(serializers.Serializer[dict[str, object]]):
    user = UserSerializer(read_only=True)
    session_expires_at = serializers.DateTimeField(read_only=True)


class UserSessionSerializer(serializers.ModelSerializer[UserSession]):
    device_label = serializers.CharField(source="device.label", allow_null=True, read_only=True)
    active_role = serializers.CharField(source="active_role.code", allow_null=True, read_only=True)
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = (
            "id",
            "device_label",
            "active_role",
            "created_at",
            "last_seen_at",
            "expires_at",
            "is_current",
        )
        read_only_fields = fields

    def get_is_current(self, session: UserSession) -> bool:
        current_session_hash = self.context.get("current_session_hash")
        return bool(current_session_hash and session.session_key_hash == current_session_hash)


class RoleSwitchSerializer(serializers.Serializer[dict[str, object]]):
    role = serializers.SlugField(max_length=50)


class ActiveRoleSerializer(serializers.Serializer[dict[str, object]]):
    active_role = serializers.CharField(read_only=True, allow_null=True)


class StepUpSessionSerializer(serializers.Serializer[dict[str, object]]):
    stepped_up_at = serializers.DateTimeField(read_only=True)


class ConsentReceiptCreateSerializer(serializers.Serializer[dict[str, object]]):
    purpose = serializers.SlugField(max_length=100)
    policy_version = serializers.CharField(max_length=100)


class ConsentReceiptSerializer(serializers.ModelSerializer[ConsentReceipt]):
    class Meta:
        model = ConsentReceipt
        fields = ("id", "purpose", "policy_version", "accepted_at", "withdrawn_at")
        read_only_fields = fields


class CommunicationPreferenceSerializer(serializers.ModelSerializer[CommunicationPreference]):
    class Meta:
        model = CommunicationPreference
        fields = ("channel", "purpose", "is_enabled", "updated_at")
        read_only_fields = ("updated_at",)


class PrivacyRequestCreateSerializer(serializers.Serializer[dict[str, object]]):
    kind = serializers.ChoiceField(choices=PrivacyRequest.Kind.choices)


class PrivacyRequestSerializer(serializers.ModelSerializer[PrivacyRequest]):
    class Meta:
        model = PrivacyRequest
        fields = ("id", "kind", "status", "requested_at", "completed_at")
        read_only_fields = fields
