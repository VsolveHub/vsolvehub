from typing import Any

from rest_framework import serializers

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

    class Meta(ListingSummarySerializer.Meta):
        fields = (*ListingSummarySerializer.Meta.fields, "contact_masked")

    def get_contact_masked(self, obj: Listing) -> dict[str, str]:
        return {
            "phone": obj.contact_phone[:2] + "******" + obj.contact_phone[-2:]
            if obj.contact_phone
            else "",
            "email": obj.contact_email[:2] + "***" if obj.contact_email else "",
        }


class PartnerListingSerializer(ListingSummarySerializer):
    contact_phone = serializers.CharField(required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    variant = serializers.UUIDField(source="variant_id", required=False)
    service_id = serializers.UUIDField(required=False, write_only=True)
    service_slug = serializers.CharField(required=False, write_only=True)
    is_premium = serializers.BooleanField(required=False, default=False)
    payment_attempt_id = serializers.UUIDField(read_only=True, allow_null=True)

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
        )


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
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True)
    experience = serializers.CharField(max_length=120, required=False, allow_blank=True)
    cover_note = serializers.CharField(required=False, allow_blank=True)
    resume_url = serializers.URLField(required=False, allow_blank=True)


class ActionReasonSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(required=False, allow_blank=True)


class ModerationSerializer(serializers.Serializer[dict[str, Any]]):
    approved = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True)


class ApplicationStatusSerializer(serializers.Serializer[dict[str, Any]]):
    status = serializers.ChoiceField(choices=Application.Status.choices)


class ReportSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(max_length=80)
    detail = serializers.CharField(required=False, allow_blank=True)


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
