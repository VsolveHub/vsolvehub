from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.rides.models import CaptainVehicle, VehicleType
from apps.rides.selectors import CaptainStatus

__all__ = ["CaptainStatusSerializer", "CaptainVehicleSerializer", "CaptainVehicleWriteSerializer"]


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
