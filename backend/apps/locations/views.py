"""Customer address, reverse-geocoding and serviceability APIs."""

from dataclasses import asdict
from datetime import datetime
from typing import cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.identity.models import User
from apps.locations.exceptions import GeocodingUnavailableApiError
from apps.locations.geocoding import GeocodingError, reverse_geocode
from apps.locations.models import Address
from apps.locations.serializers import (
    AddressSerializer,
    ReverseGeocodeRequestSerializer,
    ReverseGeocodeResponseSerializer,
    ServiceabilityRequestSerializer,
    ServiceabilityResponseSerializer,
    serviceability_input,
)
from apps.locations.services import (
    archive_address,
    check_serviceability,
    create_address,
    update_address,
)
from common.errors.serializers import ApiErrorSerializer


class AddressListCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Addresses"], responses={200: AddressSerializer(many=True)})
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        addresses = Address.objects.filter(customer=user, archived_at__isnull=True)
        return Response(AddressSerializer(addresses, many=True).data)

    @extend_schema(
        tags=["Addresses"],
        request=AddressSerializer,
        responses={
            201: AddressSerializer,
            400: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = create_address(
            customer=cast(User, request.user),
            values=dict(serializer.validated_data),
        )
        return Response(AddressSerializer(address).data, status=status.HTTP_201_CREATED)


class AddressDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @staticmethod
    def _address(request: Request, address_id: object) -> Address:
        return get_object_or_404(
            Address,
            id=address_id,
            customer=cast(User, request.user),
            archived_at__isnull=True,
        )

    @extend_schema(
        tags=["Addresses"],
        responses={
            200: AddressSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, address_id: object) -> Response:
        return Response(AddressSerializer(self._address(request, address_id)).data)

    @extend_schema(
        tags=["Addresses"],
        request=AddressSerializer,
        responses={
            200: AddressSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def patch(self, request: Request, address_id: object) -> Response:
        address = self._address(request, address_id)
        serializer = AddressSerializer(address, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_address(address=address, values=dict(serializer.validated_data))
        return Response(AddressSerializer(updated).data)

    @extend_schema(
        tags=["Addresses"],
        request=None,
        responses={
            204: OpenApiResponse(description="Address archived."),
            404: ApiErrorSerializer,
        },
    )
    def delete(self, request: Request, address_id: object) -> Response:
        archive_address(address=self._address(request, address_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReverseGeocodeView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "geocoding"

    @extend_schema(
        tags=["Locations"],
        request=ReverseGeocodeRequestSerializer,
        responses={
            200: ReverseGeocodeResponseSerializer,
            400: ApiErrorSerializer,
            429: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = ReverseGeocodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = reverse_geocode(**serializer.validated_data)
        except GeocodingError as exc:
            raise GeocodingUnavailableApiError from exc
        return Response(ReverseGeocodeResponseSerializer(asdict(result)).data)


class ServiceabilityCheckView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "serviceability"

    @extend_schema(
        tags=["Locations"],
        request=ServiceabilityRequestSerializer,
        responses={
            200: ServiceabilityResponseSerializer,
            400: ApiErrorSerializer,
            429: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = ServiceabilityRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        postal_code, variant_id, requested_start, duration = serviceability_input(
            serializer.validated_data,
        )
        decision = check_serviceability(
            postal_code=postal_code,
            variant_id=variant_id,
            requested_start=cast(datetime | None, requested_start),
            duration_minutes=duration,
        )
        payload: dict[str, object] = {
            "is_serviceable": decision.is_serviceable,
            "reason_code": decision.reason_code,
            "service_area": decision.service_area,
            "server_now": timezone.now(),
        }
        return Response(ServiceabilityResponseSerializer(payload).data)
