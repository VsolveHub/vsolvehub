from decimal import Decimal
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.rides.models import CaptainVehicle, FareQuote, VehicleType
from apps.rides.selectors import CaptainStatus

__all__ = [
    "CaptainStatusSerializer",
    "CaptainVehicleSerializer",
    "CaptainVehicleWriteSerializer",
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


class CaptainStatusSerializer(serializers.Serializer[CaptainStatus]):
    approval = serializers.CharField(
        help_text="The application status, or NOT_STARTED before a captain application exists."
    )
    is_approved = serializers.BooleanField()
    vehicle = serializers.SerializerMethodField()
    blocked_reasons = serializers.ListField(child=serializers.CharField())

    @extend_schema_field(CaptainVehicleSerializer(allow_null=True))
    def get_vehicle(self, obj: CaptainStatus) -> dict[str, Any] | None:
        if obj.vehicle is None:
            return None
        return dict(CaptainVehicleSerializer(obj.vehicle).data)


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
