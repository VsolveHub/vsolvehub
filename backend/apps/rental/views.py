from datetime import date
from typing import Any, NoReturn
from uuid import UUID

from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.slugs import lookup_by_slug_or_id
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.rental import transport as transport_service
from apps.rental.exceptions import RentalStateApiError
from apps.rental.models import (
    RentalAsset,
    RentalBooking,
    RentalDeposit,
    RentalDisputePhoto,
    RentalPhotoUpload,
)
from apps.rental.pickup_hours import (
    DayHours,
    PickupHoursError,
    pickup_hours_payload,
    save_pickup_hours,
)
from apps.rental.serializers import (
    CreateAssetSerializer,
    CreateBookingSerializer,
    OpsRentalBookingSerializer,
    OpsRentalDisputeDecisionSerializer,
    PartnerBookingActionSerializer,
    PartnerRentalBookingSerializer,
    PickupHoursSerializer,
    PickupHoursUpdateSerializer,
    RentalAssetDetailSerializer,
    RentalAssetSerializer,
    RentalBookingSerializer,
    RentalModerationSerializer,
    RentalPhotoUploadSerializer,
    RentalPlatformFeeSerializer,
    RentalTaxonomySubcategorySerializer,
    TransportNoteSerializer,
    TransportQuoteSerializer,
    UpdateAssetSerializer,
)
from apps.rental.services import (
    RentalStateError,
    auto_publish_asset,
    cancel_booking,
    create_booking,
    current_platform_fee_percent,
    decide_deposit_dispute,
    delete_asset,
    dispute_deposit,
    get_rental_taxonomy,
    handover_booking,
    moderate_asset,
    partner_owns_rental_photo,
    pause_asset,
    public_assets,
    release_deposit,
    remove_media,
    resume_asset,
    return_booking,
    save_platform_fee,
    store_rental_dispute_photo,
    store_rental_photo,
    submit_asset,
    update_asset,
)
from common.pagination import (
    BROWSE_PARAMETERS,
    CURSOR_PARAMETER,
    STATUS_PARAMETER,
    OperationsNewestFirstPagination,
    browse_window,
    filter_statuses,
    page_serializer,
    paginated,
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


class RentalPlatformFeeView(APIView):
    """The live platform-fee percent. Customers use it to show the charge before they book."""

    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=RentalPlatformFeeSerializer)
    def get(self, _request: Any) -> Response:
        return Response(
            {
                "percent": current_platform_fee_percent(),
                "transport_fee_percent": transport_service.transport_fee_percent(),
            }
        )


#: Booking reads load the asset's owner hours and the delivery request in the same queries.
BOOKING_RELATED = (
    "asset",
    "asset__partner",
    "deposit",
    "deposit__payment_attempt",
)
BOOKING_PREFETCH = (
    "lines",
    "asset__partner__rental_pickup_days",
    "asset__partner__rental_pickup_closed_dates",
    "asset__media",
    "transport",
)


def _booking_rows() -> Any:
    return RentalBooking.objects.select_related(*BOOKING_RELATED).prefetch_related(
        *BOOKING_PREFETCH
    )


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
            *BROWSE_PARAMETERS,
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
        # Never unbounded: one browse page, newest first, like `/stays` and `/listings`.
        limit, offset = browse_window(request)
        window = assets.order_by("-created_at", "-id")[offset : offset + limit]
        return Response(RentalAssetSerializer(window, many=True).data)


class RentalDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=RentalAssetDetailSerializer)
    def get(self, _request: Any, key: str) -> Response:
        """``key`` is the page slug; an old link's asset id still works."""
        asset = get_object_or_404(
            public_assets().prefetch_related(
                "partner__rental_pickup_days", "partner__rental_pickup_closed_dates"
            ),
            **lookup_by_slug_or_id(key),
        )
        return Response(RentalAssetDetailSerializer(asset).data)


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
                delivery_address=ser.validated_data.get("delivery_address"),
                delivery_note=ser.validated_data.get("delivery_note", ""),
            )
        except (RentalStateError, PermissionError, RentalAsset.DoesNotExist) as exc:
            _raise_domain_error(exc)
        return Response(
            RentalBookingSerializer(
                _booking_rows().get(id=booking.id), context={"request": request}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class MyRentalsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        parameters=[STATUS_PARAMETER, CURSOR_PARAMETER],
        responses=page_serializer(RentalBookingSerializer, "RentalBookingPage"),
    )
    def get(self, request: Any) -> Response:
        rows = _booking_rows().filter(customer=request.user)
        rows = filter_statuses(rows, request, RentalBooking.Status.values)
        return paginated(request, self, rows, RentalBookingSerializer)


class MyRentalTransportView(APIView):
    """The customer answers the owner's transport price, or drops delivery.

    ``accept`` starts the one payment for rent, fee, deposit and transport; the response's
    ``deposit.payment_attempt_id`` opens checkout. ``switch-to-pickup`` starts the pickup payment.
    """

    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        operation_id="me_rentals_transport_action",
        request=TransportNoteSerializer,
        responses=RentalBookingSerializer,
    )
    def post(self, request: Any, booking_id: UUID, action: str) -> Response:
        booking = get_object_or_404(RentalBooking, id=booking_id, customer=request.user)
        body = TransportNoteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            if action == "accept":
                transport_service.accept_quote(booking=booking, customer=request.user)
            elif action == "reject":
                transport_service.reject_quote(
                    booking=booking, customer=request.user, note=body.validated_data["note"]
                )
            elif action == "switch-to-pickup":
                transport_service.switch_to_pickup(booking=booking, customer=request.user)
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(
            RentalBookingSerializer(
                _booking_rows().get(id=booking.id), context={"request": request}
            ).data
        )


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
        return Response(
            RentalBookingSerializer(
                _booking_rows().get(id=booking.id), context={"request": request}
            ).data
        )


class PartnerPickupHoursView(APIView):
    """The owner's open days and hours, used by all their rental items."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=PickupHoursSerializer)
    def get(self, request: Any) -> Response:
        return Response(pickup_hours_payload(_partner(request.user).id))

    @extend_schema(request=PickupHoursUpdateSerializer, responses=PickupHoursSerializer)
    def put(self, request: Any) -> Response:
        partner = _partner(request.user)
        ser = PickupHoursUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        days = [
            DayHours(weekday=d["weekday"], opens_at=d["opens_at"], closes_at=d["closes_at"])
            for d in ser.validated_data["days"]
        ]
        try:
            save_pickup_hours(
                partner=partner,
                days=days,
                closed_dates=ser.validated_data.get("closed_dates"),
            )
        except PickupHoursError as exc:
            _raise_domain_error(exc)
        return Response(pickup_hours_payload(partner.id))


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
        kind = str(request.data.get("kind") or "").strip().lower()
        row: RentalDisputePhoto | RentalPhotoUpload
        try:
            if kind == "dispute":
                row = store_rental_dispute_photo(partner=partner, upload=upload)
            elif kind in {"", "ad"}:
                row = store_rental_photo(partner=partner, upload=upload)
            else:
                raise RentalStateError("Unknown photo kind.")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        # Dispute evidence stays private. Ad photos keep a public URL.
        photo_url = "" if kind == "dispute" else request.build_absolute_uri(row.stored_file.url)
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
            asset = auto_publish_asset(partner=partner, **ser.validated_data)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data, status=status.HTTP_201_CREATED)


class PartnerAssetDetailView(APIView):
    """PATCH to edit, DELETE to archive."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=UpdateAssetSerializer, responses=RentalAssetSerializer)
    def patch(self, request: Any, asset_id: UUID) -> Response:
        partner = _partner(request.user)
        asset = get_object_or_404(RentalAsset, id=asset_id, partner=partner)
        ser = UpdateAssetSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            asset = update_asset(asset=asset, partner=partner, **ser.validated_data)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data)

    @extend_schema(responses=RentalAssetSerializer)
    def delete(self, request: Any, asset_id: UUID) -> Response:
        partner = _partner(request.user)
        asset = get_object_or_404(RentalAsset, id=asset_id, partner=partner)
        try:
            asset = delete_asset(asset=asset, partner=partner)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data)


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
            elif action == "pause":
                asset = pause_asset(asset=asset, partner=partner)
            elif action == "resume":
                asset = resume_asset(asset=asset, partner=partner)
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RentalAssetSerializer(asset).data)


class PartnerAssetMediaDeleteView(APIView):
    """Remove a single photo from an ad."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(responses={204: None})
    def delete(self, request: Any, asset_id: UUID, media_id: UUID) -> Response:
        partner = _partner(request.user)
        asset = get_object_or_404(RentalAsset, id=asset_id, partner=partner)
        try:
            remove_media(asset=asset, partner=partner, media_id=media_id)
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerBookingCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        parameters=[STATUS_PARAMETER, CURSOR_PARAMETER],
        responses=page_serializer(PartnerRentalBookingSerializer, "PartnerRentalBookingPage"),
    )
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = _booking_rows().select_related("customer").filter(asset__partner=partner)
        rows = filter_statuses(rows, request, RentalBooking.Status.values)
        return paginated(request, self, rows, PartnerRentalBookingSerializer)


class PartnerBookingActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=PartnerBookingActionSerializer, responses=PartnerRentalBookingSerializer)
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
                    photo_ids=list(body.get("photo_ids") or []),
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
        return Response(
            PartnerRentalBookingSerializer(
                _booking_rows().select_related("customer").get(id=booking.id),
                context={"request": request},
            ).data
        )


class PartnerBookingTransportView(APIView):
    """The owner prices a delivery request, declines it, or sends the item out."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_rentals_booking_transport_quote",
        request=TransportQuoteSerializer,
        responses=PartnerRentalBookingSerializer,
    )
    def post(self, request: Any, booking_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        booking = get_object_or_404(RentalBooking, id=booking_id, asset__partner=partner)
        try:
            if action == "quote":
                body = TransportQuoteSerializer(data=request.data)
                body.is_valid(raise_exception=True)
                transport_service.quote_transport(
                    booking=booking,
                    partner=partner,
                    amount_paise=body.validated_data["amount_paise"],
                    trip=body.validated_data["trip"],
                    note=body.validated_data["note"],
                )
            elif action == "decline":
                note = TransportNoteSerializer(data=request.data)
                note.is_valid(raise_exception=True)
                transport_service.decline_transport(
                    booking=booking, partner=partner, reason=note.validated_data["note"]
                )
            elif action == "out-for-delivery":
                transport_service.mark_out_for_delivery(booking=booking, partner=partner)
            else:
                raise RentalStateError("Unknown action.")
        except (RentalStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(
            PartnerRentalBookingSerializer(
                _booking_rows().select_related("customer").get(id=booking.id),
                context={"request": request},
            ).data
        )


def _ops_dispute_row(booking: RentalBooking, request: Any) -> dict[str, Any]:
    deposit = booking.deposit
    held = deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED)
    photos: list[dict[str, str]] = []
    for photo in booking.dispute_photos.all():
        url = photo.stored_file.url
        if url.startswith("/"):
            url = request.build_absolute_uri(url)
        photos.append({"id": str(photo.id), "url": url})
    partner = booking.asset.partner
    return {
        "booking_id": str(booking.id),
        "asset_title": booking.asset.title,
        "partner_name": partner.display_name,
        "reason": deposit.provider_note,
        "deposit_amount_paise": deposit.amount_paise,
        "requested_consume_paise": deposit.requested_consume_paise or 0,
        "consumed_paise": deposit.consumed_paise,
        "deposit_status": deposit.status,
        "awaiting_decision": booking.status == RentalBooking.Status.DISPUTED and held,
        "photos": photos,
    }


class OpsRentalDisputeCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    def get(self, request: Any) -> Response:
        rows = (
            RentalBooking.objects.filter(status=RentalBooking.Status.DISPUTED)
            .select_related("asset", "asset__partner", "deposit")
            .prefetch_related("dispute_photos")
            .order_by("-updated_at")
        )
        return Response([_ops_dispute_row(booking, request) for booking in rows])


class OpsRentalDisputeDecisionView(APIView):
    permission_classes = (IsOperationsUser,)

    def post(self, request: Any, booking_id: UUID) -> Response:
        serializer = OpsRentalDisputeDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = get_object_or_404(
            RentalBooking.objects.select_related("asset", "asset__partner", "deposit"),
            id=booking_id,
        )
        try:
            booking = decide_deposit_dispute(
                booking=booking,
                actor=request.user,
                decision=serializer.validated_data["decision"],
            )
        except RentalStateError as exc:
            _raise_domain_error(exc)
        booking = (
            RentalBooking.objects.select_related("asset", "asset__partner", "deposit")
            .prefetch_related("dispute_photos")
            .get(id=booking.id)
        )
        return Response(_ops_dispute_row(booking, request))


class OpsRentalPlatformFeeView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=RentalPlatformFeeSerializer)
    def get(self, _request: Any) -> Response:
        return Response({"percent": current_platform_fee_percent()})

    @extend_schema(request=RentalPlatformFeeSerializer, responses=RentalPlatformFeeSerializer)
    def put(self, request: Any) -> Response:
        serializer = RentalPlatformFeeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = save_platform_fee(percent=serializer.validated_data["percent"], actor=request.user)
        return Response({"percent": row.percent})


class OpsRentalCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "moderation_status",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                description="One listing status, or several separated by commas (PENDING, ...).",
            ),
            CURSOR_PARAMETER,
        ],
        responses=page_serializer(RentalAssetSerializer, "RentalAssetPage"),
    )
    def get(self, request: Any) -> Response:
        rows = RentalAsset.objects.select_related("partner", "variant").prefetch_related("media")
        rows = _filter_moderation_statuses(rows, request)
        return paginated(
            request, self, rows, RentalAssetSerializer, pagination=OperationsNewestFirstPagination
        )


def _filter_moderation_statuses(rows: Any, request: Any) -> Any:
    """`?moderation_status=PENDING` or `PENDING,REJECTED`. An unknown state is refused, not
    ignored, so a typo cannot read as an empty queue."""
    raw = (request.query_params.get("moderation_status") or "").strip()
    if not raw:
        return rows
    wanted = [part.strip().upper() for part in raw.split(",") if part.strip()]
    unknown = sorted(set(wanted) - set(RentalAsset.ModerationStatus.values))
    if unknown:
        raise ValidationError(
            {"moderation_status": [f"Unknown listing status: {', '.join(unknown)}."]}
        )
    return rows.filter(moderation_status__in=wanted)


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


class OpsRentalBookingCollectionView(APIView):
    """Every rental booking, so Operations can see delivery requests, payments and cancellations.

    `?status=` narrows to one state or several (comma list); `?q=` matches the customer's name or
    phone, the owner's name, the equipment title, or a booking id.
    """

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        parameters=[
            STATUS_PARAMETER,
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            CURSOR_PARAMETER,
        ],
        responses=page_serializer(OpsRentalBookingSerializer, "OpsRentalBookingPage"),
    )
    def get(self, request: Any) -> Response:
        rows = _booking_rows().select_related("customer")
        rows = filter_statuses(rows, request, RentalBooking.Status.values)
        query = (request.query_params.get("q") or "").strip()
        if query:
            match = (
                Q(customer__full_name__icontains=query)
                | Q(customer__phone_number__icontains=query)
                | Q(asset__partner__display_name__icontains=query)
                | Q(asset__title__icontains=query)
            )
            if _is_uuid(query):
                match |= Q(id=query)
            rows = rows.filter(match)
        return paginated(
            request,
            self,
            rows,
            OpsRentalBookingSerializer,
            pagination=OperationsNewestFirstPagination,
        )


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
    except ValueError:
        return False
    return True


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

        return Response(
            RentalBookingSerializer(
                _booking_rows().get(id=booking.id), context={"request": request}
            ).data
        )
