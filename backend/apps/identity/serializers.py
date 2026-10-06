"""Identity request and response contracts."""

from django.conf import settings
from drf_spectacular.utils import OpenApiExample, extend_schema_serializer
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
    # Opt-in only. Customer sign-in never sends this — self-service signup is the point
    # there — but the Partner app does, since a Partner account only ever exists because
    # someone applied, so "no account" is worth saying before a code is sent for nothing.
    intended_role = serializers.ChoiceField(
        choices=["partner"],
        required=False,
        allow_blank=True,
        default="",
        write_only=True,
    )


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            "OTP issued",
            value={
                "challenge_id": "6d8cd4d8-c50a-4cb2-85e8-0357ee735cc6",
                "expires_in_seconds": 300,
                "resend_after_seconds": 60,
                "code_length": 6,
                "development_code": None,
            },
            response_only=True,
            status_codes=["202"],
        )
    ]
)
class OtpIssuedSerializer(serializers.Serializer[dict[str, object]]):
    challenge_id = serializers.UUIDField(read_only=True)
    expires_in_seconds = serializers.IntegerField(read_only=True)
    resend_after_seconds = serializers.IntegerField(read_only=True)
    code_length = serializers.IntegerField(read_only=True)
    development_code = serializers.CharField(
        read_only=True,
        allow_null=True,
        required=False,
    )


class OtpVerifySerializer(serializers.Serializer[dict[str, object]]):
    challenge_id = serializers.UUIDField()
    phone_number = PhoneNumberField(max_length=32, trim_whitespace=True)
    code = serializers.CharField(
        min_length=settings.OTP_CODE_LENGTH,
        max_length=settings.OTP_CODE_LENGTH,
        trim_whitespace=False,
        write_only=True,
    )
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
    referral_code = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=32,
        write_only=True,
        help_text="Applied only when this verification creates a new account.",
    )

    def validate_code(self, value: str) -> str:
        if len(value) != settings.OTP_CODE_LENGTH or not value.isascii() or not value.isdigit():
            raise serializers.ValidationError(
                "Enter the complete numeric code.",
                code="invalid_otp_format",
            )
        return value


class UserSerializer(serializers.ModelSerializer[User]):
    display_name = serializers.CharField(
        source="customer_profile.display_name",
        read_only=True,
        default="",
    )
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "phone_number",
            "display_name",
            "full_name",
            "email",
            "date_joined",
            "roles",
        )
        read_only_fields = fields

    def get_roles(self, user: User) -> list[str]:
        return list(
            user.userrole_set.filter(revoked_at__isnull=True)
            .order_by("role__code")
            .values_list("role__code", flat=True),
        )


class CustomerProfileUpdateSerializer(serializers.Serializer[dict[str, object]]):
    """The customer-owned personal fields that may change independently of login."""

    display_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
        trim_whitespace=True,
    )
    full_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=150,
        trim_whitespace=True,
    )
    email = serializers.EmailField(
        required=False,
        allow_blank=True,
        max_length=254,
    )


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            "Signed out",
            value={"user": None, "active_role": None, "session_expires_at": None},
            response_only=True,
            status_codes=["200"],
        ),
        OpenApiExample(
            "Authenticated customer",
            value={
                "user": {
                    "id": "f26419bd-c768-4ddb-bff3-4cc405fdbf52",
                    "phone_number": "+919876543210",
                    "display_name": "Gopal Rao",
                    "full_name": "",
                    "email": "",
                    "date_joined": "2026-08-19T12:00:00Z",
                    "roles": ["customer"],
                },
                "active_role": "customer",
                "session_expires_at": "2026-09-01T12:00:00Z",
            },
            response_only=True,
            status_codes=["200"],
        ),
    ]
)
class SessionStateSerializer(serializers.Serializer[dict[str, object]]):
    user = UserSerializer(read_only=True, allow_null=True)
    active_role = serializers.CharField(read_only=True, allow_null=True)
    session_expires_at = serializers.DateTimeField(read_only=True, allow_null=True)


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            "Authenticated customer",
            value={
                "user": {
                    "id": "f26419bd-c768-4ddb-bff3-4cc405fdbf52",
                    "phone_number": "+919876543210",
                    "display_name": "Gopal Rao",
                    "full_name": "",
                    "email": "",
                    "date_joined": "2026-08-19T12:00:00Z",
                    "roles": ["customer"],
                },
                "active_role": "customer",
                "session_expires_at": "2026-09-01T12:00:00Z",
            },
            response_only=True,
            status_codes=["200"],
        )
    ]
)
class AuthenticatedSessionSerializer(serializers.Serializer[dict[str, object]]):
    user = UserSerializer(read_only=True)
    active_role = serializers.CharField(read_only=True)
    session_expires_at = serializers.DateTimeField(read_only=True)


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            "CSRF bootstrap",
            value={"csrf_token": "masked-csrf-token"},
            response_only=True,
            status_codes=["200"],
        )
    ]
)
class CsrfTokenSerializer(serializers.Serializer[dict[str, object]]):
    csrf_token = serializers.CharField(read_only=True)


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
