"""Location request and response contracts."""

import uuid
from typing import Any, cast

from rest_framework import serializers

from apps.locations.models import Address, ServiceArea
from apps.locations.pins import directions_url
from apps.locations.services import normalize_postal_code


class PostalCodeField(serializers.CharField):
    def to_internal_value(self, data: str) -> str:
        value = super().to_internal_value(data)
        try:
            return normalize_postal_code(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc), code="invalid_postal_code") from exc


class AddressSerializer(serializers.ModelSerializer[Address]):
    postal_code = PostalCodeField(max_length=12)

    class Meta:
        model = Address
        fields = (
            "id",
            "label",
            "line1",
            "line2",
            "landmark",
            "locality",
            "city",
            "state",
            "postal_code",
            "country_code",
            "latitude",
            "longitude",
            "source",
            "confirmed_at",
            "is_default",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "confirmed_at", "created_at", "updated_at")


class ReverseGeocodeRequestSerializer(serializers.Serializer[dict[str, object]]):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90)
    longitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        min_value=-180,
        max_value=180,
    )


class ReverseGeocodeResponseSerializer(serializers.Serializer[dict[str, object]]):
    formatted_address = serializers.CharField(read_only=True)
    line1 = serializers.CharField(read_only=True)
    locality = serializers.CharField(read_only=True)
    city = serializers.CharField(read_only=True)
    state = serializers.CharField(read_only=True)
    postal_code = serializers.CharField(read_only=True)
    country_code = serializers.CharField(read_only=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, read_only=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, read_only=True)
    provider = serializers.CharField(read_only=True)


class ServiceabilityRequestSerializer(serializers.Serializer[dict[str, object]]):
    postal_code = PostalCodeField(max_length=12)
    service_variant_id = serializers.UUIDField(required=False)
    requested_start = serializers.DateTimeField(required=False)
    duration_minutes = serializers.IntegerField(required=False, min_value=1, max_value=1440)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        if "duration_minutes" in attrs and "requested_start" not in attrs:
            raise serializers.ValidationError(
                {"requested_start": "A requested start is required when duration is supplied."},
            )
        return attrs


class ServiceAreaSerializer(serializers.ModelSerializer[ServiceArea]):
    class Meta:
        model = ServiceArea
        fields = ("id", "slug", "name", "timezone")
        read_only_fields = fields


class PartnerServiceAreaOptionSerializer(serializers.ModelSerializer[ServiceArea]):
    class Meta:
        model = ServiceArea
        fields = ("id", "slug", "name", "timezone", "is_accepting_partners")
        read_only_fields = fields


class PartnerSiteAddressSerializer(serializers.Serializer[dict[str, Any]]):
    """The visit destination, disclosed to the Partner only once the visit is genuinely theirs.

    One shape for every Partner surface that discloses a Customer's door — the M2 site visit and
    the A1 booked visit — so the Partner app renders both through one component. Customer identity
    and contact are not part of it. The Customer's pin travels only inside ``directions_url`` — a
    route to the door, under the same disclosure gate as the address text — and never as separate
    coordinates, which would read as a location feed rather than a destination.
    """

    line1 = serializers.CharField()
    line2 = serializers.CharField(allow_blank=True)
    landmark = serializers.CharField(allow_blank=True)
    locality = serializers.CharField()
    city = serializers.CharField()
    state = serializers.CharField()
    postal_code = serializers.CharField()
    directions_url = serializers.CharField(
        help_text="Google Maps route to the Customer's pin. Empty if the address has none."
    )


def site_address_payload(address: Address) -> dict[str, str]:
    """`PartnerSiteAddressSerializer`'s fields for one address. The caller owns the gate."""

    return {
        "line1": address.line1,
        "line2": address.line2,
        "landmark": address.landmark,
        "locality": address.locality,
        "city": address.city,
        "state": address.state,
        "postal_code": address.postal_code,
        "directions_url": directions_url(address.latitude, address.longitude),
    }


class ServiceabilityResponseSerializer(serializers.Serializer[dict[str, object]]):
    is_serviceable = serializers.BooleanField(read_only=True)
    reason_code = serializers.CharField(read_only=True, allow_null=True)
    service_area = ServiceAreaSerializer(read_only=True, allow_null=True)
    server_now = serializers.DateTimeField(read_only=True)


def serviceability_input(
    data: dict[str, object],
) -> tuple[str, uuid.UUID | None, object, int | None]:
    return (
        cast(str, data["postal_code"]),
        cast(uuid.UUID | None, data.get("service_variant_id")),
        data.get("requested_start"),
        cast(int | None, data.get("duration_minutes")),
    )
