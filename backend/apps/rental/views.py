from datetime import date
from typing import Any, NoReturn
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.rental.exceptions import RentalStateApiError
from apps.rental.models import RentalAsset, RentalBooking
from apps.rental.serializers import (
    CreateAssetSerializer,
    CreateBookingSerializer,
    PartnerBookingActionSerializer,
    RentalAssetSerializer,
    RentalBookingSerializer,
    RentalModerationSerializer,
    RentalPhotoUploadSerializer,
    RentalTaxonomySubcategorySerializer,
)
from apps.rental.services import (
    RentalStateError,
    cancel_booking,
    create_asset,
    create_booking,
    dispute_deposit,
    get_rental_taxonomy,
    handover_booking,
    moderate_asset,
    partner_owns_rental_photo,
    public_assets,
    release_deposit,
    return_booking,
    store_rental_photo,
    submit_asset,
)


def _partner(user: Any) -> PartnerProfile:
    return get_object_or_404(PartnerProfile, user=user)


def _raise_domain_error(exc: Exception) -> NoReturn:
    """Translate domain refusals into APIExceptions so the shared envelope applies."""
    if isinstance(exc, PermissionError):
        raise PermissionDenied(detail=str(exc)) from exc
    if isinstance(exc, RentalAsset.DoesNotExist):
        raise NotFound(detail="Rental asset was not found.") from exc
    code = getattr(exc, "code", "rental_state_invalid")
    raise RentalStateApiError(reason=str(exc), code=str(code)) from exc


class RentalTaxonomyView(APIView):
    """Category → subcategory → service → variant + asset_schema for partner posting forms."""

    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=RentalTaxonomySubcategorySerializer(many=True))
    def get(self, request: Any) -> Response:  # noqa: ARG002
        return Response(get_rental_taxonomy())


class RentalBrowseView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("location", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("service", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("category", OpenApiTypes.STR, OpenApiParameter.QUERY),
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
            category_slug=request.query_params.get("category", ""),
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
                quantity=ser.validated_data.get("quantity", 1),
            )
        except (RentalStateError, PermissionError, RentalAsset.DoesNotExist) as exc:
            _raise_domain_error(exc)
        return Response(
            RentalBookingSerializer(booking, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class MyRentalsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(responses=RentalBookingSerializer(many=True))
    def get(self, request: Any) -> Response:
        rows = (
            RentalBooking.objects.filter(customer=request.user)
            .select_related("asset", "asset__partner", "deposit", "deposit__payment_attempt")
            .prefetch_related("lines")
        )
        return Response(RentalBookingSerializer(rows, many=True, context={"request": request}).data)


class MyRentalCancelView(APIView):
    """Customer cancel: PENDING_PAYMENT or CONFIRMED only. Fail-closed after handover."""

    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=None, responses=RentalBookingSerializer)
    def post(self, request: Any, booking_id: UUID) -> Response:
        booking = get_object_or_404(
            RentalBooking.objects.select_related("asset", "deposit", "deposit__payment_attempt"),
            id=booking_id,
            customer=request.user,
        )
        try:
            booking = cancel_booking(booking=booking, customer=request.user)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        booking = RentalBooking.objects.select_related(
            "asset", "asset__partner", "deposit", "deposit__payment_attempt"
        ).get(id=booking.id)
        return Response(RentalBookingSerializer(booking).data)


class PartnerRentalPhotoUploadView(APIView):
    permission_classes = (IsPartnerUser,)
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(
        request={"multipart/form-data": {"type": "object"}},
        responses={201: RentalPhotoUploadSerializer},
    )
    def post(self, request: Any) -> Response:
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Attach a photo file."})
        partner = _partner(request.user)
        try:
            row = store_rental_photo(partner=partner, upload=upload)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        photo_url = request.build_absolute_uri(row.stored_file.url)
        return Response(
            {
                "upload_id": str(row.id),
                "url": photo_url,
                "original_name": row.original_name,
            },
            status=status.HTTP_201_CREATED,
        )


class PartnerAssetCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=RentalAssetSerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = (
            RentalAsset.objects.filter(partner=partner)
            .select_related("partner", "variant")
            .prefetch_related("media")
        )
        return Response(RentalAssetSerializer(rows, many=True).data)

    @extend_schema(request=CreateAssetSerializer, responses=RentalAssetSerializer)
    def post(self, request: Any) -> Response:
        ser = CreateAssetSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        photo_urls = ser.validated_data.get("image_urls") or []
        if not all(partner_owns_rental_photo(partner=partner, url=url) for url in photo_urls):
            raise RentalStateApiError(
                reason="Upload photos from this form instead of pasting links."
            )
        try:
            asset = create_asset(partner=partner, **ser.validated_data)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data, status=status.HTTP_201_CREATED)


class PartnerAssetActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rentals_asset_action",
        request=None,
        responses=RentalAssetSerializer,
    )
    def post(self, request: Any, asset_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        asset = get_object_or_404(RentalAsset, id=asset_id, partner=partner)
        try:
            if action == "submit":
                asset = submit_asset(asset=asset, partner=partner)
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data)


class PartnerBookingCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY),
        ],
        responses=RentalBookingSerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = (
            RentalBooking.objects.filter(asset__partner=partner)
            .select_related("asset", "deposit", "customer")
            .prefetch_related("lines")
        )
        status_filter = (request.query_params.get("status") or "").strip().upper()
        if status_filter:
            rows = rows.filter(status=status_filter)
        return Response(RentalBookingSerializer(rows, many=True, context={"request": request}).data)


class PartnerBookingActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=PartnerBookingActionSerializer, responses=RentalBookingSerializer)
    def post(self, request: Any, booking_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        booking = get_object_or_404(
            RentalBooking.objects.select_related("asset", "deposit", "customer"),
            id=booking_id,
            asset__partner=partner,
        )
        serializer = PartnerBookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data
        try:
            if action == "handover":
                booking = handover_booking(
                    booking=booking,
                    partner=partner,
                    pin=str(body.get("pin") or ""),
                )
            elif action == "return":
                booking = return_booking(booking=booking, partner=partner)
            elif action == "release-deposit":
                release_deposit(booking=booking, partner=partner)
                booking.refresh_from_db()
            elif action == "dispute-deposit":
                # Serializer defaults consume_paise=0 (omit/blank → none consumed).
                booking = dispute_deposit(
                    booking=booking,
                    partner=partner,
                    reason=str(body.get("reason") or ""),
                    consume_paise=int(body.get("consume_paise") or 0),
                )
            elif action == "cancel":
                booking = cancel_booking(
                    booking=booking,
                    partner=partner,
                    reason=str(body.get("reason") or ""),
                )
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalBookingSerializer(booking, context={"request": request}).data)


class OpsRentalCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=RentalAssetSerializer(many=True))
    def get(self, _request: Any) -> Response:
        rows = (
            RentalAsset.objects.all()
            .select_related("partner", "variant")
            .prefetch_related("media")
            .prefetch_related("media")
        )
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
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data)


class OpsRentalBookingCancelView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=None, responses=RentalBookingSerializer)
    def post(self, request: Any, booking_id: UUID) -> Response:
        booking = get_object_or_404(
            RentalBooking.objects.select_related("asset", "deposit", "deposit__payment_attempt"),
            id=booking_id,
        )
        try:
            booking = cancel_booking(booking=booking, is_ops=True, reason="Ops force-cancel")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)

        booking = RentalBooking.objects.select_related(
            "asset", "asset__partner", "deposit", "deposit__payment_attempt"
        ).get(id=booking.id)
        return Response(RentalBookingSerializer(booking, context={"request": request}).data)
