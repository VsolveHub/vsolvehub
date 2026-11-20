"""Serializers for Operations Areas, Area Requests, and Coverage Lite."""

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.locations.models import ServiceArea, indian_postal_code_validator


class PostalCodeItemSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    code = serializers.CharField()
    city = serializers.CharField()
    state = serializers.CharField()
    is_active = serializers.BooleanField()


class ServiceAreaServiceItemSerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField()
    variant_name = serializers.CharField()
    trade_name = serializers.CharField()
    #: The Partner trade this service needs (`ServiceVariant.required_skill_code`), "" if none.
    skill_code = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()


class OperationsServiceAreaListSerializer(serializers.ModelSerializer[ServiceArea]):
    postal_code_count = serializers.IntegerField(read_only=True)
    postal_codes = serializers.SerializerMethodField()
    services_active_count = serializers.IntegerField(read_only=True)
    services_total_count = serializers.IntegerField(read_only=True)
    partner_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ServiceArea
        fields = (
            "id",
            "slug",
            "name",
            "zone",
            "state_code",
            "timezone",
            "is_active",
            "is_accepting_partners",
            "postal_code_count",
            "postal_codes",
            "services_active_count",
            "services_total_count",
            "partner_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_postal_codes(instance: ServiceArea) -> list[str]:
        if hasattr(instance, "prefetched_postal_codes"):
            return sorted(instance.prefetched_postal_codes)
        return sorted(link.postal_code.code for link in instance.postal_code_links.all())


class OperationsServiceAreaDetailSerializer(OperationsServiceAreaListSerializer):
    postal_code_items = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()

    class Meta:
        model = ServiceArea
        fields = (
            "id",
            "slug",
            "name",
            "zone",
            "state_code",
            "timezone",
            "is_active",
            "is_accepting_partners",
            "postal_code_count",
            "postal_codes",
            "services_active_count",
            "services_total_count",
            "partner_count",
            "created_at",
            "updated_at",
            "postal_code_items",
            "services",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(PostalCodeItemSerializer(many=True))
    def get_postal_code_items(instance: ServiceArea) -> list[dict[str, Any]]:
        return [
            {
                "id": link.postal_code.id,
                "code": link.postal_code.code,
                "city": link.postal_code.city,
                "state": link.postal_code.state,
                "is_active": link.postal_code.is_active,
            }
            for link in instance.postal_code_links.select_related("postal_code").all()
        ]

    @staticmethod
    @extend_schema_field(ServiceAreaServiceItemSerializer(many=True))
    def get_services(instance: ServiceArea) -> list[dict[str, Any]]:
        offerable = getattr(instance, "offerable_services", None)
        if offerable is not None:
            return list(offerable)
        results: list[dict[str, Any]] = []
        for link in instance.service_links.select_related(
            "variant__service__subcategory__category"
        ).all():
            variant = link.variant
            trade_name = "General"
            if (
                hasattr(variant, "service")
                and variant.service
                and variant.service.subcategory
                and variant.service.subcategory.category
            ):
                trade_name = variant.service.subcategory.category.name
            results.append(
                {
                    "variant_id": variant.id,
                    "variant_name": variant.name,
                    "trade_name": trade_name,
                    "skill_code": variant.required_skill_code,
                    "is_active": link.is_active,
                }
            )
        return results


class OperationsServiceAreaCreateSerializer(serializers.Serializer[dict[str, Any]]):
    slug = serializers.SlugField(max_length=120)
    name = serializers.CharField(max_length=160)
    zone = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    state_code = serializers.CharField(max_length=8, required=False, allow_blank=True, default="")
    timezone = serializers.CharField(max_length=64, required=False, default="Asia/Kolkata")
    is_accepting_partners = serializers.BooleanField(required=False, default=True)
    is_active = serializers.BooleanField(required=False, default=True)


class OperationsServiceAreaUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    name = serializers.CharField(max_length=160, required=False)
    zone = serializers.CharField(max_length=64, required=False, allow_blank=True)
    state_code = serializers.CharField(max_length=8, required=False, allow_blank=True)
    timezone = serializers.CharField(max_length=64, required=False)
    is_accepting_partners = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)


class OperationsServiceAreaAddPinSerializer(serializers.Serializer[dict[str, Any]]):
    postal_code = serializers.CharField(validators=[indian_postal_code_validator])
    city = serializers.CharField(max_length=120, required=False, allow_blank=True)
    state = serializers.CharField(max_length=120, required=False, allow_blank=True)


class OperationsServiceAreaToggleServiceSerializer(serializers.Serializer[dict[str, Any]]):
    variant_id = serializers.UUIDField(required=False, allow_null=True)
    variant_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    is_active = serializers.BooleanField()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("variant_id") and not attrs.get("variant_ids"):
            raise serializers.ValidationError("Either variant_id or variant_ids must be provided.")
        return attrs


class OperationsBulkPinRowSerializer(serializers.Serializer[dict[str, Any]]):
    pin = serializers.CharField(validators=[indian_postal_code_validator])
    area_slug = serializers.SlugField()
    city = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    state = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class OperationsBulkPinConflictSerializer(serializers.Serializer[dict[str, Any]]):
    pin = serializers.CharField()
    target_area_slug = serializers.CharField()
    target_area_id = serializers.UUIDField()
    current_area_slug = serializers.CharField()
    current_area_id = serializers.UUIDField()
    current_area_name = serializers.CharField()


class OperationsBulkPinPreviewResultSerializer(serializers.Serializer[dict[str, Any]]):
    total = serializers.IntegerField()
    add = serializers.IntegerField()
    same = serializers.IntegerField()
    conflict = serializers.IntegerField()
    invalid = serializers.IntegerField()
    unknown_area = serializers.IntegerField()
    unknown_pin = serializers.IntegerField()
    conflicts = OperationsBulkPinConflictSerializer(many=True)
    row_errors = serializers.ListField(child=serializers.DictField())


class OperationsBulkPinApplySerializer(serializers.Serializer[dict[str, Any]]):
    csv_content = serializers.CharField(required=False, allow_blank=True, default="")
    rows = OperationsBulkPinRowSerializer(many=True, required=False, default=list)
    conflict_resolutions = serializers.DictField(
        child=serializers.ChoiceField(choices=["MOVE", "SKIP"]),
        required=False,
        default=dict,
    )


class OperationsBulkPinApplyResultSerializer(serializers.Serializer[dict[str, Any]]):
    added = serializers.IntegerField()
    moved = serializers.IntegerField()
    skipped = serializers.IntegerField()
    created_postal_codes = serializers.IntegerField()
    row_errors = serializers.ListField(child=serializers.DictField())


# --- Area Requests ---


class OperationsAreaRequestTradeCountSerializer(serializers.Serializer[dict[str, Any]]):
    trade_name = serializers.CharField()
    skill_code = serializers.CharField()
    count = serializers.IntegerField()


class OperationsAreaRequestGroupSerializer(serializers.Serializer[Any]):
    postal_code = serializers.CharField()
    place = serializers.CharField(allow_null=True)
    state = serializers.CharField(allow_null=True)
    in_pin_list = serializers.BooleanField()
    status = serializers.CharField()  # WAITING, AREA_FULL, READY, DONE, NOT_VALID
    covering_area_id = serializers.UUIDField(allow_null=True)
    covering_area_name = serializers.CharField(allow_null=True)
    request_count = serializers.IntegerField()
    trades = serializers.ListField(child=serializers.CharField())
    trade_counts = OperationsAreaRequestTradeCountSerializer(many=True)
    first_requested_at = serializers.DateTimeField()
    latest_requested_at = serializers.DateTimeField()
    notified_at = serializers.DateTimeField(allow_null=True)
    #: Customers turned away at this PIN over the last 28 days.
    customer_lookups_28d = serializers.IntegerField()


class OperationsAreaRequestNotifyResultSerializer(serializers.Serializer[dict[str, Any]]):
    postal_code = serializers.CharField()
    notified_count = serializers.IntegerField()
    notified_applications = serializers.ListField(child=serializers.DictField())
    #: Approved partners whose area could not be added (no hours to copy, no matching trade).
    skipped_applications = serializers.ListField(child=serializers.DictField(), required=False)


class OperationsAreaRequestDismissSerializer(serializers.Serializer[dict[str, Any]]):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(required=False, allow_blank=True, default="")
    #: Dismiss only this application's request for the PIN (the review screen). Without it, every
    #: partner's open request for the PIN is dismissed (the Area requests screen).
    application_id = serializers.UUIDField(required=False, allow_null=True, default=None)


# --- Partner Add Area ---


class OperationsPartnerAddAreaSerializer(serializers.Serializer[dict[str, Any]]):
    service_area_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True, default="Area opened")


# --- Coverage Lite ---


class OperationsTradeSupplySerializer(serializers.Serializer[dict[str, Any]]):
    skill_code = serializers.CharField()
    skill_name = serializers.CharField()
    target_partners = serializers.IntegerField(allow_null=True)
    alert_below = serializers.IntegerField(allow_null=True)
    approved_partners = serializers.IntegerField()
    flag = serializers.CharField()  # RED, AMBER, GREEN or NONE


class OperationsCoverageLiteAreaSerializer(serializers.Serializer[dict[str, Any]]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    zone = serializers.CharField()
    is_active = serializers.BooleanField()
    is_accepting_partners = serializers.BooleanField()
    postal_codes = serializers.ListField(child=serializers.CharField())
    partner_counts = serializers.DictField(child=serializers.IntegerField())
    partner_trades = serializers.DictField(child=serializers.IntegerField())
    open_asked_pins_count = serializers.IntegerField()
    bookings_28d_count = serializers.IntegerField()
    offer_expiries_28d_count = serializers.IntegerField()
    approved_partners = serializers.IntegerField()
    target_partners = serializers.IntegerField(allow_null=True)
    alert_below = serializers.IntegerField(allow_null=True)
    flag = serializers.CharField()  # RED, AMBER, GREEN or NONE
    trade_targets = OperationsTradeSupplySerializer(many=True)
    turned_away_28d_count = serializers.IntegerField()
    #: Approved partners per week, oldest first; None for a week with no snapshot yet.
    trend = serializers.ListField(child=serializers.IntegerField(allow_null=True))


class OperationsCoverageLiteSummarySerializer(serializers.Serializer[dict[str, Any]]):
    total_areas = serializers.IntegerField()
    total_zones = serializers.IntegerField()
    total_pins = serializers.IntegerField()
    total_partners = serializers.IntegerField()
    total_open_asked_pins = serializers.IntegerField()
    total_bookings_28d = serializers.IntegerField()
    total_offer_expiries_28d = serializers.IntegerField()
    total_turned_away_28d = serializers.IntegerField()
    red_areas = serializers.IntegerField()
    amber_areas = serializers.IntegerField()
    green_areas = serializers.IntegerField()
    trend_weeks = serializers.ListField(child=serializers.DateField())
    trend = serializers.ListField(child=serializers.IntegerField(allow_null=True))


class OperationsCoverageLiteSerializer(serializers.Serializer[dict[str, Any]]):
    summary = OperationsCoverageLiteSummarySerializer()
    areas = OperationsCoverageLiteAreaSerializer(many=True)


# --- Supply targets and recruitment (Phase 2) ---


class OperationsSupplyTargetInputSerializer(serializers.Serializer[dict[str, Any]]):
    #: Empty or zero removes the target.
    target_partners = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    alert_below = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class OperationsTradeSupplyTargetInputSerializer(OperationsSupplyTargetInputSerializer):
    skill_code = serializers.CharField()


class OperationsAreaTargetsUpdateSerializer(serializers.Serializer[dict[str, Any]]):
    overall = OperationsSupplyTargetInputSerializer(required=False, allow_null=True)
    trades = OperationsTradeSupplyTargetInputSerializer(many=True, required=False)


class OperationsAreaOverallSupplySerializer(serializers.Serializer[dict[str, Any]]):
    target_partners = serializers.IntegerField(allow_null=True)
    alert_below = serializers.IntegerField(allow_null=True)
    approved_partners = serializers.IntegerField()
    flag = serializers.CharField()  # RED, AMBER, GREEN or NONE


class OperationsAreaTargetsSerializer(serializers.Serializer[dict[str, Any]]):
    service_area_id = serializers.UUIDField()
    overall = OperationsAreaOverallSupplySerializer()
    trades = OperationsTradeSupplySerializer(many=True)


class OperationsRecruitmentTradeGapSerializer(serializers.Serializer[dict[str, Any]]):
    skill_code = serializers.CharField()
    skill_name = serializers.CharField()
    approved_partners = serializers.IntegerField()
    target_partners = serializers.IntegerField()
    shortfall = serializers.IntegerField()
    flag = serializers.CharField()  # RED or AMBER


class OperationsRecruitmentNeedSerializer(serializers.Serializer[Any]):
    service_area_id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    zone = serializers.CharField()
    flag = serializers.CharField()  # RED or AMBER
    approved_partners = serializers.IntegerField()
    target_partners = serializers.IntegerField(allow_null=True)
    shortfall = serializers.IntegerField()
    trade_gaps = OperationsRecruitmentTradeGapSerializer(many=True)
    open_asked_pins_count = serializers.IntegerField()
    turned_away_28d_count = serializers.IntegerField()
    #: A link to the partner application tagged with the area, so sign-ups can be traced.
    apply_link = serializers.CharField()
