from decimal import Decimal
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.models import PartnerProfile
from apps.partners.photos import partner_photo_url
from apps.rides.models import (
    RATE_FIELDS,
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    Ride,
    RideOffer,
    RideRateCard,
    RideState,
    VehicleType,
)
from apps.rides.selectors import CaptainStatus

__all__ = [
    "BuyPassSerializer",
    "CaptainPassPlanOpsSerializer",
    "CaptainPassPlanSerializer",
    "CaptainPassSerializer",
    "CaptainRideSerializer",
    "CaptainStatusSerializer",
    "CaptainVehicleSerializer",
    "CaptainVehicleWriteSerializer",
    "CurrentOfferSerializer",
    "DutyStatusSerializer",
    "FareQuoteListSerializer",
    "FareQuoteRequestSerializer",
    "FareQuoteSerializer",
    "LocationPingSerializer",
    "RateCardCreateSerializer",
    "RateCardUpdateSerializer",
    "RideCaptainSerializer",
    "RideCreateSerializer",
    "RideOfferSerializer",
    "RidePlaceSerializer",
    "RideRateCardSerializer",
    "RideRiderSerializer",
    "RideSerializer",
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
        read_only=True,
        help_text=(
            "PENDING_ACTIVATION, QUEUED (paid; starts when the active pass ends), ACTIVE, "
            "EXPIRED or CANCELLED."
        ),
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


SERVER_NOW_HELP = (
    "The server's clock. The app keeps its offset from the phone's clock and sends location "
    "captured_at in server time (brief §5.6)."
)


class DutyStatusSerializer(serializers.Serializer[Any]):
    on_duty = serializers.BooleanField()
    started_at = serializers.DateTimeField(allow_null=True)
    server_now = serializers.DateTimeField(help_text=SERVER_NOW_HELP)

    @staticmethod
    def of(session: CaptainDutySession | None) -> dict[str, Any]:
        return {
            "on_duty": session is not None,
            "started_at": session.started_at if session else None,
            "server_now": timezone.now(),
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

    queued_pass = serializers.SerializerMethodField()
    server_now = serializers.DateTimeField(help_text=SERVER_NOW_HELP)

    @extend_schema_field(CaptainPassSerializer(allow_null=True))
    def get_active_pass(self, obj: CaptainStatus) -> dict[str, Any] | None:
        if obj.active_pass is None:
            return None
        return dict(CaptainPassSerializer(obj.active_pass).data)

    @extend_schema_field(CaptainPassSerializer(allow_null=True))
    def get_queued_pass(self, obj: CaptainStatus) -> dict[str, Any] | None:
        if obj.queued_pass is None:
            return None
        return dict(CaptainPassSerializer(obj.queued_pass).data)


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


class RideCreateSerializer(serializers.Serializer[Any]):
    quote_id = serializers.UUIDField(help_text="One of the rider's quotes from POST rides/quotes/.")


class RidePlaceSerializer(serializers.Serializer[Any]):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    address = serializers.CharField()


#: While the ride is in these states each side sees the other's phone number (brief §5.4).
PHONE_VISIBLE_STATES = (
    RideState.CAPTAIN_ASSIGNED,
    RideState.CAPTAIN_ARRIVED,
    RideState.IN_TRIP,
)


def _pickup(ride: Ride) -> dict[str, Any]:
    return {
        "latitude": ride.pickup_latitude,
        "longitude": ride.pickup_longitude,
        "address": ride.pickup_label,
    }


def _drop(ride: Ride) -> dict[str, Any]:
    return {
        "latitude": ride.drop_latitude,
        "longitude": ride.drop_longitude,
        "address": ride.drop_label,
    }


class RideCaptainSerializer(serializers.Serializer[Any]):
    """Who is coming: what the rider sees once a captain accepts."""

    name = serializers.CharField(source="display_name")
    photo_url = serializers.SerializerMethodField()
    phone_number = serializers.SerializerMethodField(
        help_text="Only while the captain is on the way, at the pickup or in the trip."
    )
    vehicle = CaptainVehicleSerializer(source="ride_vehicle")

    def get_photo_url(self, obj: PartnerProfile) -> str | None:
        return partner_photo_url(obj)

    def get_phone_number(self, obj: PartnerProfile) -> str | None:
        ride: Ride = self.context["ride"]
        return str(obj.user.phone_number) if ride.state in PHONE_VISIBLE_STATES else None


class RideRiderSerializer(serializers.Serializer[Any]):
    """Who to pick up: what the captain sees once they accept."""

    name = serializers.CharField(source="full_name")
    phone_number = serializers.SerializerMethodField(
        help_text="Only while the captain is on the way, at the pickup or in the trip."
    )

    def get_phone_number(self, obj: Any) -> str | None:
        ride: Ride = self.context["ride"]
        return str(obj.phone_number) if ride.state in PHONE_VISIBLE_STATES else None


class _RideBaseSerializer(serializers.ModelSerializer[Ride]):
    pickup = serializers.SerializerMethodField()
    drop = serializers.SerializerMethodField()
    route_polyline = serializers.CharField(source="quote.route_polyline", read_only=True)

    class Meta:
        model = Ride
        fields: tuple[str, ...] = (
            "id",
            "state",
            "vehicle_type",
            "pickup",
            "drop",
            "route_polyline",
            "fare_paise",
            "waiting_paise",
            "final_fare_paise",
            "payment_method",
            "payment_status",
            "created_at",
        )
        read_only_fields = fields

    @extend_schema_field(RidePlaceSerializer)
    def get_pickup(self, obj: Ride) -> dict[str, Any]:
        return _pickup(obj)

    @extend_schema_field(RidePlaceSerializer)
    def get_drop(self, obj: Ride) -> dict[str, Any]:
        return _drop(obj)


class RideSerializer(_RideBaseSerializer):
    """The rider's view of one ride."""

    captain = serializers.SerializerMethodField()

    class Meta(_RideBaseSerializer.Meta):
        fields = (*_RideBaseSerializer.Meta.fields, "captain")
        read_only_fields = fields

    @extend_schema_field(RideCaptainSerializer(allow_null=True))
    def get_captain(self, obj: Ride) -> dict[str, Any] | None:
        if obj.captain is None:
            return None
        return dict(RideCaptainSerializer(obj.captain, context={"ride": obj}).data)


class CaptainRideSerializer(_RideBaseSerializer):
    """The captain's view of the ride they are doing."""

    rider = serializers.SerializerMethodField()

    class Meta(_RideBaseSerializer.Meta):
        fields = (*_RideBaseSerializer.Meta.fields, "rider")
        read_only_fields = fields

    @extend_schema_field(RideRiderSerializer)
    def get_rider(self, obj: Ride) -> dict[str, Any]:
        return dict(RideRiderSerializer(obj.rider, context={"ride": obj}).data)


class RideOfferSerializer(serializers.ModelSerializer[RideOffer]):
    """A ride request on the captain's screen, with the server's deadline."""

    ride_id = serializers.UUIDField(read_only=True)
    vehicle_type = serializers.CharField(source="ride.vehicle_type", read_only=True)
    pickup = serializers.SerializerMethodField()
    drop = serializers.SerializerMethodField()
    fare_paise = serializers.IntegerField(source="ride.fare_paise", read_only=True)
    trip_distance_m = serializers.IntegerField(source="ride.quote.distance_m", read_only=True)
    trip_duration_s = serializers.IntegerField(source="ride.quote.duration_s", read_only=True)

    class Meta:
        model = RideOffer
        fields = (
            "id",
            "ride_id",
            "vehicle_type",
            "pickup",
            "drop",
            "pickup_distance_m",
            "fare_paise",
            "trip_distance_m",
            "trip_duration_s",
            "offered_at",
            "expires_at",
        )
        read_only_fields = fields

    @extend_schema_field(RidePlaceSerializer)
    def get_pickup(self, obj: RideOffer) -> dict[str, Any]:
        return _pickup(obj.ride)

    @extend_schema_field(RidePlaceSerializer)
    def get_drop(self, obj: RideOffer) -> dict[str, Any]:
        return _drop(obj.ride)


class CurrentOfferSerializer(serializers.Serializer[Any]):
    offer = RideOfferSerializer(allow_null=True)
    server_now = serializers.DateTimeField(
        help_text="The server's clock, so the countdown is right even if the phone's clock is off."
    )


def _six_places(value: float) -> Decimal:
    return Decimal(str(round(value, 6)))


class LocationPingSerializer(serializers.Serializer[Any]):
    """One GPS reading. Phones send plain numbers; they are kept to 6 decimal places (~0.1 m)."""

    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(help_text="Metres; must be above 0.")
    heading = serializers.FloatField(
        min_value=0, max_value=360, required=False, allow_null=True, default=None
    )
    captured_at = serializers.DateTimeField(help_text="When the phone took the reading.")

    def validate_accuracy_m(self, value: float) -> int:
        if value <= 0:
            raise serializers.ValidationError("Accuracy must be above 0.")
        return max(1, round(value))

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs["latitude"] = _six_places(attrs["latitude"])
        attrs["longitude"] = _six_places(attrs["longitude"])
        return attrs


class RideRateCardSerializer(serializers.ModelSerializer[RideRateCard]):
    service_area_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = RideRateCard
        fields = (
            "id",
            "service_area_id",
            "vehicle_type",
            *RATE_FIELDS,
            "is_active",
            "version",
            "created_at",
        )
        read_only_fields = fields


def _amount(*, required: bool) -> serializers.IntegerField:
    """Paise, metres or minutes: a whole number, never negative."""
    return serializers.IntegerField(min_value=0, required=required)


class RateCardCreateSerializer(serializers.Serializer[Any]):
    service_area_id = serializers.UUIDField()
    vehicle_type = serializers.ChoiceField(choices=VehicleType.choices)
    base_fare_paise = _amount(required=True)
    included_distance_m = _amount(required=True)
    per_km_paise = _amount(required=True)
    per_minute_paise = _amount(required=True)
    minimum_fare_paise = _amount(required=True)
    free_waiting_minutes = _amount(required=True)
    waiting_per_minute_paise = _amount(required=True)


class RateCardUpdateSerializer(serializers.Serializer[Any]):
    """Change prices (a new version), or send only `is_active: false` to switch the vehicle off."""

    is_active = serializers.BooleanField(required=False)
    base_fare_paise = _amount(required=False)
    included_distance_m = _amount(required=False)
    per_km_paise = _amount(required=False)
    per_minute_paise = _amount(required=False)
    minimum_fare_paise = _amount(required=False)
    free_waiting_minutes = _amount(required=False)
    waiting_per_minute_paise = _amount(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        rates = {k: v for k, v in attrs.items() if k in RATE_FIELDS}
        if attrs.get("is_active") is False and rates:
            raise serializers.ValidationError(
                "Switch the card off on its own, without price changes."
            )
        if attrs.get("is_active") is not False and not rates:
            raise serializers.ValidationError("Send at least one price to change.")
        return attrs


class CaptainPassPlanOpsSerializer(serializers.ModelSerializer[CaptainPassPlan]):
    """Operations' view of a plan. `code` is fixed once created."""

    class Meta:
        model = CaptainPassPlan
        fields = ("id", "code", "name", "price_paise", "duration_hours", "is_active", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_duration_hours(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("A pass lasts at least an hour.")
        return value

    def validate_code(self, value: str) -> str:
        if self.instance is not None and value != self.instance.code:
            raise serializers.ValidationError("A plan's code can't change.")
        return value


class FareQuoteListSerializer(serializers.Serializer[Any]):
    quotes = FareQuoteSerializer(
        many=True, help_text="Bike, then auto, then cab; only the bookable ones."
    )
