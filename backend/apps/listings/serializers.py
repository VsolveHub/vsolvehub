from typing import Any

from rest_framework import serializers

from apps.catalog.models import ServiceVariant
from apps.identity.phone import InvalidPhoneNumberError, normalize_phone_number
from apps.listings.models import (
    Application,
    ApplicationAttachment,
    ApplicationReport,
    ApplicationStatusEvent,
    Listing,
    ListingReport,
    VendorSubscription,
    VendorSubscriptionPlan,
)


class PhoneNumberField(serializers.CharField):
    """Accept a local or E.164 number; an optional blank contact stays blank.

    ``apps.identity.phone.normalize_phone_number`` is the one canonical parser, so
    an application phone and a listing contact phone are stored identically.
    """

    def to_internal_value(self, data: Any) -> str:
        value = super().to_internal_value(data)
        if value == "":
            return ""
        try:
            return normalize_phone_number(value)
        except InvalidPhoneNumberError as exc:
            raise serializers.ValidationError(str(exc), code="invalid_phone_number") from exc


#: ``structured_fields`` is a JSON column that every browse response carries, so
#: its shape is bounded: a flat map of a few short, human-sized entries.
MAX_STRUCTURED_FIELD_COUNT = 20
MAX_STRUCTURED_FIELD_NAME_LENGTH = 60
MAX_STRUCTURED_FIELD_VALUE_LENGTH = 300


class ListingSummarySerializer(serializers.ModelSerializer[Listing]):
    poster_name = serializers.CharField(source="poster.display_name", read_only=True)
    service_name = serializers.CharField(source="variant.service.name", read_only=True)
    variant_name = serializers.CharField(source="variant.name", read_only=True)
    application_count = serializers.IntegerField(read_only=True, default=0)
    public_state = serializers.CharField(read_only=True)

    class Meta:
        model = Listing
        fields: tuple[str, ...] = (
            "id",
            "poster_name",
            "service_name",
            "variant_name",
            "title",
            "description",
            "structured_fields",
            "status",
            "moderation_status",
            "public_state",
            "location_text",
            "is_premium",
            "published_at",
            "expires_at",
            "application_count",
        )


class ListingDetailSerializer(ListingSummarySerializer):
    contact_masked = serializers.SerializerMethodField()
    listing_type_schema = serializers.SerializerMethodField()
    application_schema = serializers.SerializerMethodField()

    class Meta(ListingSummarySerializer.Meta):
        fields = (
            *ListingSummarySerializer.Meta.fields,
            "contact_masked",
            "listing_type_schema",
            "application_schema",
        )

    def get_contact_masked(self, obj: Listing) -> dict[str, str]:
        return {
            "phone": obj.contact_phone[:2] + "******" + obj.contact_phone[-2:]
            if obj.contact_phone
            else "",
            "email": obj.contact_email[:2] + "***" if obj.contact_email else "",
        }

    def get_listing_type_schema(self, obj: Listing) -> dict[str, Any]:
        if not hasattr(obj, "variant") or not obj.variant:
            return {}
        cfg = obj.variant.a10_configurations.filter(status="ACTIVE").first()
        return cfg.listing_type_schema if cfg else {}

    def get_application_schema(self, obj: Listing) -> dict[str, Any]:
        if not hasattr(obj, "variant") or not obj.variant:
            return {}
        cfg = obj.variant.a10_configurations.filter(status="ACTIVE").first()
        return cfg.application_schema if cfg else {}


class PartnerListingSerializer(ListingSummarySerializer):
    title = serializers.CharField(min_length=5, max_length=180, trim_whitespace=True)
    description = serializers.CharField(min_length=20, max_length=5000, trim_whitespace=True)
    structured_fields = serializers.DictField(required=False)
    contact_phone = PhoneNumberField(max_length=32, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    variant = serializers.UUIDField(source="variant_id", required=False)
    service_id = serializers.UUIDField(required=False, write_only=True)
    service_slug = serializers.CharField(required=False, write_only=True)
    is_premium = serializers.BooleanField(required=False, default=False)
    payment_attempt_id = serializers.UUIDField(read_only=True, allow_null=True)
    listing_type_schema = serializers.SerializerMethodField()

    class Meta(ListingSummarySerializer.Meta):
        fields = (
            *ListingSummarySerializer.Meta.fields,
            "variant",
            "service_id",
            "service_slug",
            "contact_phone",
            "contact_email",
            "moderation_reason",
            "closed_at",
            "removed_at",
            "version",
            "created_at",
            "payment_attempt_id",
            "listing_type_schema",
        )
        read_only_fields = (
            "status",
            "moderation_status",
            "moderation_reason",
            "closed_at",
            "removed_at",
            "version",
            "created_at",
            "payment_attempt_id",
            "listing_type_schema",
        )

    def get_listing_type_schema(self, obj: Listing) -> dict[str, Any]:
        if not hasattr(obj, "variant") or not obj.variant:
            return {}
        cfg = obj.variant.a10_configurations.filter(status="ACTIVE").first()
        return cfg.listing_type_schema if cfg else {}

    def validate_structured_fields(self, value: dict[str, Any]) -> dict[str, Any]:
        """Keep role details to a small, flat, human-sized map.

        The column is JSON, so without this a poster could store a nested object of
        unbounded size that every browse response then carries to every reader.
        """

        if len(value) > MAX_STRUCTURED_FIELD_COUNT:
            raise serializers.ValidationError(
                f"At most {MAX_STRUCTURED_FIELD_COUNT} role details may be provided."
            )
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            name = str(key).strip()
            if not name:
                raise serializers.ValidationError("Each role detail needs a name.")
            if len(name) > MAX_STRUCTURED_FIELD_NAME_LENGTH:
                raise serializers.ValidationError(
                    f"Role detail names must be {MAX_STRUCTURED_FIELD_NAME_LENGTH} "
                    "characters or fewer."
                )
            if item is None or item == "":
                continue
            if isinstance(item, (dict, list)):
                raise serializers.ValidationError(
                    f"'{name}' must be a single value, not a nested object or list."
                )
            text = str(item).strip()
            if len(text) > MAX_STRUCTURED_FIELD_VALUE_LENGTH:
                raise serializers.ValidationError(
                    f"'{name}' must be {MAX_STRUCTURED_FIELD_VALUE_LENGTH} characters or fewer."
                )
            # Reconcile key aliases
            if name == "pay_range":
                name = "salary_range"
            elif name == "work_mode":
                name = "shift"
            cleaned[name] = text
        return cleaned

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = super().validate(attrs)
        structured = attrs.get("structured_fields")
        if structured is not None:
            variant = None
            if self.instance and hasattr(self.instance, "variant"):
                variant = self.instance.variant
            variant_id = attrs.get("variant_id")
            if not variant and variant_id:
                variant = ServiceVariant.objects.filter(id=variant_id).first()
            if not variant:
                service_id = attrs.get("service_id")
                service_slug = attrs.get("service_slug")
                if service_id:
                    variant = ServiceVariant.objects.filter(
                        service_id=service_id, booking_archetype="A10_LISTING", is_active=True
                    ).first()
                elif service_slug:
                    variant = ServiceVariant.objects.filter(
                        service__slug=service_slug, booking_archetype="A10_LISTING", is_active=True
                    ).first()

            if variant:
                config = variant.a10_configurations.filter(status="ACTIVE").first()
                if config and config.listing_type_schema:
                    properties = config.listing_type_schema.get("properties", {})
                    if properties:
                        allowed_keys = set(properties.keys())
                        for key, val in structured.items():
                            if key not in allowed_keys:
                                allowed_str = ", ".join(sorted(allowed_keys))
                                raise serializers.ValidationError(
                                    {
                                        "structured_fields": (
                                            f"'{key}' is not an allowed role detail. "
                                            f"Allowed: {allowed_str}."
                                        )
                                    }
                                )
                            prop_enum = properties[key].get("enum")
                            if prop_enum and val not in prop_enum:
                                raise serializers.ValidationError(
                                    {
                                        "structured_fields": (
                                            f"'{val}' is not an allowed choice for '{key}'. "
                                            f"Allowed choices: {', '.join(prop_enum)}."
                                        )
                                    }
                                )
        return attrs


class ApplicationAttachmentSerializer(serializers.ModelSerializer[ApplicationAttachment]):
    class Meta:
        model = ApplicationAttachment
        fields = ("id", "file_url", "file_name", "created_at")


class ApplicationStatusEventSerializer(serializers.ModelSerializer[ApplicationStatusEvent]):
    class Meta:
        model = ApplicationStatusEvent
        fields = ("id", "from_status", "to_status", "kind", "note", "created_at")


class ApplicationSerializer(serializers.ModelSerializer[Application]):
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    applicant_name = serializers.SerializerMethodField()
    applicant_phone = serializers.SerializerMethodField()
    applicant_email = serializers.SerializerMethodField()
    attachments = ApplicationAttachmentSerializer(many=True, read_only=True)
    status_events = ApplicationStatusEventSerializer(many=True, read_only=True)

    class Meta:
        model = Application
        fields = (
            "id",
            "listing",
            "listing_title",
            "status",
            "applicant_snapshot",
            "applicant_name",
            "applicant_phone",
            "applicant_email",
            "cover_note",
            "resume_url",
            "attachments",
            "status_events",
            "contact_revealed_at",
            "duplicate_of",
            "withdrawn_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "contact_revealed_at",
            "duplicate_of",
            "withdrawn_at",
            "created_at",
            "updated_at",
        )

    def _snapshot_value(self, obj: Application, key: str) -> str:
        if obj.contact_revealed_at is None and key in ("phone", "email"):
            return ""
        return str(obj.applicant_snapshot.get(key, ""))

    def get_applicant_name(self, obj: Application) -> str:
        return str(obj.applicant_snapshot.get("name", "Applicant"))

    def get_applicant_phone(self, obj: Application) -> str:
        return self._snapshot_value(obj, "phone")

    def get_applicant_email(self, obj: Application) -> str:
        return self._snapshot_value(obj, "email")


class SubmitApplicationSerializer(serializers.Serializer[dict[str, Any]]):
    """Customer application. The server is the authority; the form mirrors these rules."""

    name = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    phone = PhoneNumberField(max_length=32, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    experience = serializers.CharField(
        max_length=120, required=False, allow_blank=True, trim_whitespace=True
    )
    cover_note = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True
    )
    resume_url = serializers.URLField(max_length=500, required=False, allow_blank=True)

    def validate_name(self, value: str) -> str:
        if not any(character.isalpha() for character in value):
            raise serializers.ValidationError("Enter your full name.", code="invalid_name")
        return value


class ActionReasonSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(
        max_length=480, required=False, allow_blank=True, trim_whitespace=True
    )


class ModerationSerializer(serializers.Serializer[dict[str, Any]]):
    approved = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True)


class ApplicationStatusSerializer(serializers.Serializer[dict[str, Any]]):
    status = serializers.ChoiceField(choices=Application.Status.choices)


class ReportSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=80, trim_whitespace=True)
    detail = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True
    )


class ListingReportSerializer(serializers.ModelSerializer[ListingReport]):
    class Meta:
        model = ListingReport
        fields = ("id", "listing", "reason", "detail", "status", "operations_case", "created_at")


class ApplicationReportSerializer(serializers.ModelSerializer[ApplicationReport]):
    class Meta:
        model = ApplicationReport
        fields = (
            "id",
            "application",
            "reason",
            "detail",
            "status",
            "operations_case",
            "created_at",
        )


class VendorSubscriptionPlanSerializer(serializers.ModelSerializer[VendorSubscriptionPlan]):
    class Meta:
        model = VendorSubscriptionPlan
        fields = (
            "id",
            "code",
            "name",
            "price_paise",
            "duration_days",
            "max_active_listings",
            "premium_capabilities",
            "premium_price_paise",
        )


class VendorSubscriptionSerializer(serializers.ModelSerializer[VendorSubscription]):
    plan = VendorSubscriptionPlanSerializer(read_only=True)
    payment_attempt_id = serializers.UUIDField(source="payment_attempt.id", read_only=True)

    class Meta:
        model = VendorSubscription
        fields = (
            "id",
            "plan",
            "payment_attempt_id",
            "status",
            "starts_at",
            "ends_at",
            "created_at",
        )


class ListingCategoryOptionSerializer(serializers.Serializer[dict[str, str]]):
    label = serializers.CharField()  # type: ignore[assignment]
    value = serializers.CharField(allow_blank=True)


class ListingFiltersTaxonomySerializer(serializers.Serializer[dict[str, Any]]):
    categories = ListingCategoryOptionSerializer(many=True)


class OpsCreateVendorSubscriptionPlanSerializer(serializers.ModelSerializer[VendorSubscriptionPlan]):
    class Meta:
        model = VendorSubscriptionPlan
        fields = (
            "code",
            "name",
            "price_paise",
            "duration_days",
            "max_active_listings",
            "premium_capabilities",
            "premium_price_paise",
        )

class OpsUpdateVendorSubscriptionPlanSerializer(serializers.ModelSerializer[VendorSubscriptionPlan]):
    class Meta:
        model = VendorSubscriptionPlan
        fields = (
            "name",
            "price_paise",
            "duration_days",
            "max_active_listings",
            "premium_capabilities",
            "premium_price_paise",
            "is_active",
        )
