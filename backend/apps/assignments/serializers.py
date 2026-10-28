from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from common.serializers import MoneySerializer


class OfferServiceLineSerializer(serializers.Serializer[dict[str, object]]):
    line_id = serializers.UUIDField()
    service_label = serializers.CharField()
    quantity = serializers.IntegerField(min_value=1)
    scope = serializers.DictField(child=serializers.JSONField())


class OfferSerializer(serializers.ModelSerializer[PartnerOffer]):
    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    unit_position = serializers.IntegerField(
        source="fulfilment_unit.position", read_only=True, allow_null=True
    )
    starts_at = serializers.DateTimeField(
        source="fulfilment_unit.requested_start", read_only=True, allow_null=True
    )
    estimated_duration_minutes = serializers.IntegerField(
        source="fulfilment_unit.estimated_duration_minutes",
        read_only=True,
        allow_null=True,
    )
    service_lines = serializers.SerializerMethodField()
    approximate_area = serializers.SerializerMethodField()
    requirements = serializers.SerializerMethodField()
    estimated_gross = serializers.SerializerMethodField()
    commission = serializers.SerializerMethodField()
    estimated_net = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = PartnerOffer
        fields = (
            "id",
            "checkout_id",
            "fulfilment_unit_id",
            "unit_position",
            "starts_at",
            "estimated_duration_minutes",
            "approximate_area",
            "service_lines",
            "requirements",
            "estimated_gross",
            "commission",
            "estimated_net",
            "status",
            "expires_at",
            "undo_deadline",
            "created_at",
            "server_now",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(OfferServiceLineSerializer(many=True))
    def get_service_lines(offer: PartnerOffer) -> list[dict[str, object]]:
        snapshot = offer.partner_projection_snapshot
        lines = snapshot.get("service_lines")
        if isinstance(lines, list):
            return [line for line in lines if isinstance(line, dict)]
        if offer.fulfilment_unit is None:
            return []
        return [
            {
                "line_id": str(line.id),
                "service_label": line.label,
                "quantity": line.quantity,
                "scope": line.snapshot.get("scope", {}),
            }
            for line in offer.fulfilment_unit.lines.filter(kind="SERVICE").order_by("position")
        ]

    @staticmethod
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_approximate_area(offer: PartnerOffer) -> str | None:
        value = offer.partner_projection_snapshot.get("approximate_area")
        return value if isinstance(value, str) else None

    @staticmethod
    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_requirements(offer: PartnerOffer) -> list[str]:
        value = offer.partner_projection_snapshot.get("requirements")
        return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []

    @staticmethod
    def _money(offer: PartnerOffer, key: str) -> dict[str, object] | None:
        value = offer.partner_projection_snapshot.get(key)
        return value if isinstance(value, dict) else None

    @extend_schema_field(MoneySerializer(allow_null=True))
    def get_estimated_gross(self, offer: PartnerOffer) -> dict[str, object] | None:
        return self._money(offer, "estimated_gross")

    @extend_schema_field(MoneySerializer(allow_null=True))
    def get_commission(self, offer: PartnerOffer) -> dict[str, object] | None:
        return self._money(offer, "commission")

    @extend_schema_field(MoneySerializer(allow_null=True))
    def get_estimated_net(self, offer: PartnerOffer) -> dict[str, object] | None:
        return self._money(offer, "estimated_net")

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_offer: PartnerOffer) -> str:
        """Millisecond-precise calibration source for `expires_at`/`undo_deadline`.

        The exposed `Date` response header already calibrates every response, but it
        is second-granular and can be rewritten by an intermediary. Publishing the
        instant that produced these deadlines keeps the shortest countdown in the
        product — the 120-second undo window — measurable from its own response.

        The instant is rendered here rather than handed back as a `datetime`, so this
        projection is plain JSON in every context — including the idempotency record
        that a replayed Partner command is read back from.
        """
        return timezone.now().isoformat()


class ManualOfferSerializer(serializers.Serializer[dict[str, object]]):
    partner_id = serializers.UUIDField()


class OfferPageSerializer(serializers.Serializer[dict[str, object]]):
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = OfferSerializer(many=True)
    # An empty inbox carries no offer to calibrate from, so the page publishes the
    # server instant too. A Partner who opens straight to an empty inbox is exactly
    # the offer-first session that has no other calibration source.
    server_now = serializers.DateTimeField(read_only=True)


class RankedCandidateSerializer(serializers.Serializer[dict[str, object]]):
    partner_id = serializers.UUIDField()
    rank = serializers.IntegerField()
    factors = serializers.DictField(child=serializers.JSONField())


class ExcludedCandidateSerializer(serializers.Serializer[dict[str, object]]):
    partner_id = serializers.UUIDField()
    reasons = serializers.ListField(child=serializers.CharField())


class DispatchAttemptSerializer(serializers.Serializer[dict[str, object]]):
    attempt_id = serializers.UUIDField()
    rank = serializers.IntegerField()
    partner_id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    offer_status = serializers.CharField(allow_null=True)
    eligibility = serializers.DictField(child=serializers.JSONField())
    ranked = RankedCandidateSerializer(many=True)
    excluded = ExcludedCandidateSerializer(many=True)


class DispatchExplanationSerializer(serializers.Serializer[dict[str, object]]):
    fulfilment_unit_id = serializers.UUIDField()
    unit_status = serializers.CharField()
    unit_version = serializers.IntegerField()
    policy = serializers.CharField()
    policy_version = serializers.IntegerField()
    attempts = DispatchAttemptSerializer(many=True)
    server_now = serializers.DateTimeField()


class DispatchCommandRequestSerializer(serializers.Serializer[dict[str, object]]):
    expected_unit_version = serializers.IntegerField(min_value=1)
    reason = serializers.ChoiceField(choices=DispatchCommandAudit.Reason.choices)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class DispatchReservationSerializer(serializers.ModelSerializer[Reservation]):
    fulfilment_unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    partner_id = serializers.UUIDField(read_only=True)
    server_now = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = (
            "id",
            "fulfilment_unit_id",
            "partner_id",
            "status",
            "expires_at",
            "released_at",
            "created_at",
            "server_now",
        )
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(serializers.DateTimeField())
    def get_server_now(_reservation: Reservation) -> str:
        return timezone.now().isoformat()


class FulfilmentUnitDispatchSerializer(serializers.Serializer[dict[str, object]]):
    id = serializers.UUIDField()
    position = serializers.IntegerField()
    status = serializers.CharField()
    version = serializers.IntegerField()
    group_status = serializers.CharField()
    live_offer_id = serializers.UUIDField(allow_null=True)
    live_offer_status = serializers.CharField(allow_null=True)
    reservation_status = serializers.CharField(allow_null=True)
    server_now = serializers.DateTimeField()


class DispatchOfferSerializer(serializers.ModelSerializer):
    remaining_seconds = serializers.SerializerMethodField()
    server_now = serializers.SerializerMethodField()
    booking = serializers.SerializerMethodField()

    class Meta:
        from apps.assignments.models import DispatchOffer

        model = DispatchOffer
        fields = (
            "id",
            "status",
            "offered_at",
            "expires_at",
            "responded_at",
            "remaining_seconds",
            "server_now",
            "booking",
        )
        read_only_fields = fields

    def get_remaining_seconds(self, obj: object) -> int:
        now = timezone.now()
        expires_at = getattr(obj, "expires_at", None)
        status = getattr(obj, "status", None)
        if not expires_at or expires_at <= now or status != "PENDING":
            return 0
        return max(0, int((expires_at - now).total_seconds()))

    def get_server_now(self, _obj: object) -> str:
        return timezone.now().isoformat()

    def get_booking(self, obj: object) -> dict[str, object]:
        booking = getattr(obj, "booking", None)
        if not booking:
            return {}

        unit = getattr(booking, "fulfilment_unit", None)
        service_title = "Instant Home Service"
        service_category = "Home Services"
        location_area = "Hyderabad"
        booking_mode = "INSTANT"

        if unit:
            lines = list(unit.lines.all())
            if lines:
                service_title = getattr(lines[0], "title", service_title)
            if getattr(unit, "service_area", None):
                location_area = unit.service_area.name
            group = getattr(unit, "booking_group", None)
            if group and hasattr(group, "booking_mode"):
                booking_mode = str(group.booking_mode)

        return {
            "id": str(booking.id),
            "status": str(booking.status),
            "booking_mode": booking_mode,
            "scheduled_start": booking.scheduled_start.isoformat() if getattr(booking, "scheduled_start", None) else None,
            "estimated_duration_minutes": getattr(booking, "estimated_duration_minutes", 60),
            "service_title": service_title,
            "service_category": service_category,
            "location_area": location_area,
            "customer_notes": "",
        }

