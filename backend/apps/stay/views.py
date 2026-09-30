import contextlib
from datetime import date
from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.stay.exceptions import StayStateApiError
from apps.stay.models import Property, StayEnquiry, StayReservation, Unit
from apps.stay.serializers import (
    AddPropertyMediaSerializer,
    CreateEnquirySerializer,
    CreatePropertySerializer,
    CreateReservationSerializer,
    CreateStayReviewSerializer,
    CreateUnitSerializer,
    OpsCancelStayReservationSerializer,
    PartnerPropertySerializer,
    PartnerReservationActionSerializer,
    PartnerUnitSerializer,
    PropertyMediaSerializer,
    PropertySerializer,
    PropertySummarySerializer,
    RespondEnquirySerializer,
    StayEnquirySerializer,
    StayModerationSerializer,
    StayPhotoUploadSerializer,
    StayQuoteRequestSerializer,
    StayQuoteResponseSerializer,
    StayReservationSerializer,
    StayReviewSerializer,
    StayTaxonomySubcategorySerializer,
    UpdatePropertySerializer,
    UpdateUnitSerializer,
)
from apps.stay.services import (
    StayStateError,
    add_property_media,
    calculate_stay_quote,
    cancel_enquiry,
    cancel_reservation,
    cancel_reservation_ops,
    check_in_reservation,
    check_out_reservation,
    confirm_enquiry,
    create_enquiry,
    create_property,
    create_reservation,
    create_stay_review,
    create_unit,
    get_stay_taxonomy,
    host_cancel_reservation,
    initiate_reservation_payment,
    mark_no_show,
    moderate_property,
    partner_owns_stay_photo,
    public_properties,
    remove_property_media,
    respond_enquiry,
    set_property_listing,
    store_stay_photo,
    submit_property,
    update_property_ad,
    update_unit,
)


def _partner(user: Any) -> PartnerProfile:
    return get_object_or_404(PartnerProfile, user=user)


def _raise_domain_error(exc: Exception) -> None:
    if isinstance(exc, PermissionError):
        raise StayStateApiError(reason=str(exc), code="permission_denied") from exc
    code = getattr(exc, "code", "stay_state_invalid")
    raise StayStateApiError(reason=str(exc), code=str(code)) from exc


def _error(exc: Exception) -> Response:
    """Legacy wrapper — prefer raising StayStateApiError via _raise_domain_error."""
    _raise_domain_error(exc)
    raise AssertionError("unreachable")  # pragma: no cover


class StayTaxonomyView(APIView):
    """Category → subcategory → service → variant + property_schema for partner posting."""

    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=StayTaxonomySubcategorySerializer(many=True))
    def get(self, request: Any) -> Response:  # noqa: ARG002
        return Response(get_stay_taxonomy())


class StayBrowseView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("location", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("service", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("sharing_count", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("ac", OpenApiTypes.BOOL, OpenApiParameter.QUERY),
            OpenApiParameter("food", OpenApiTypes.BOOL, OpenApiParameter.QUERY),
            OpenApiParameter("min_price", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("max_price", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("check_in", OpenApiTypes.DATE, OpenApiParameter.QUERY),
            OpenApiParameter("check_out", OpenApiTypes.DATE, OpenApiParameter.QUERY),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("limit", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("offset", OpenApiTypes.INT, OpenApiParameter.QUERY),
        ],
        responses=PropertySummarySerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        sharing_count = request.query_params.get("sharing_count")
        ac_param = request.query_params.get("ac")
        food_param = request.query_params.get("food")
        min_price = request.query_params.get("min_price")
        max_price = request.query_params.get("max_price")
        check_in_raw = request.query_params.get("check_in")
        check_out_raw = request.query_params.get("check_out")
        sort_param = request.query_params.get("sort", "newest")
        limit_raw = request.query_params.get("limit")
        offset_raw = request.query_params.get("offset")

        check_in_date = None
        check_out_date = None
        if check_in_raw:
            with contextlib.suppress(ValueError):
                check_in_date = date.fromisoformat(check_in_raw)
        if check_out_raw:
            with contextlib.suppress(ValueError):
                check_out_date = date.fromisoformat(check_out_raw)

        props = public_properties(
            query=request.query_params.get("q", ""),
            location=request.query_params.get("location", ""),
            sharing_count=(
                int(sharing_count) if sharing_count and sharing_count.isdigit() else None
            ),
            has_ac=True
            if ac_param in ("true", "1", "True")
            else (False if ac_param in ("false", "0", "False") else None),
            food_included=True
            if food_param in ("true", "1", "True")
            else (False if food_param in ("false", "0", "False") else None),
            min_price_paise=int(min_price) if min_price and min_price.isdigit() else None,
            max_price_paise=int(max_price) if max_price and max_price.isdigit() else None,
            variant_code=request.query_params.get("service", ""),
            check_in=check_in_date,
            check_out=check_out_date,
            sort=sort_param,
            limit=int(limit_raw) if limit_raw and limit_raw.isdigit() else None,
            offset=int(offset_raw) if offset_raw and offset_raw.isdigit() else 0,
        )
        return Response(PropertySummarySerializer(props, many=True).data)


class StayQuoteView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(parameters=[StayQuoteRequestSerializer], responses=StayQuoteResponseSerializer)
    def get(self, request: Any) -> Response:
        ser = StayQuoteRequestSerializer(data=request.query_params)
        ser.is_valid(raise_exception=True)
        try:
            quote = calculate_stay_quote(
                property_id=ser.validated_data["property_id"],
                unit_id=ser.validated_data.get("unit_id"),
                check_in=ser.validated_data["check_in"],
                check_out=ser.validated_data["check_out"],
            )
        except (StayStateError, Property.DoesNotExist) as exc:
            return _error(exc)
        return Response(StayQuoteResponseSerializer(quote).data)


class StayDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=PropertySerializer)
    def get(self, _request: Any, property_id: UUID) -> Response:
        prop = get_object_or_404(public_properties(), id=property_id)
        return Response(PropertySerializer(prop).data)


class StayEnquireView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=CreateEnquirySerializer, responses=StayEnquirySerializer)
    def post(self, request: Any) -> Response:
        ser = CreateEnquirySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            enquiry = create_enquiry(
                customer=request.user,
                property_id=data["property_id"],
                unit_id=data.get("unit_id"),
                check_in=data["check_in"],
                check_out=data["check_out"],
                guest_count=data.get("guest_count", 1),
                message=data.get("message", ""),
            )
        except (StayStateError, PermissionError, Property.DoesNotExist) as exc:
            return _error(exc)
        return Response(StayEnquirySerializer(enquiry).data, status=status.HTTP_201_CREATED)


class MyStayEnquiriesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(responses=StayEnquirySerializer(many=True))
    def get(self, request: Any) -> Response:
        rows = StayEnquiry.objects.filter(customer=request.user).select_related("property")
        return Response(StayEnquirySerializer(rows, many=True).data)


class MyStayEnquiryCancelView(APIView):
    """Customer cancels an open stay enquiry."""

    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=None, responses=StayEnquirySerializer)
    def post(self, request: Any, enquiry_id: UUID) -> Response:
        enquiry = get_object_or_404(
            StayEnquiry.objects.select_related("property"),
            id=enquiry_id,
            customer=request.user,
        )
        try:
            enquiry = cancel_enquiry(enquiry=enquiry, actor=request.user, as_host=False)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(StayEnquirySerializer(enquiry).data)


class PartnerEnquiryCancelView(APIView):
    """Host declines/cancels an open enquiry (sets CANCELLED)."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=None, responses=StayEnquirySerializer)
    def post(self, request: Any, enquiry_id: UUID) -> Response:
        partner = _partner(request.user)
        enquiry = get_object_or_404(
            StayEnquiry.objects.select_related("property"),
            id=enquiry_id,
            property__host=partner,
        )
        try:
            enquiry = cancel_enquiry(enquiry=enquiry, actor=partner, as_host=True)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(StayEnquirySerializer(enquiry).data)


class PartnerEnquiryConfirmView(APIView):
    """Host confirms an enquiry and holds the unit calendar."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=None, responses=StayEnquirySerializer)
    def post(self, request: Any, enquiry_id: UUID) -> Response:
        partner = _partner(request.user)
        enquiry = get_object_or_404(
            StayEnquiry.objects.select_related("property", "unit"),
            id=enquiry_id,
            property__host=partner,
        )
        try:
            enquiry = confirm_enquiry(enquiry=enquiry, host=partner)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(StayEnquirySerializer(enquiry).data)


class PartnerStayPhotoUploadView(APIView):
    permission_classes = (IsPartnerUser,)
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(
        request={"multipart/form-data": {"type": "object"}},
        responses={201: StayPhotoUploadSerializer},
    )
    def post(self, request: Any) -> Response:
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Attach a photo file."}, status=status.HTTP_400_BAD_REQUEST)
        partner = _partner(request.user)
        try:
            row = store_stay_photo(partner=partner, upload=upload)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        photo_url = request.build_absolute_uri(row.stored_file.url)
        return Response(
            {
                "upload_id": str(row.id),
                "url": photo_url,
                "original_name": row.original_name,
            },
            status=status.HTTP_201_CREATED,
        )


class PartnerPropertyCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=PartnerPropertySerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = (
            Property.objects.filter(host=partner)
            .prefetch_related("units", "media", "reviews", "variant__a9_configurations")
            .select_related("variant")
        )
        return Response(PartnerPropertySerializer(rows, many=True).data)

    @extend_schema(request=CreatePropertySerializer, responses=PartnerPropertySerializer)
    def post(self, request: Any) -> Response:
        ser = CreatePropertySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        photo_urls = ser.validated_data.get("image_urls") or []
        if not all(partner_owns_stay_photo(partner=partner, url=url) for url in photo_urls):
            return Response(
                {"detail": "Upload photos from this form instead of pasting links."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            prop = create_property(host=partner, **ser.validated_data)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(PartnerPropertySerializer(prop).data, status=status.HTTP_201_CREATED)


class PartnerPropertyActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_stays_property_action",
        request=None,
        responses=PartnerPropertySerializer,
    )
    def post(self, request: Any, property_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id, host=partner)
        try:
            if action in ("submit", "publish"):
                prop = submit_property(prop=prop, host=partner)
            elif action in ("pause", "resume", "archive", "restore"):
                prop = set_property_listing(prop=prop, host=partner, action=action)
            else:
                raise StayStateError("Unknown action.")
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(PartnerPropertySerializer(prop).data)


class PartnerPropertyDetailView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=UpdatePropertySerializer, responses=PartnerPropertySerializer)
    def patch(self, request: Any, property_id: UUID) -> Response:
        ser = UpdatePropertySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id, host=partner)
        payload = dict(ser.validated_data)
        clear_available_from = "available_from" in payload and payload["available_from"] is None
        clear_available_until = "available_until" in payload and payload["available_until"] is None
        try:
            prop = update_property_ad(
                prop=prop,
                host=partner,
                clear_available_from=clear_available_from,
                clear_available_until=clear_available_until,
                **payload,
            )
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(PartnerPropertySerializer(prop).data)


class PartnerUnitCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=PartnerUnitSerializer(many=True))
    def get(self, request: Any, property_id: UUID) -> Response:
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id, host=partner)
        return Response(PartnerUnitSerializer(prop.units.all(), many=True).data)

    @extend_schema(request=CreateUnitSerializer, responses=PartnerUnitSerializer)
    def post(self, request: Any, property_id: UUID) -> Response:
        ser = CreateUnitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id, host=partner)
        try:
            unit = create_unit(prop=prop, host=partner, **ser.validated_data)
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(PartnerUnitSerializer(unit).data, status=status.HTTP_201_CREATED)


class PartnerUnitDetailView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=UpdateUnitSerializer, responses=PartnerUnitSerializer)
    def patch(self, request: Any, unit_id: UUID) -> Response:
        ser = UpdateUnitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        unit = get_object_or_404(
            Unit.objects.select_related("property"), id=unit_id, property__host=partner
        )
        try:
            unit = update_unit(unit=unit, host=partner, **ser.validated_data)
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(PartnerUnitSerializer(unit).data)


class PartnerEnquiryCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=StayEnquirySerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = StayEnquiry.objects.filter(property__host=partner).select_related("property")
        return Response(StayEnquirySerializer(rows, many=True).data)


class PartnerEnquiryRespondView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=RespondEnquirySerializer, responses=StayEnquirySerializer)
    def post(self, request: Any, enquiry_id: UUID) -> Response:
        ser = RespondEnquirySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        enquiry = get_object_or_404(StayEnquiry, id=enquiry_id, property__host=partner)
        try:
            enquiry = respond_enquiry(
                enquiry=enquiry,
                host=partner,
                response=ser.validated_data["response"],
                decline=ser.validated_data.get("decline", False),
            )
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(StayEnquirySerializer(enquiry).data)


class OpsStayCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=PropertySerializer(many=True))
    def get(self, _request: Any) -> Response:
        rows = (
            Property.objects.all()
            .prefetch_related("units", "media", "reviews", "variant__a9_configurations")
            .select_related("host", "variant")
        )
        return Response(PropertySerializer(rows, many=True).data)


class OpsStayModerateView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(request=StayModerationSerializer, responses=PropertySerializer)
    def post(self, request: Any, property_id: UUID) -> Response:
        ser = StayModerationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        prop = get_object_or_404(Property, id=property_id)
        try:
            prop = moderate_property(
                prop=prop,
                actor=request.user,
                action=ser.validated_data["action"],
                reason=ser.validated_data["reason"],
            )
        except StayStateError as exc:
            return _error(exc)
        return Response(PropertySerializer(prop).data)


class StayReserveView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=CreateReservationSerializer, responses=StayReservationSerializer)
    def post(self, request: Any) -> Response:
        ser = CreateReservationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            res = create_reservation(
                customer=request.user,
                property_id=data["property_id"],
                unit_id=data["unit_id"],
                check_in=data["check_in"],
                check_out=data["check_out"],
                guest_count=data.get("guest_count", 1),
            )
            initiate_reservation_payment(res.id)
            res.refresh_from_db()
        except (StayStateError, PermissionError, Property.DoesNotExist, Unit.DoesNotExist) as exc:
            return _error(exc)
        return Response(StayReservationSerializer(res).data, status=status.HTTP_201_CREATED)


class MyStayReservationsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(responses=StayReservationSerializer(many=True))
    def get(self, request: Any) -> Response:
        rows = StayReservation.objects.filter(customer=request.user).select_related(
            "property", "unit", "customer"
        )
        return Response(StayReservationSerializer(rows, many=True).data)


class MyStayReservationCancelView(APIView):
    """Customer cancel pre-check-in. Paid reservations trigger an automatic refund path."""

    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=None, responses=StayReservationSerializer)
    def post(self, request: Any, reservation_id: UUID) -> Response:
        res = get_object_or_404(
            StayReservation.objects.select_related(
                "property", "unit", "customer", "payment_attempt", "unit_reservation"
            ),
            id=reservation_id,
            customer=request.user,
        )
        reason = ""
        if isinstance(request.data, dict):
            reason = str(request.data.get("reason") or "")
        try:
            res = cancel_reservation(reservation=res, customer=request.user, reason=reason)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        res = StayReservation.objects.select_related("property", "unit", "customer").get(id=res.id)
        return Response(StayReservationSerializer(res).data)


class PartnerReservationCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=StayReservationSerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = StayReservation.objects.filter(property__host=partner).select_related(
            "property", "unit", "customer"
        )
        return Response(StayReservationSerializer(rows, many=True).data)


class PartnerReservationActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        description="`action` is `check_in`, `check_out`, `no_show` or `cancel`. Cancelling needs "
        "a `reason`, which is shown to the guest; the guest is refunded in full.",
        request=PartnerReservationActionSerializer,
        responses=StayReservationSerializer,
    )
    def post(self, request: Any, reservation_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        res = get_object_or_404(StayReservation, id=reservation_id, property__host=partner)
        ser = PartnerReservationActionSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        try:
            if action == "check_in":
                res = check_in_reservation(reservation=res, host=partner)
            elif action == "check_out":
                res = check_out_reservation(reservation=res, host=partner)
            elif action == "no_show":
                res = mark_no_show(reservation=res, host=partner)
            elif action == "cancel":
                res = host_cancel_reservation(
                    reservation=res, host=partner, reason=ser.validated_data["reason"]
                )
            else:
                raise StayStateError("Unknown action.")
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(StayReservationSerializer(res).data)


class OpsStayEnquiriesView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=StayEnquirySerializer(many=True))
    def get(self, _request: Any) -> Response:
        rows = StayEnquiry.objects.all().select_related("property", "unit")
        return Response(StayEnquirySerializer(rows, many=True).data)


class OpsStayReservationsView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(responses=StayReservationSerializer(many=True))
    def get(self, _request: Any) -> Response:
        rows = StayReservation.objects.all().select_related("property", "unit", "customer")
        return Response(StayReservationSerializer(rows, many=True).data)


class StayReviewCreateView(APIView):
    """Customer submits a review for a stay they experienced."""

    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        request=CreateStayReviewSerializer,
        responses={201: StayReviewSerializer},
    )
    def post(self, request: Any) -> Response:
        ser = CreateStayReviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            review = create_stay_review(
                customer=request.user,
                property_id=data["property_id"],
                rating=data["rating"],
                body=data.get("body") or data.get("comment") or "",
                enquiry_id=data.get("enquiry_id"),
                reservation_id=data.get("reservation_id"),
                image_urls=data.get("image_urls"),
            )
        except (
            StayStateError,
            Property.DoesNotExist,
            StayEnquiry.DoesNotExist,
            StayReservation.DoesNotExist,
        ) as exc:
            return _error(exc)
        return Response(StayReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class PartnerPropertyMediaCreateView(APIView):
    """Partner adds photos to an existing property."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=AddPropertyMediaSerializer, responses={201: PropertyMediaSerializer})
    def post(self, request: Any, property_id: UUID) -> Response:
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id)
        ser = AddPropertyMediaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            media = add_property_media(
                prop=prop,
                host=partner,
                url=ser.validated_data["url"],
                caption=ser.validated_data.get("caption", ""),
                display_order=ser.validated_data.get("display_order", 0),
            )
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(PropertyMediaSerializer(media).data, status=status.HTTP_201_CREATED)


class PartnerPropertyMediaDeleteView(APIView):
    """Partner removes a photo from an existing property."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(responses={204: None})
    def delete(self, request: Any, property_id: UUID, media_id: UUID) -> Response:
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id)
        try:
            remove_property_media(prop=prop, host=partner, media_id=media_id)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OpsStayReservationCancelView(APIView):
    """Operations cancels an active stay reservation with full refund and audit trail."""

    permission_classes = (IsOperationsUser,)

    @extend_schema(request=OpsCancelStayReservationSerializer, responses=StayReservationSerializer)
    def post(self, request: Any, reservation_id: UUID) -> Response:
        ser = OpsCancelStayReservationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            res = cancel_reservation_ops(
                reservation_id=reservation_id,
                actor=request.user,
                reason=ser.validated_data.get("reason", ""),
            )
        except (StayStateError, StayReservation.DoesNotExist) as exc:
            return _error(exc)
        return Response(StayReservationSerializer(res).data)
