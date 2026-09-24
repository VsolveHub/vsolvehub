from datetime import date
from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.rental.models import RentalAsset, RentalBooking
from apps.rental.serializers import (
    CreateAssetSerializer,
    CreateBookingSerializer,
    RentalModerationSerializer,
    RentalAssetSerializer,
    RentalBookingSerializer,
)
from apps.rental.services import (
    RentalStateError,
    create_asset,
    create_booking,
    handover_booking,
    moderate_asset,
    public_assets,
    release_deposit,
    return_booking,
    submit_asset,
)


def _partner(user: Any) -> PartnerProfile:
    return get_object_or_404(PartnerProfile, user=user)


def _error(exc: Exception) -> Response:
    code = status.HTTP_400_BAD_REQUEST
    if isinstance(exc, PermissionError):
        code = status.HTTP_403_FORBIDDEN
    return Response({"detail": str(exc)}, status=code)


class RentalBrowseView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("location", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("service", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("min_price", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("max_price", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("max_deposit", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("start_date", OpenApiTypes.DATE, OpenApiParameter.QUERY),
            OpenApiParameter("end_date", OpenApiTypes.DATE, OpenApiParameter.QUERY),
        ],
        responses=RentalAssetSerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        min_rate = request.query_params.get("min_price")
        max_rate = request.query_params.get("max_price")
        max_deposit = request.query_params.get("max_deposit")
        def _parse_date(raw: str | None) -> date | None:
            if not raw:
                return None
            try:
                return date.fromisoformat(raw)
            except ValueError:
                return None

        assets = public_assets(
            query=request.query_params.get("q", ""),
            location=request.query_params.get("location", ""),
            min_daily_rate_paise=int(min_rate) if min_rate and min_rate.isdigit() else None,
            max_daily_rate_paise=int(max_rate) if max_rate and max_rate.isdigit() else None,
            max_deposit_paise=int(max_deposit) if max_deposit and max_deposit.isdigit() else None,
            variant_code=request.query_params.get("service", ""),
            start_date=_parse_date(request.query_params.get("start_date")),
            end_date=_parse_date(request.query_params.get("end_date")),
        )
        return Response(RentalAssetSerializer(assets, many=True).data)


class RentalDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=RentalAssetSerializer)
    def get(self, _request: Any, asset_id: UUID) -> Response:
        asset = get_object_or_404(public_assets(), id=asset_id)
        return Response(RentalAssetSerializer(asset).data)


class RentalBookView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=CreateBookingSerializer, responses=RentalBookingSerializer)
    def post(self, request: Any) -> Response:
        ser = CreateBookingSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            booking = create_booking(
                customer=request.user,
                asset_id=ser.validated_data["asset_id"],
                start_date=ser.validated_data["start_date"],
                end_date=ser.validated_data["end_date"],
                mode=ser.validated_data.get("pickup_or_delivery_mode", "PICKUP"),
                notes=ser.validated_data.get("notes", ""),
            )
        except (RentalStateError, PermissionError, RentalAsset.DoesNotExist) as exc:
            return _error(exc)
        return Response(RentalBookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class MyRentalsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(responses=RentalBookingSerializer(many=True))
    def get(self, request: Any) -> Response:
        rows = RentalBooking.objects.filter(customer=request.user).select_related(
            "asset", "asset__partner", "deposit"
        )
        return Response(RentalBookingSerializer(rows, many=True).data)


class PartnerAssetCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=RentalAssetSerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = RentalAsset.objects.filter(partner=partner).select_related("partner", "variant")
        return Response(RentalAssetSerializer(rows, many=True).data)

    @extend_schema(request=CreateAssetSerializer, responses=RentalAssetSerializer)
    def post(self, request: Any) -> Response:
        ser = CreateAssetSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        try:
            asset = create_asset(partner=partner, **ser.validated_data)
        except (RentalStateError, PermissionError) as exc:
            return _error(exc)
        return Response(RentalAssetSerializer(asset).data, status=status.HTTP_201_CREATED)


class PartnerAssetActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=None, responses=RentalAssetSerializer)
    def post(self, request: Any, asset_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        asset = get_object_or_404(RentalAsset, id=asset_id, partner=partner)
        try:
            if action == "submit":
                asset = submit_asset(asset=asset, partner=partner)
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            return _error(exc)
        return Response(RentalAssetSerializer(asset).data)


class PartnerBookingCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=RentalBookingSerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = RentalBooking.objects.filter(asset__partner=partner).select_related(
            "asset", "deposit", "customer"
        )
        return Response(RentalBookingSerializer(rows, many=True).data)


class PartnerBookingActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=None, responses=RentalBookingSerializer)
    def post(self, request: Any, booking_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        booking = get_object_or_404(
            RentalBooking.objects.select_related("asset", "deposit"),
            id=booking_id,
            asset__partner=partner,
        )
        try:
            if action == "handover":
                booking = handover_booking(booking=booking, partner=partner)
            elif action == "return":
                booking = return_booking(booking=booking, partner=partner)
            elif action == "release-deposit":
                release_deposit(booking=booking, partner=partner)
                booking.refresh_from_db()
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            return _error(exc)
        return Response(RentalBookingSerializer(booking).data)


class OpsRentalCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=RentalAssetSerializer(many=True))
    def get(self, _request: Any) -> Response:
        rows = RentalAsset.objects.all().select_related("partner", "variant")
        return Response(RentalAssetSerializer(rows, many=True).data)


class OpsRentalModerateView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=RentalModerationSerializer, responses=RentalAssetSerializer)
    def post(self, request: Any, asset_id: UUID) -> Response:
        ser = RentalModerationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        asset = get_object_or_404(RentalAsset, id=asset_id)
        try:
            asset = moderate_asset(
                asset=asset,
                actor=request.user,
                action=ser.validated_data["action"],
                reason=ser.validated_data["reason"],
            )
        except RentalStateError as exc:
            return _error(exc)
        return Response(RentalAssetSerializer(asset).data)
