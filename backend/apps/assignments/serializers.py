from rest_framework import serializers

from apps.assignments.models import PartnerOffer


class OfferSerializer(serializers.ModelSerializer[PartnerOffer]):
    class Meta:
        model = PartnerOffer
        fields = ("id", "checkout_id", "status", "expires_at", "undo_deadline", "created_at")
        read_only_fields = fields


class ManualOfferSerializer(serializers.Serializer[dict[str, object]]):
    partner_id = serializers.UUIDField()
