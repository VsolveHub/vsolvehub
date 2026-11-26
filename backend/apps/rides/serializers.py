import re
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.partners.models import PartnerProfile
from apps.partners.photos import partner_photo_url
from apps.rides.engine import (
    CAPTAIN_CANCEL_REASONS,
    DELIVERY_PIN_VISIBLE_STATES,
    OTP_VISIBLE_STATES,
    RIDER_CANCEL_REASONS,
    parcel_delivery_pin,
    receiver_unavailable_allowed_at,
    ride_otp,
    searching_again,
)
from apps.rides.models import (
    OPEN_RIDE_STATES,
    PARCEL_LIMIT_FIELDS,
    RATE_FIELDS,
    ActorKind,
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    CaptainVehicle,
    FareQuote,
    ParcelDetails,
    Ride,
    RideKind,
    RideOffer,
    RideRateCard,
    RideSosEvent,
    RideState,
    VehicleType,
)
from apps.rides.selectors import (
    EARNINGS_PERIODS,
    CaptainLive,
    CaptainStatus,
    captain_live,
    captain_rating,
)

__all__ = [
    "AvailabilityQuerySerializer",
    "AvailabilitySerializer",
    "BuyPassSerializer",
    "CaptainCancelSerializer",
    "CaptainCurrentRideSerializer",
    "CaptainPassPlanOpsSerializer",
    "CaptainPassPlanSerializer",
    "CaptainPassSerializer",
    "CaptainPositionSerializer",
    "CaptainRideSerializer",
    "CaptainStatusSerializer",
    "CaptainVehicleSerializer",
    "CaptainVehicleWriteSerializer",
    "CurrentOfferSerializer",
    "DutyStatusSerializer",
    "EarningsQuerySerializer",
    "EarningsSerializer",
    "FareQuoteListSerializer",
    "FareQuoteRequestSerializer",
    "FareQuoteSerializer",
    "LastDutyEndSerializer",
    "LocationPingSerializer",
    "OperationsCancelSerializer",
    "OpsCaptainSerializer",
    "OpsOfferSerializer",
    "OpsPersonSerializer",
    "OpsRideDetailSerializer",
    "OpsRideRowSerializer",
    "OpsSosSerializer",
    "OpsTransitionSerializer",
    "ParcelContactSerializer",
    "ParcelEndSerializer",
    "ParcelLimitsSerializer",
    "ParcelRequestSerializer",
    "ParcelRulesSerializer",
    "ParcelSerializer",
    "RateCardCreateSerializer",
    "RateCardUpdateSerializer",
    "RatingSerializer",
    "RideCaptainSerializer",
    "RideCreateSerializer",
    "RideHistorySerializer",
    "RideOfferSerializer",
    "RidePlaceSerializer",
    "RideRateCardSerializer",
    "RideRiderSerializer",
    "RideSerializer",
    "RiderCancelSerializer",
    "SosRequestSerializer",
    "SosResolveSerializer",
    "SosSerializer",
    "StartTripSerializer",
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


class ParcelPreferenceSerializer(serializers.Serializer[Any]):
    takes_parcels = serializers.BooleanField()


class CaptainPassPlanSerializer(serializers.ModelSerializer[CaptainPassPlan]):
    class Meta:
        model = CaptainPassPlan
        fields = ("id", "code", "name", "price_paise", "duration_hours", "max_trips")
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


class LastDutyEndSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(
        source="end_reason",
        help_text="CAPTAIN_OFF, LOCATION_STALE, PASS_EXPIRED, SUSPENDED or OPERATIONS.",
    )
    ended_at = serializers.DateTimeField()


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

    takes_parcels = serializers.SerializerMethodField(
        help_text="The Take parcel orders switch. Always false for a cab or with no vehicle."
    )
    queued_pass = serializers.SerializerMethodField()
    server_now = serializers.DateTimeField(help_text=SERVER_NOW_HELP)
    last_duty_end = LastDutyEndSerializer(
        allow_null=True,
        help_text="While off duty: why and when the last duty ended, so the app can explain it.",
    )

    def get_takes_parcels(self, obj: CaptainStatus) -> bool:
        vehicle = obj.vehicle
        return (
            vehicle is not None
            and vehicle.vehicle_type != VehicleType.CAB
            and vehicle.takes_parcels
        )

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


class AvailabilityQuerySerializer(serializers.Serializer[Any]):
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=Decimal(-90), max_value=Decimal(90)
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=Decimal(-180), max_value=Decimal(180)
    )


class ParcelLimitsSerializer(serializers.Serializer[Any]):
    vehicle_type = serializers.ChoiceField(choices=VehicleType.choices)
    max_weight_grams = serializers.IntegerField()
    size_label = serializers.CharField()


class ParcelRulesSerializer(serializers.Serializer[Any]):
    value_cap_paise = serializers.IntegerField()
    prohibited_items = serializers.ListField(child=serializers.CharField())


class AvailabilitySerializer(serializers.Serializer[Any]):
    vehicle_types = serializers.ListField(
        child=serializers.ChoiceField(choices=VehicleType.choices),
        help_text="Bookable here, cheapest first. Empty: hide the Rides entry.",
    )
    parcel = ParcelLimitsSerializer(
        many=True,
        help_text="Pick up & Drop vehicles bookable here, with limits. Empty: hide the entry.",
    )
    parcel_rules = ParcelRulesSerializer()


class FareQuoteRequestSerializer(serializers.Serializer[Any]):
    pickup = TripPointSerializer()
    drop = TripPointSerializer()
    kind = serializers.ChoiceField(
        choices=RideKind.choices, default=RideKind.RIDE, help_text="PARCEL for Pick up & Drop."
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        pickup, drop = attrs["pickup"], attrs["drop"]
        if (pickup["latitude"], pickup["longitude"]) == (drop["latitude"], drop["longitude"]):
            raise serializers.ValidationError({"drop": "Choose a drop that isn't your pickup."})
        return attrs


class FareQuoteSerializer(serializers.ModelSerializer[FareQuote]):
    max_weight_grams = serializers.IntegerField(
        source="rate_card.max_parcel_weight_grams",
        read_only=True,
        allow_null=True,
        help_text="Parcel quotes only; null for a ride.",
    )
    size_label = serializers.CharField(
        source="rate_card.parcel_size_label",
        read_only=True,
        help_text="Parcel quotes only; empty for a ride.",
    )

    class Meta:
        model = FareQuote
        fields = (
            "id",
            "kind",
            "max_weight_grams",
            "size_label",
            "vehicle_type",
            "fare_paise",
            "distance_m",
            "duration_s",
            "route_polyline",
            "expires_at",
        )
        read_only_fields = fields


_MOBILE = re.compile(r"[6-9]\d{9}")


class ParcelEndSerializer(serializers.Serializer[Any]):
    """One end of a parcel: who is there and how to meet them.

    A missing name or phone is a 422 from the booking (`parcel_details_required`), not a 400, so
    the app can send the customer back to the details screen. A malformed phone is a 400.
    """

    name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    phone = serializers.CharField(
        required=False, allow_blank=True, help_text="A 10-digit Indian mobile number, without +91."
    )
    building = serializers.CharField(max_length=120, required=False, allow_blank=True)
    unit = serializers.CharField(max_length=60, required=False, allow_blank=True)
    meet_at = serializers.ChoiceField(choices=ParcelDetails.MeetAt.choices)
    instructions = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate_phone(self, value: str) -> str:
        if value and not _MOBILE.fullmatch(value):
            raise serializers.ValidationError("Enter a 10-digit mobile number.")
        return value


class ParcelContactSerializer(serializers.Serializer[Any]):
    """One end of a parcel as the server sends it back: every field is always there."""

    name = serializers.CharField()
    phone = serializers.CharField(help_text="A 10-digit Indian mobile number, without +91.")
    building = serializers.CharField(allow_blank=True)
    unit = serializers.CharField(allow_blank=True)
    meet_at = serializers.ChoiceField(choices=ParcelDetails.MeetAt.choices)
    instructions = serializers.CharField(allow_blank=True)


class ParcelRequestSerializer(serializers.Serializer[Any]):
    mode = serializers.ChoiceField(choices=ParcelDetails.Mode.choices)
    payer = serializers.ChoiceField(choices=ParcelDetails.Payer.choices)
    pin_required = serializers.BooleanField()
    pickup = ParcelEndSerializer()
    drop = ParcelEndSerializer()


class RideCreateSerializer(serializers.Serializer[Any]):
    quote_id = serializers.UUIDField(help_text="One of the rider's quotes from POST rides/quotes/.")
    parcel = ParcelRequestSerializer(
        required=False, help_text="Required when the quote is a Pick up & Drop quote."
    )


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


class CaptainPositionSerializer(serializers.Serializer[Any]):
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    heading = serializers.FloatField(allow_null=True)
    captured_at = serializers.DateTimeField()


class RideCaptainSerializer(serializers.Serializer[Any]):
    """Who is coming: what the rider sees once a captain accepts."""

    name = serializers.CharField(source="display_name")
    photo_url = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField(
        help_text="Average stars from riders, to one decimal; null for a new captain."
    )
    phone_number = serializers.SerializerMethodField(
        help_text="Only while the captain is on the way, at the pickup or in the trip."
    )
    vehicle = CaptainVehicleSerializer(source="ride_vehicle")
    position = serializers.SerializerMethodField(
        help_text="The captain's last ping while it is fresh; null when the server doesn't know."
    )
    eta_s = serializers.SerializerMethodField(
        help_text="Seconds to the pickup, while the captain is on the way; null if unknown."
    )

    def get_photo_url(self, obj: PartnerProfile) -> str | None:
        return partner_photo_url(obj)

    def get_rating(self, obj: PartnerProfile) -> float | None:
        return captain_rating(obj.pk)

    @extend_schema_field(CaptainPositionSerializer(allow_null=True))
    def get_position(self, obj: PartnerProfile) -> dict[str, Any] | None:
        del obj  # the live position comes from the ride, in the context
        live: CaptainLive = self.context["live"]
        return live.position

    def get_eta_s(self, obj: PartnerProfile) -> int | None:
        del obj
        live: CaptainLive = self.context["live"]
        return live.eta_s

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
    emergency_number = serializers.SerializerMethodField(
        help_text="The number the SOS Call button dials. From the server; never hard-coded."
    )

    class Meta:
        model = Ride
        fields: tuple[str, ...] = (
            "id",
            "kind",
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
            "captain_assigned_at",
            "captain_arrived_at",
            "started_at",
            "completed_at",
            "cancelled_by",
            "cancel_reason",
            "emergency_number",
        )
        read_only_fields = fields

    def get_emergency_number(self, obj: Ride) -> str:
        del obj
        return str(settings.RIDES_EMERGENCY_NUMBER)

    @extend_schema_field(RidePlaceSerializer)
    def get_pickup(self, obj: Ride) -> dict[str, Any]:
        return _pickup(obj)

    @extend_schema_field(RidePlaceSerializer)
    def get_drop(self, obj: Ride) -> dict[str, Any]:
        return _drop(obj)


def _payment_point(parcel: ParcelDetails) -> str:
    """Where the captain collects: at the pickup when the sender pays, else at the drop."""
    return "PICKUP" if parcel.payer == ParcelDetails.Payer.SENDER else "DROP"


def _end(parcel: ParcelDetails, side: str) -> dict[str, Any]:
    return {
        name: getattr(parcel, f"{side}_{name}")
        for name in ("name", "phone", "building", "unit", "meet_at", "instructions")
    }


class _ParcelBaseSerializer(serializers.Serializer[Any]):
    """The parcel fields both sides see. Who sees which contact details differs below."""

    mode = serializers.CharField()
    payer = serializers.CharField()
    pin_required = serializers.BooleanField()
    pickup = serializers.SerializerMethodField()
    drop = serializers.SerializerMethodField()
    payment_point = serializers.SerializerMethodField(
        help_text="PICKUP when the sender pays, DROP when the receiver pays."
    )
    # Each is null until that step happens.
    arrived_at_drop_at = serializers.DateTimeField(allow_null=True)
    delivered_at = serializers.DateTimeField(allow_null=True)
    receiver_unavailable_at = serializers.DateTimeField(allow_null=True)
    returned_at = serializers.DateTimeField(allow_null=True)
    return_fare_paise = serializers.IntegerField(allow_null=True)
    return_payment_status = serializers.CharField(allow_null=True)

    @extend_schema_field(ParcelContactSerializer)
    def get_pickup(self, obj: ParcelDetails) -> dict[str, Any] | None:
        return _end(obj, "pickup")

    @extend_schema_field(ParcelContactSerializer)
    def get_drop(self, obj: ParcelDetails) -> dict[str, Any] | None:
        return _end(obj, "drop")

    def get_payment_point(self, obj: ParcelDetails) -> str:
        return _payment_point(obj)


class ParcelSerializer(_ParcelBaseSerializer):
    """The parcel block on a ride, as the booker sees it."""

    delivery_pin = serializers.SerializerMethodField(
        help_text="The 4-digit PIN for the receiver. Only to the booker, only when PIN "
        "confirmation is on, and only until the parcel is delivered or goes back."
    )

    def get_delivery_pin(self, obj: ParcelDetails) -> str | None:
        if obj.pin_required and obj.ride.state in DELIVERY_PIN_VISIBLE_STATES:
            return parcel_delivery_pin(obj.ride_id)
        return None


class CaptainParcelSerializer(_ParcelBaseSerializer):
    """The parcel block as the captain sees it: both ends' details only while it is open (D20),
    and never the delivery PIN."""

    receiver_unavailable_allowed_at = serializers.SerializerMethodField(
        help_text="When Receiver not available opens (server time); null before arriving at the "
        "drop and once the parcel is no longer at the drop."
    )

    def get_receiver_unavailable_allowed_at(self, obj: ParcelDetails) -> datetime | None:
        if obj.ride.state != RideState.IN_TRIP:
            return None
        return receiver_unavailable_allowed_at(obj.ride, obj)

    @extend_schema_field(ParcelContactSerializer(allow_null=True))
    def get_pickup(self, obj: ParcelDetails) -> dict[str, Any] | None:
        return _end(obj, "pickup") if obj.ride.state in OPEN_RIDE_STATES else None

    @extend_schema_field(ParcelContactSerializer(allow_null=True))
    def get_drop(self, obj: ParcelDetails) -> dict[str, Any] | None:
        return _end(obj, "drop") if obj.ride.state in OPEN_RIDE_STATES else None


class RideSerializer(_RideBaseSerializer):
    """The rider's view of one ride."""

    parcel = serializers.SerializerMethodField(help_text="Pick up & Drop only; null for a ride.")

    captain = serializers.SerializerMethodField()
    otp = serializers.SerializerMethodField(
        help_text="The 4-digit start code the rider tells the captain. Only before the trip starts."
    )
    searching_again = serializers.SerializerMethodField(
        help_text='A captain cancelled and another is being found: say "Finding another captain".'
    )
    my_rating = serializers.SerializerMethodField(
        help_text="The stars the rider gave, or null: ask for a rating while it is null."
    )

    class Meta(_RideBaseSerializer.Meta):
        fields = (
            *_RideBaseSerializer.Meta.fields,
            "parcel",
            "captain",
            "otp",
            "searching_again",
            "my_rating",
        )
        read_only_fields = fields

    @extend_schema_field(ParcelSerializer(allow_null=True))
    def get_parcel(self, obj: Ride) -> dict[str, Any] | None:
        if obj.kind != RideKind.PARCEL:
            return None
        return dict(ParcelSerializer(obj.parcel).data)

    @extend_schema_field(RideCaptainSerializer(allow_null=True))
    def get_captain(self, obj: Ride) -> dict[str, Any] | None:
        if obj.captain is None:
            return None
        context = {"ride": obj, "live": captain_live(obj)}
        return dict(RideCaptainSerializer(obj.captain, context=context).data)

    def get_my_rating(self, obj: Ride) -> int | None:
        return _my_rating(obj, ActorKind.RIDER)

    def get_searching_again(self, obj: Ride) -> bool:
        return searching_again(obj)

    def get_otp(self, obj: Ride) -> str | None:
        return ride_otp(obj.id) if obj.state in OTP_VISIBLE_STATES else None


class CaptainRideSerializer(_RideBaseSerializer):
    """The captain's view of the ride they are doing."""

    rider = serializers.SerializerMethodField()
    parcel = serializers.SerializerMethodField(help_text="Pick up & Drop only; null for a ride.")
    my_rating = serializers.SerializerMethodField(
        help_text="The stars the captain gave the rider, or null."
    )

    class Meta(_RideBaseSerializer.Meta):
        fields = (*_RideBaseSerializer.Meta.fields, "rider", "parcel", "my_rating")
        read_only_fields = fields

    @extend_schema_field(CaptainParcelSerializer(allow_null=True))
    def get_parcel(self, obj: Ride) -> dict[str, Any] | None:
        if obj.kind != RideKind.PARCEL:
            return None
        return dict(CaptainParcelSerializer(obj.parcel).data)

    def get_my_rating(self, obj: Ride) -> int | None:
        return _my_rating(obj, ActorKind.CAPTAIN)

    @extend_schema_field(RideRiderSerializer)
    def get_rider(self, obj: Ride) -> dict[str, Any]:
        return dict(RideRiderSerializer(obj.rider, context={"ride": obj}).data)


class CaptainCurrentRideSerializer(serializers.Serializer[Any]):
    ride = CaptainRideSerializer(
        allow_null=True,
        help_text="The open ride, else a finished one not yet marked paid; null when neither.",
    )


def _reason_field(choices: tuple[str, ...]) -> serializers.CharField:
    # A plain string checked against the list: a choice field named "reason" would merge with the
    # other "reason" enums in the contract and rename them.
    return serializers.CharField(help_text="One of: " + ", ".join(choices) + ".")


def _check_reason(value: str, choices: tuple[str, ...]) -> str:
    if value not in choices:
        raise serializers.ValidationError("Choose one of: " + ", ".join(choices) + ".")
    return value


class RiderCancelSerializer(serializers.Serializer[Any]):
    reason = _reason_field(RIDER_CANCEL_REASONS)

    def validate_reason(self, value: str) -> str:
        return _check_reason(value, RIDER_CANCEL_REASONS)


class CaptainCancelSerializer(serializers.Serializer[Any]):
    reason = _reason_field(CAPTAIN_CANCEL_REASONS)

    def validate_reason(self, value: str) -> str:
        return _check_reason(value, CAPTAIN_CANCEL_REASONS)


class OperationsCancelSerializer(serializers.Serializer[Any]):
    reason = serializers.CharField(max_length=64, help_text="Why Operations closed the ride.")


class RatingSerializer(serializers.Serializer[Any]):
    stars = serializers.IntegerField(min_value=1, max_value=5)


class SosRequestSerializer(serializers.Serializer[Any]):
    """Where the phone is, if it knows. Both or neither: an SOS is never refused for lack of it."""

    latitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=Decimal(-90),
        max_value=Decimal(90),
        required=False,
        allow_null=True,
        default=None,
    )
    longitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=Decimal(-180),
        max_value=Decimal(180),
        required=False,
        allow_null=True,
        default=None,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if (attrs["latitude"] is None) != (attrs["longitude"] is None):
            raise serializers.ValidationError("Send latitude and longitude together.")
        return attrs


class SosSerializer(serializers.Serializer[Any]):
    sos_id = serializers.UUIDField(source="id")
    emergency_number = serializers.SerializerMethodField(
        help_text="Show a Call button for this number. From the server; never hard-coded."
    )

    def get_emergency_number(self, obj: Any) -> str:
        del obj
        return str(settings.RIDES_EMERGENCY_NUMBER)


class RideHistorySerializer(serializers.ModelSerializer[Ride]):
    """One past or current ride in a list, for the rider or the captain."""

    pickup_address = serializers.CharField(source="pickup_label")
    drop_address = serializers.CharField(source="drop_label")

    class Meta:
        model = Ride
        fields = (
            "id",
            "kind",
            "state",
            "vehicle_type",
            "pickup_address",
            "drop_address",
            "fare_paise",
            "final_fare_paise",
            "payment_status",
            "created_at",
            "completed_at",
            "cancelled_by",
        )
        read_only_fields = fields


class EarningsQuerySerializer(serializers.Serializer[Any]):
    period = serializers.CharField(help_text="today or week.")

    def validate_period(self, value: str) -> str:
        if value not in EARNINGS_PERIODS:
            raise serializers.ValidationError("Choose today or week.")
        return value


class EarningsSerializer(serializers.Serializer[Any]):
    period = serializers.CharField()
    since = serializers.DateTimeField(help_text="Local midnight today, or Monday for week.")
    rides = serializers.IntegerField(help_text="Completed rides in the period.")
    earned_paise = serializers.IntegerField(help_text="What riders owed for those rides.")
    cash_collected_paise = serializers.IntegerField(
        help_text="The part the captain marked as received."
    )


def _my_rating(ride: Ride, rater_kind: str) -> int | None:
    rating = next((r for r in ride.ratings.all() if r.rater_kind == rater_kind), None)
    return rating.stars if rating else None


class OpsRideRowSerializer(serializers.ModelSerializer[Ride]):
    """One ride in the Operations list."""

    service_area_id = serializers.UUIDField(read_only=True)
    rider_name = serializers.CharField(source="rider.full_name", read_only=True)
    captain_name = serializers.CharField(
        source="captain.display_name", read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = Ride
        fields = (
            "id",
            "kind",
            "state",
            "vehicle_type",
            "service_area_id",
            "rider_name",
            "captain_name",
            "fare_paise",
            "final_fare_paise",
            "payment_status",
            "created_at",
            "cancelled_by",
        )
        read_only_fields = fields


class OpsTransitionSerializer(serializers.Serializer[Any]):
    from_state = serializers.CharField(help_text="Blank for the ride's first row.")
    to_state = serializers.CharField()
    actor_kind = serializers.CharField(help_text="RIDER, CAPTAIN, OPERATIONS or SYSTEM.")
    actor_name = serializers.CharField(source="actor.full_name", allow_null=True, default=None)
    reason = serializers.CharField()
    at = serializers.DateTimeField()


class OpsOfferSerializer(serializers.Serializer[Any]):
    captain_id = serializers.UUIDField()
    captain_name = serializers.CharField(source="captain.display_name")
    round = serializers.IntegerField()
    status = serializers.CharField(help_text="PENDING, ACCEPTED, DECLINED, EXPIRED or WITHDRAWN.")
    pickup_distance_m = serializers.IntegerField()
    offered_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    responded_at = serializers.DateTimeField(allow_null=True)


class OpsPersonSerializer(serializers.Serializer[Any]):
    name = serializers.CharField()
    phone_number = serializers.CharField()


class OpsParcelSerializer(_ParcelBaseSerializer):
    """The parcel block for Operations: both ends' details, always (D20), and the PIN tries."""

    pin_attempts = serializers.IntegerField(help_text="Wrong delivery PINs so far, out of 5.")


class OpsRideDetailSerializer(_RideBaseSerializer):
    """Everything Operations needs to understand one ride: both people, the history and offers."""

    service_area_id = serializers.UUIDField(read_only=True)
    rider = serializers.SerializerMethodField()
    captain = serializers.SerializerMethodField()
    vehicle = serializers.SerializerMethodField()
    parcel = serializers.SerializerMethodField(help_text="Pick up & Drop only; null for a ride.")
    transitions = OpsTransitionSerializer(many=True, read_only=True)
    offers = OpsOfferSerializer(many=True, read_only=True)
    ratings = serializers.SerializerMethodField()

    class Meta(_RideBaseSerializer.Meta):
        fields = (
            *_RideBaseSerializer.Meta.fields,
            "service_area_id",
            "rider",
            "captain",
            "vehicle",
            "otp_attempts",
            "dispatch_round",
            "no_captain_found_at",
            "parcel",
            "ratings",
            "transitions",
            "offers",
        )
        read_only_fields = fields

    @extend_schema_field(OpsParcelSerializer(allow_null=True))
    def get_parcel(self, obj: Ride) -> dict[str, Any] | None:
        if obj.kind != RideKind.PARCEL:
            return None
        return dict(OpsParcelSerializer(obj.parcel).data)

    @extend_schema_field(OpsPersonSerializer)
    def get_rider(self, obj: Ride) -> dict[str, str]:
        return {"name": obj.rider.full_name, "phone_number": str(obj.rider.phone_number)}

    @extend_schema_field(OpsPersonSerializer(allow_null=True))
    def get_captain(self, obj: Ride) -> dict[str, str] | None:
        if obj.captain is None:
            return None
        return {
            "name": obj.captain.display_name,
            "phone_number": str(obj.captain.user.phone_number),
        }

    @extend_schema_field(CaptainVehicleSerializer(allow_null=True))
    def get_vehicle(self, obj: Ride) -> dict[str, Any] | None:
        vehicle = getattr(obj.captain, "ride_vehicle", None) if obj.captain else None
        return dict(CaptainVehicleSerializer(vehicle).data) if vehicle else None

    @extend_schema_field(serializers.DictField(child=serializers.IntegerField()))
    def get_ratings(self, obj: Ride) -> dict[str, int]:
        """Stars by who gave them: `RIDER` (for the captain) and `CAPTAIN` (for the rider)."""
        return {rating.rater_kind: rating.stars for rating in obj.ratings.all()}


class OpsCaptainSerializer(serializers.Serializer[Any]):
    """One captain in the Operations list."""

    partner_id = serializers.UUIDField(source="id")
    name = serializers.CharField(source="display_name")
    phone_number = serializers.CharField(source="user.phone_number")
    approval = serializers.CharField(help_text="The captain application's status.")
    vehicle = CaptainVehicleSerializer(source="ride_vehicle", allow_null=True, default=None)
    pass_ends_at = serializers.DateTimeField(
        allow_null=True, help_text="When the active pass ends; null without one."
    )
    on_duty = serializers.BooleanField()
    rides_completed = serializers.IntegerField(allow_null=True, default=0)
    rating = serializers.FloatField(
        allow_null=True, help_text="Average stars from riders; null before any rating."
    )
    cancels = serializers.IntegerField(
        allow_null=True, default=0, help_text="Rides this captain accepted and then cancelled."
    )

    def to_representation(self, instance: Any) -> dict[str, Any]:
        data = dict(super().to_representation(instance))
        data["rides_completed"] = data["rides_completed"] or 0
        data["cancels"] = data["cancels"] or 0
        if data["rating"] is not None:
            data["rating"] = round(float(data["rating"]), 2)
        return data


class OpsSosSerializer(serializers.ModelSerializer[RideSosEvent]):
    """One SOS in the Operations queue."""

    ride_id = serializers.UUIDField(read_only=True)
    ride_state = serializers.CharField(source="ride.state", read_only=True)
    raised_by_name = serializers.CharField(source="raised_by.full_name", read_only=True)
    raised_by_phone = serializers.CharField(source="raised_by.phone_number", read_only=True)
    raised_by_kind = serializers.SerializerMethodField(help_text="rider or captain.")
    status = serializers.CharField(read_only=True, help_text="OPEN or RESOLVED.")
    resolved_by_name = serializers.CharField(
        source="resolved_by.full_name", read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = RideSosEvent
        fields = (
            "id",
            "ride_id",
            "ride_state",
            "raised_by_name",
            "raised_by_phone",
            "raised_by_kind",
            "latitude",
            "longitude",
            "status",
            "created_at",
            "resolved_at",
            "resolved_by_name",
            "resolution_note",
        )
        read_only_fields = fields

    def get_raised_by_kind(self, obj: RideSosEvent) -> str:
        return "rider" if obj.raised_by_id == obj.ride.rider_id else "captain"


class SosResolveSerializer(serializers.Serializer[Any]):
    resolution_note = serializers.CharField(max_length=2000, help_text="What Operations did.")


class StartTripSerializer(serializers.Serializer[Any]):
    otp = serializers.RegexField(r"\A[0-9]{4}\Z", help_text="The rider's 4-digit start code.")


class DeliverParcelSerializer(serializers.Serializer[Any]):
    pin = serializers.RegexField(
        r"\A[0-9]{4}\Z",
        required=False,
        help_text="The receiver's 4-digit delivery PIN. Required only when PIN confirmation is on.",
    )


class ParcelOfferSerializer(serializers.Serializer[Any]):
    """What a captain sees of a parcel before accepting it. No names or phones yet (D20)."""

    pickup_meet_at = serializers.ChoiceField(choices=ParcelDetails.MeetAt.choices)
    drop_meet_at = serializers.ChoiceField(choices=ParcelDetails.MeetAt.choices)
    payment_point = serializers.CharField(help_text="PICKUP or DROP: where to collect the money.")


class RideOfferSerializer(serializers.ModelSerializer[RideOffer]):
    """A ride request on the captain's screen, with the server's deadline."""

    ride_id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(source="ride.kind", read_only=True)
    vehicle_type = serializers.CharField(source="ride.vehicle_type", read_only=True)
    pickup = serializers.SerializerMethodField()
    drop = serializers.SerializerMethodField()
    parcel = serializers.SerializerMethodField(
        help_text="Pick up & Drop only: how to meet at each end and where the money is collected."
    )
    fare_paise = serializers.IntegerField(source="ride.fare_paise", read_only=True)
    trip_distance_m = serializers.IntegerField(source="ride.quote.distance_m", read_only=True)
    trip_duration_s = serializers.IntegerField(source="ride.quote.duration_s", read_only=True)

    class Meta:
        model = RideOffer
        fields = (
            "id",
            "ride_id",
            "kind",
            "vehicle_type",
            "pickup",
            "drop",
            "parcel",
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

    @extend_schema_field(ParcelOfferSerializer(allow_null=True))
    def get_parcel(self, obj: RideOffer) -> dict[str, Any] | None:
        if obj.ride.kind != RideKind.PARCEL:
            return None
        parcel = obj.ride.parcel
        return {
            "pickup_meet_at": parcel.pickup_meet_at,
            "drop_meet_at": parcel.drop_meet_at,
            "payment_point": _payment_point(parcel),
        }


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
    service_area_name = serializers.CharField(source="service_area.name", read_only=True)

    class Meta:
        model = RideRateCard
        fields = (
            "id",
            "service_area_id",
            "service_area_name",
            "vehicle_type",
            "kind",
            *RATE_FIELDS,
            *PARCEL_LIMIT_FIELDS,
            "is_active",
            "version",
            "created_at",
        )
        read_only_fields = fields


def _amount(*, required: bool) -> serializers.IntegerField:
    """Paise, metres or minutes: a whole number, never negative."""
    return serializers.IntegerField(min_value=0, required=required)


def _weight() -> serializers.IntegerField:
    return serializers.IntegerField(
        min_value=1,
        required=False,
        help_text="Pick up & Drop cards only: the heaviest item, in grams.",
    )


def _size_label() -> serializers.CharField:
    return serializers.CharField(
        max_length=40,
        required=False,
        help_text="Pick up & Drop cards only, such as '40 x 30 x 20 cm'.",
    )


class RateCardCreateSerializer(serializers.Serializer[Any]):
    service_area_id = serializers.UUIDField()
    vehicle_type = serializers.ChoiceField(choices=VehicleType.choices)
    kind = serializers.ChoiceField(choices=RideKind.choices, default=RideKind.RIDE)
    max_parcel_weight_grams = _weight()
    parcel_size_label = _size_label()
    base_fare_paise = _amount(required=True)
    included_distance_m = _amount(required=True)
    per_km_paise = _amount(required=True)
    per_minute_paise = _amount(required=True)
    minimum_fare_paise = _amount(required=True)
    free_waiting_minutes = _amount(required=True)
    waiting_per_minute_paise = _amount(required=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        has_limits = [name for name in PARCEL_LIMIT_FIELDS if name in attrs]
        if attrs["kind"] == RideKind.RIDE:
            if has_limits:
                raise serializers.ValidationError(
                    dict.fromkeys(has_limits, "Only a Pick up & Drop card has limits.")
                )
            return attrs
        if attrs["vehicle_type"] not in (VehicleType.BIKE, VehicleType.AUTO):
            raise serializers.ValidationError({"vehicle_type": "Pick up & Drop is bike and auto."})
        missing = [name for name in PARCEL_LIMIT_FIELDS if name not in attrs]
        if missing:
            raise serializers.ValidationError(
                dict.fromkeys(missing, "A Pick up & Drop card needs this.")
            )
        return attrs


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
    max_parcel_weight_grams = _weight()
    parcel_size_label = _size_label()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        rates = {k: v for k, v in attrs.items() if k in (*RATE_FIELDS, *PARCEL_LIMIT_FIELDS)}
        if attrs.get("is_active") is False and rates:
            raise serializers.ValidationError(
                "Switch the card off on its own, without price changes."
            )
        if attrs.get("is_active") is not False and not rates:
            raise serializers.ValidationError("Send at least one price or limit to change.")
        return attrs


class CaptainPassPlanOpsSerializer(serializers.ModelSerializer[CaptainPassPlan]):
    """Operations' view of a plan. `code` is fixed once created."""

    #: Null for every vehicle type. Declared so a blank value is refused, not stored as a type.
    vehicle_type = serializers.ChoiceField(
        choices=VehicleType.choices, allow_null=True, required=False
    )

    class Meta:
        model = CaptainPassPlan
        fields = (
            "id",
            "code",
            "name",
            "price_paise",
            "duration_hours",
            "vehicle_type",
            "max_trips",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_duration_hours(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("A pass lasts at least an hour.")
        return value

    def validate_max_trips(self, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise serializers.ValidationError("A trip limit is at least 1 trip.")
        return value

    def validate_code(self, value: str) -> str:
        if self.instance is not None and value != self.instance.code:
            raise serializers.ValidationError("A plan's code can't change.")
        return value


class FareQuoteListSerializer(serializers.Serializer[Any]):
    quotes = FareQuoteSerializer(
        many=True, help_text="Bike, then auto, then cab; only the bookable ones."
    )
