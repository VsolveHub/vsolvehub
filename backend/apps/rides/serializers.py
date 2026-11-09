from decimal import Decimal
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.rides.models import (
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    VehicleType,
)
from apps.rides.selectors import CaptainStatus

__all__ = [
    "BuyPassSerializer",
    "CaptainPassPlanSerializer",
    "CaptainPassSerializer",
    "CaptainStatusSerializer",
    "CaptainVehicleSerializer",
    "CaptainVehicleWriteSerializer",
    "DutyStatusSerializer",
    "FareQuoteListSerializer",
    "FareQuoteRequestSerializer",
    "FareQuoteSerializer",
]


class CaptainVehicleSerializer(serializers.ModelSerializer[CaptainVehicle]):
    class Meta:
        model = CaptainVehicle
        fields = ("vehicle_type", "registration_number", "make_model", "colour")
        read_only_fields = fields


class CaptainVehicleWriteSerializer(serializers.Serializer[Any]):
    vehicle_type = serializers.ChoiceField(choices=VehicleType.choices)
    registration_number = serializers.CharField(max_length=16)
    make_model = serializers.CharField(max_length=120)
    colour = serializers.CharField(max_length=40)

    def validate_registration_number(self, value: str) -> str:
        if not "".join(value.split()):
            raise serializers.ValidationError("Enter the vehicle registration number.")
        return value


class CaptainPassPlanSerializer(serializers.ModelSerializer[CaptainPassPlan]):
    class Meta:
        model = CaptainPassPlan
        fields = ("id", "code", "name", "price_paise", "duration_hours")
        read_only_fields = fields


class CaptainPassSerializer(serializers.ModelSerializer[CaptainPass]):
    plan = CaptainPassPlanSerializer(read_only=True)
    # A plain string on purpose: these four values are exactly the vendor subscription's, and an
    # enum here makes the schema generator merge and rename that existing enum.
    status = serializers.CharField(
        read_only=True, help_text="PENDING_ACTIVATION, ACTIVE, EXPIRED or CANCELLED."
    )
    payment_attempt_id = serializers.UUIDField(
        read_only=True,
        allow_null=True,
        help_text=(
            "For a paid plan: read GET /payment-attempts/{id}/ for the Razorpay order "
            "and pay it. Null for a free plan, which is active at once."
        ),
    )

    class Meta:
        model = CaptainPass
        fields = (
            "id",
            "plan",
            "status",
            "starts_at",
            "ends_at",
            "payment_attempt_id",
            "created_at",
        )
        read_only_fields = fields


class BuyPassSerializer(serializers.Serializer[Any]):
    plan_id = serializers.UUIDField()


class DutyStatusSerializer(serializers.Serializer[Any]):
    on_duty = serializers.BooleanField()
    started_at = serializers.DateTimeField(allow_null=True)

    @staticmethod
    def of(session: CaptainDutySession | None) -> dict[str, Any]:
        return {
            "on_duty": session is not None,
            "started_at": session.started_at if session else None,
        }


class CaptainStatusSerializer(serializers.Serializer[CaptainStatus]):
    approval = serializers.CharField(
        help_text="The application status, or NOT_STARTED before a captain application exists."
    )
    is_approved = serializers.BooleanField()
    vehicle = serializers.SerializerMethodField()
    active_pass = serializers.SerializerMethodField()
    on_duty = serializers.BooleanField()
    duty_started_at = serializers.DateTimeField(allow_null=True)
    blocked_reasons = serializers.ListField(
        child=serializers.CharField(),
        help_text=(
            "Why duty cannot start, in display order: suspended or not_approved, "
            "vehicle_missing, pass_required. Empty when the captain can go on duty."
        ),
    )

    @extend_schema_field(CaptainVehicleSerializer(allow_null=True))
    def get_vehicle(self, obj: CaptainStatus) -> dict[str, Any] | None:
        if obj.vehicle is None:
            return None
        return dict(CaptainVehicleSerializer(obj.vehicle).data)

    @extend_schema_field(CaptainPassSerializer(allow_null=True))
    def get_active_pass(self, obj: CaptainStatus) -> dict[str, Any] | None:
        if obj.active_pass is None:
            return None
        return dict(CaptainPassSerializer(obj.active_pass).data)


class TripPointSerializer(serializers.Serializer[Any]):
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=Decimal(-90), max_value=Decimal(90)
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=Decimal(-180), max_value=Decimal(180)
    )
    # Not `label`: that name is the serializer field's own display label in DRF.
    address = serializers.CharField(max_length=255, help_text="The address the rider sees.")


class FareQuoteRequestSerializer(serializers.Serializer[Any]):
    pickup = TripPointSerializer()
    drop = TripPointSerializer()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        pickup, drop = attrs["pickup"], attrs["drop"]
        if (pickup["latitude"], pickup["longitude"]) == (drop["latitude"], drop["longitude"]):
            raise serializers.ValidationError({"drop": "Choose a drop that isn't your pickup."})
        return attrs


class FareQuoteSerializer(serializers.ModelSerializer[FareQuote]):
    class Meta:
        model = FareQuote
        fields = (
            "id",
            "vehicle_type",
            "fare_paise",
            "distance_m",
            "duration_s",
            "route_polyline",
            "expires_at",
        )
        read_only_fields = fields


class FareQuoteListSerializer(serializers.Serializer[Any]):
    quotes = FareQuoteSerializer(
        many=True, help_text="Bike, then auto, then cab; only the bookable ones."
    )
