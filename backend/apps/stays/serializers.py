"""Serializers for Stays & Accommodations (A9_STAY)."""

from datetime import date

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import A9VariantConfiguration, ServiceVariant
from apps.commerce.serializers import PaymentAttemptSerializer
from apps.partners.models import PartnerCapability
from apps.stays.models import (
    Property,
    PropertyPolicy,
    PropertyVisitRequest,
    StayCheckIn,
    StayCheckOut,
    StayDeposit,
    StayReservation,
    StayReservationLine,
    Unit,
    UnitPricingOverride,
    UnitPricingRule,
    UnitType,
)


class StayPaymentAttemptsSerializer(serializers.Serializer):
    payment_attempts = PaymentAttemptSerializer(many=True)


class StayHoldCreateSerializer(serializers.Serializer):
    unit_type_id = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    duration_mode = serializers.ChoiceField(
        choices=UnitPricingRule.DurationMode.choices,
        default=UnitPricingRule.DurationMode.MONTHLY,
    )
    guest_count = serializers.IntegerField(default=1, min_value=1, max_value=20)
    lease_duration_months = serializers.IntegerField(default=11, min_value=1, max_value=36)
    primary_tenant_name = serializers.CharField(max_length=160)
    guest_phone = serializers.CharField(max_length=32)
    guest_email = serializers.EmailField()
    emergency_contact_name = serializers.CharField(max_length=160)
    emergency_contact_phone = serializers.CharField(max_length=32)
    agreement_version = serializers.CharField(max_length=40)
    agreement_accepted = serializers.BooleanField()
    kyc_document = serializers.FileField(required=False, write_only=True)

    def validate_agreement_accepted(self, accepted: bool) -> bool:
        if not accepted:
            raise serializers.ValidationError("House rules and tenant agreement must be accepted.")
        return accepted


class StayReservationLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = StayReservationLine
        fields = ("id", "kind", "description", "amount_paise")


class StayDepositSerializer(serializers.ModelSerializer):
    class Meta:
        model = StayDeposit
        fields = (
            "id",
            "status",
            "authorized_amount_paise",
            "consumed_amount_paise",
            "refunded_amount_paise",
            "dispute_reason",
        )


class StayCheckInRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = StayCheckIn
        fields = (
            "id",
            "actual_check_in_time",
            "id_document_type",
            "id_verified",
            "condition_photo_urls",
            "guest_notes",
            "created_at",
        )


class StayCheckOutRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = StayCheckOut
        fields = (
            "id",
            "actual_check_out_time",
            "condition_grade",
            "damage_found",
            "damage_estimate_paise",
            "inspection_notes",
            "condition_photo_urls",
            "created_at",
        )


class StayReservationDetailSerializer(serializers.ModelSerializer):
    lines = StayReservationLineSerializer(many=True, read_only=True)
    deposit = StayDepositSerializer(read_only=True)
    check_in = StayCheckInRecordSerializer(source="check_in_record", read_only=True)
    check_out = StayCheckOutRecordSerializer(source="check_out_record", read_only=True)
    property_id = serializers.UUIDField(source="unit.property.id", read_only=True)
    unit_type_id = serializers.UUIDField(source="unit_type.id", read_only=True)
    unit_id = serializers.UUIDField(source="unit.id", read_only=True)
    customer_id = serializers.UUIDField(source="customer.id", read_only=True)
    property_title = serializers.CharField(source="unit.property.title", read_only=True)
    property_type = serializers.CharField(source="unit.property.property_type", read_only=True)
    property_locality = serializers.CharField(source="unit.property.locality", read_only=True)
    unit_name = serializers.CharField(source="unit_type.name", read_only=True)
    unit_code = serializers.CharField(source="unit.unit_code", read_only=True)
    image_url = serializers.CharField(source="unit_type.image_url", read_only=True)
    host_name = serializers.SerializerMethodField()
    host_phone = serializers.SerializerMethodField()
    host_verified = serializers.SerializerMethodField()
    property_address = serializers.SerializerMethodField()
    check_in_time = serializers.SerializerMethodField()
    check_out_time = serializers.SerializerMethodField()
    receipt_url = serializers.SerializerMethodField()
    guest_name = serializers.SerializerMethodField()
    guest_phone = serializers.SerializerMethodField()
    guest_email = serializers.SerializerMethodField()

    class Meta:
        model = StayReservation
        fields = (
            "id",
            "status",
            "duration_mode",
            "lease_duration_months",
            "start_date",
            "end_date",
            "guest_count",
            "primary_tenant_name",
            "emergency_contact_name",
            "emergency_contact_phone",
            "agreement_version",
            "agreement_accepted_at",
            "total_nights",
            "base_amount_paise",
            "maintenance_amount_paise",
            "deposit_amount_paise",
            "one_time_charges_paise",
            "tax_amount_paise",
            "total_amount_paise",
            "policy_snapshot",
            "property_id",
            "unit_type_id",
            "unit_id",
            "customer_id",
            "guest_name",
            "guest_phone",
            "guest_email",
            "property_title",
            "property_type",
            "property_locality",
            "unit_name",
            "unit_code",
            "image_url",
            "host_name",
            "host_phone",
            "host_verified",
            "property_address",
            "check_in_time",
            "check_out_time",
            "receipt_url",
            "lines",
            "deposit",
            "check_in",
            "check_out",
            "created_at",
        )

    def get_host_name(self, obj: StayReservation) -> str:
        return getattr(obj.unit.property.partner.user, "full_name", "") or "Verified Host"

    def get_host_phone(self, obj: StayReservation) -> str:
        return getattr(obj.unit.property.partner.user, "phone_number", "")

    def get_host_verified(self, obj: StayReservation) -> bool:
        property_obj = obj.unit.property
        application = getattr(property_obj.partner, "application", None)
        return bool(application and application.status == "APPROVED")

    def get_property_address(self, obj: StayReservation) -> dict | None:
        address = getattr(obj.unit.property, "address", None)
        if address is None:
            return None
        return {
            "line1": address.line1,
            "city": address.city,
            "pincode": address.postal_code,
            "latitude": float(address.latitude) if address.latitude is not None else None,
            "longitude": float(address.longitude) if address.longitude is not None else None,
        }

    def get_check_in_time(self, obj: StayReservation) -> str:
        return str(obj.policy_snapshot.get("check_in_time", ""))

    def get_check_out_time(self, obj: StayReservation) -> str:
        return str(obj.policy_snapshot.get("check_out_time", ""))

    def get_receipt_url(self, obj: StayReservation) -> str | None:
        if obj.status in (
            StayReservation.Status.HELD,
            StayReservation.Status.PAYMENT_PENDING,
            StayReservation.Status.EXPIRED,
            StayReservation.Status.FAILED,
        ):
            return None
        if obj.status == StayReservation.Status.CANCELLED:
            has_captured = obj.lines.filter(
                payment_allocations__payment_attempt__status="CAPTURED"
            ).exists()
            if not has_captured:
                return None
        return f"/api/v1/stays/reservations/{obj.id}/receipt/"

    def get_guest_name(self, obj: StayReservation) -> str:
        if obj.primary_tenant_name:
            return obj.primary_tenant_name
        customer = getattr(obj, "customer", None)
        if not customer:
            return "Guest"
        return getattr(customer, "full_name", "") or getattr(customer, "phone_number", "Guest")

    def get_guest_phone(self, obj: StayReservation) -> str:
        if obj.guest_phone_snapshot:
            return obj.guest_phone_snapshot
        customer = getattr(obj, "customer", None)
        return getattr(customer, "phone_number", "") if customer else ""

    def get_guest_email(self, obj: StayReservation) -> str:
        if obj.guest_email_snapshot:
            return obj.guest_email_snapshot
        customer = getattr(obj, "customer", None)
        return getattr(customer, "email", "") if customer else ""


class PartnerCheckInSerializer(serializers.Serializer):
    id_document_type = serializers.ChoiceField(
        choices=StayCheckIn.IdDocumentType.choices,
        default=StayCheckIn.IdDocumentType.AADHAAR,
    )
    id_document_number = serializers.CharField(
        max_length=80, required=False, allow_blank=True, write_only=True
    )
    guest_notes = serializers.CharField(required=False, allow_blank=True)
    condition_photo_urls = serializers.ListField(
        child=serializers.URLField(), required=False, default=list
    )


class PartnerCheckOutSerializer(serializers.Serializer):
    condition_grade = serializers.ChoiceField(
        choices=StayCheckOut.ConditionGrade.choices,
        default=StayCheckOut.ConditionGrade.EXCELLENT,
    )
    damage_found = serializers.BooleanField(default=False)
    damage_estimate_paise = serializers.IntegerField(default=0, min_value=0)
    inspection_notes = serializers.CharField(required=False, allow_blank=True)
    condition_photo_urls = serializers.ListField(
        child=serializers.URLField(), required=False, default=list
    )


class PartnerReassignUnitSerializer(serializers.Serializer):
    target_unit_id = serializers.UUIDField()


class PartnerPropertyCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = (
            "id",
            "title",
            "property_type",
            "occupancy_model",
            "description",
            "locality",
            "is_active",
        )
        # occupancy_model is derived server-side from property_type (Property.save()) --
        # never a host-writable field, so a host can only change it by re-selecting
        # property_type. See plan SS3.1.
        read_only_fields = ("occupancy_model",)


class PartnerPropertyPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyPolicy
        fields = (
            "version",
            "effective_from",
            "effective_to",
            "is_active",
            "check_in_time",
            "check_out_time",
            "max_guests_per_unit",
            "id_verification_required",
            "cancellation_policy",
            "notice_period_days",
            "no_show_grace_minutes",
            "no_show_first_night_charge_basis_points",
            "no_show_deposit_forfeit_basis_points",
            "house_rules",
        )
        read_only_fields = ("version", "effective_from", "effective_to", "is_active")


class StayCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, default="Customer requested cancellation")


class StayExtensionRequestSerializer(serializers.Serializer):
    additional_nights = serializers.IntegerField(default=0, min_value=0)
    additional_months = serializers.IntegerField(default=0, min_value=0)
    additional_deposit_paise = serializers.IntegerField(
        required=False, allow_null=True, min_value=0
    )


class PartnerBlockUnitSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, default="Host maintenance block")


class StayEarlyCheckoutSerializer(serializers.Serializer):
    early_checkout_date = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, default="Early departure")


class StayDisputeSerializer(serializers.Serializer):
    dispute_reason = serializers.CharField(required=True, min_length=5)


class OpsStayReassignSerializer(serializers.Serializer):
    target_unit_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, default="Operations emergency reassignment")


class OpsStayResolveDisputeSerializer(serializers.Serializer):
    final_consumed_amount_paise = serializers.IntegerField(min_value=0)
    resolution_notes = serializers.CharField(required=True)


class PartnerUnitTypeCreateSerializer(serializers.ModelSerializer):
    variant_id = serializers.PrimaryKeyRelatedField(
        source="variant",
        queryset=ServiceVariant.objects.filter(
            booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
            is_active=True,
        ),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = UnitType
        fields = (
            "id",
            "variant_id",
            "name",
            "description",
            "sharing_type",
            "sharing_count",
            "is_ac",
            "bathroom_type",
            "furnishing_status",
            "food_included",
            "bhk",
            "occupancy_capacity",
            "room_class",
            "bathrooms",
            "built_up_sqft",
            "facing",
            "floor",
            "amenities",
            "image_url",
            "is_active",
        )

    def validate(self, attrs: dict) -> dict:
        # SS3.2 pairing rule (mirrors UnitType.clean(), which plain ModelSerializer.save()
        # never calls) -- enforce it here too so the API rejects a mismatched payload
        # instead of silently persisting a UnitType that only a manual full_clean() would
        # catch. Uses the property passed in via context (create) or the existing
        # instance's property (partial update).
        property_obj = self.context.get("property") or getattr(self.instance, "property", None)
        if property_obj is not None:
            sharing_type = attrs.get("sharing_type", getattr(self.instance, "sharing_type", ""))
            occupancy_capacity = attrs.get(
                "occupancy_capacity", getattr(self.instance, "occupancy_capacity", None)
            )
            room_class = attrs.get("room_class", getattr(self.instance, "room_class", None))
            if property_obj.occupancy_model == Property.OccupancyModel.SHARED and not sharing_type:
                raise serializers.ValidationError(
                    {"sharing_type": "sharing_type is required for shared-occupancy properties"}
                )
            if (
                property_obj.occupancy_model
                in (Property.OccupancyModel.ENTIRE_UNIT, Property.OccupancyModel.HOTEL_ROOM)
                and not occupancy_capacity
            ):
                raise serializers.ValidationError(
                    {
                        "occupancy_capacity": (
                            "occupancy_capacity is required for entire-unit and hotel-room "
                            "properties"
                        )
                    }
                )
            if property_obj.occupancy_model == Property.OccupancyModel.HOTEL_ROOM and not room_class:
                raise serializers.ValidationError(
                    {"room_class": "room_class is required for hotel-room properties"}
                )

        variant = attrs.get("variant") or getattr(self.instance, "variant", None)
        partner = self.context.get("partner")
        if variant is None and partner is not None:
            cap = (
                PartnerCapability.objects.filter(
                    partner=partner,
                    archetype=ServiceVariant.BookingArchetype.A9_STAY,
                    status=PartnerCapability.Status.APPROVED,
                )
                .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
                .first()
            )
            if cap:
                variant = cap.variant
                attrs["variant"] = variant

        if variant is None:
            fallback_var = ServiceVariant.objects.filter(
                booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
                is_active=True,
            ).first()
            if fallback_var:
                variant = fallback_var
                attrs["variant"] = fallback_var

        if variant is None:
            raise serializers.ValidationError({"variant_id": "A stay variant is required."})
        if not A9VariantConfiguration.objects.filter(
            variant=variant,
            status=A9VariantConfiguration.Status.ACTIVE,
        ).exists():
            raise serializers.ValidationError(
                {"variant_id": "No active A9 policy is configured for this stay type."}
            )
        partner = self.context.get("partner")
        if partner is not None and not (
            PartnerCapability.objects.filter(
                partner=partner,
                variant=variant,
                archetype=ServiceVariant.BookingArchetype.A9_STAY,
                status=PartnerCapability.Status.APPROVED,
            )
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
            .exists()
        ):
            raise serializers.ValidationError(
                {"variant_id": "This stay type is not approved for your workspace."}
            )
        return attrs


class PartnerUnitPricingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitPricingRule
        fields = (
            "id",
            "duration_mode",
            "base_rate_paise",
            "deposit_paise",
            "maintenance_paise",
            "effective_from",
            "effective_to",
            "is_active",
        )
        read_only_fields = ("id",)

    def validate(self, attrs: dict) -> dict:
        start = (
            attrs.get("effective_from")
            or getattr(self.instance, "effective_from", None)
            or timezone.localdate()
        )
        end = attrs.get("effective_to")
        if end is None and self.instance is not None:
            end = self.instance.effective_to
        if start and end and end < start:
            raise serializers.ValidationError(
                {"effective_to": "The end date cannot be earlier than the start date."}
            )
        unit_type = self.context.get("unit_type")
        if unit_type is not None and start is not None:
            overlap_end = end or date.max
            conflicts = UnitPricingRule.objects.filter(
                unit_type=unit_type,
                duration_mode=attrs.get(
                    "duration_mode", getattr(self.instance, "duration_mode", None)
                ),
                effective_from__lte=overlap_end,
            ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=start))
            if self.instance is not None:
                conflicts = conflicts.exclude(id=self.instance.id)
            if conflicts.exists():
                raise serializers.ValidationError(
                    "An effective pricing rule already covers part of this period."
                )
        return attrs


class PartnerUnitPricingOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitPricingOverride
        fields = ("id", "date", "rate_paise", "reason")
        read_only_fields = ("id",)

    def validate(self, attrs: dict) -> dict:
        rule = self.context.get("pricing_rule")
        if rule is None:
            return attrs
        if rule.duration_mode != UnitPricingRule.DurationMode.NIGHTLY:
            raise serializers.ValidationError(
                "Date-specific overrides are supported only for NIGHTLY pricing."
            )
        override_date = attrs.get("date") or getattr(self.instance, "date", None)
        if override_date and (
            override_date < rule.effective_from
            or (rule.effective_to is not None and override_date > rule.effective_to)
        ):
            raise serializers.ValidationError(
                {"date": "The override date must be inside the pricing rule's effective period."}
            )
        return attrs


class PartnerUnitCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = (
            "id",
            "unit_type",
            "unit_code",
            "floor",
            "current_status",
        )

    def validate_unit_type(self, unit_type: UnitType) -> UnitType:
        prop = self.context.get("property")
        if prop is not None and unit_type.property_id != prop.id:
            raise serializers.ValidationError("The unit type must belong to this property.")
        return unit_type


class PropertyVisitRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyVisitRequest
        fields = (
            "id",
            "property",
            "visitor_name",
            "visitor_phone",
            "visitor_email",
            "preferred_date",
            "time_slot",
            "notes",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "property", "status", "created_at")

    def validate_preferred_date(self, value: date) -> date:
        if value < timezone.localdate():
            raise serializers.ValidationError("Preferred visit date cannot be in the past.")
        return value
