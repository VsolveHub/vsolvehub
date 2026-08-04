from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.assignments.models import PartnerOffer
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
