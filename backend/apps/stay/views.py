from contextlib import suppress
from typing import Any
from uuid import UUID

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.slugs import lookup_by_slug_or_id
from apps.locations.nearby import NEARBY_PARAMETERS, point_from
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.stay.exceptions import StayStateApiError
from apps.stay.models import (
    Property,
    Room,
    RoomLook,
    StayEnquiry,
    StayReservation,
    StaySubscriptionPlan,
    StayVisit,
    Unit,
)
from apps.stay.serializers import (
    AddLookMediaSerializer,
    AddPropertyMediaSerializer,
    AddRoomSerializer,
    AddUnitMediaSerializer,
    ConfirmEnquirySerializer,
    CreateEnquirySerializer,
    CreateLookSerializer,
    CreatePropertySerializer,
    CreateReservationSerializer,
    CreateStayReviewSerializer,
    CreateUnitSerializer,
    CreateVisitSerializer,
    DeclineVisitSerializer,
    HostStaySummarySerializer,
    HostSubscriptionStatusSerializer,
    MarkRoomBookedSerializer,
    OpsCancelStayReservationSerializer,
    OpsCreateStaySubscriptionPlanSerializer,
    OpsUpdateStaySubscriptionPlanSerializer,
    PartnerPropertySerializer,
    PartnerReservationActionSerializer,
    PartnerStayEnquirySerializer,
    PartnerStayVisitSerializer,
    PartnerUnitSerializer,
    PropertyMediaSerializer,
    PropertySerializer,
    PropertySummarySerializer,
    RespondEnquirySerializer,
    RoomLookSerializer,
    RoomSerializer,
    SetVisitingHoursSerializer,
    StartStaySubscriptionPurchaseSerializer,
    StayEnquirySerializer,
    StayModerationSerializer,
    StayPhotoUploadSerializer,
    StayQuoteRequestSerializer,
    StayQuoteResponseSerializer,
    StayReservationSerializer,
    StayReviewPhotoUploadSerializer,
    StayReviewSerializer,
    StaySubscriptionPlanSerializer,
    StaySubscriptionSerializer,
    StayTaxonomySubcategorySerializer,
    StayVisitSerializer,
    UnitMediaSerializer,
    UpdateLookSerializer,
    UpdatePropertySerializer,
    UpdateRoomSerializer,
    UpdateUnitSerializer,
    VisitAvailabilityDaySerializer,
    unit_looks,
)
from apps.stay.services import (
    StayStateError,
    _active_stay_subscription,
    add_property_media,
    add_room,
    add_unit_media,
    calculate_stay_quote,
    cancel_enquiry,
    cancel_reservation,
    cancel_reservation_ops,
    check_in_reservation,
    check_out_reservation,
    confirm_enquiry,
    create_enquiry,
    create_look,
    create_property,
    create_reservation,
    create_stay_review,
    create_unit,
    delete_look,
    delete_room,
    get_stay_taxonomy,
    host_cancel_reservation,
    host_stay_summary,
    initiate_reservation_payment,
    mark_no_show,
    mark_room_booked,
    moderate_property,
    move_room,
    partner_owns_stay_photo,
    public_properties,
    release_room,
    remove_property_media,
    remove_unit_media,
    rename_look,
    rename_room,
    respond_enquiry,
    set_property_listing,
    set_room_available,
    start_stay_subscription_purchase,
    store_stay_photo,
    store_stay_review_photo,
    submit_property,
    update_property_ad,
    update_unit,
)
from apps.stay.visits import (
    accept_visit,
    cancel_visit,
    decline_visit,
    request_visit,
    set_visiting_hours,
    visit_availability,
)
from common.pagination import (
    CURSOR_PARAMETER,
    STATUS_PARAMETER,
    NewestFirstPagination,
    OperationsNewestFirstPagination,
    browse_window,
    filter_statuses,
    page_serializer,
    paginated,
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
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("limit", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("offset", OpenApiTypes.INT, OpenApiParameter.QUERY),
            *NEARBY_PARAMETERS,
        ],
        responses=PropertySummarySerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        sharing_count = request.query_params.get("sharing_count")
        ac_param = request.query_params.get("ac")
        food_param = request.query_params.get("food")
        min_price = request.query_params.get("min_price")
        max_price = request.query_params.get("max_price")
        sort_param = request.query_params.get("sort", "newest")
        limit, offset = browse_window(request)

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
            sort=sort_param,
            near=point_from(request),
            limit=limit,
            offset=offset,
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
                check_out=ser.validated_data.get("check_out"),
                length=ser.validated_data.get("length"),
            )
        except (StayStateError, Property.DoesNotExist) as exc:
            return _error(exc)
        return Response(StayQuoteResponseSerializer(quote).data)


class StayDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(responses=PropertySerializer)
    def get(self, request: Any, key: str) -> Response:
        """``key`` is the page slug; an old link's property id still works."""
        prop = get_object_or_404(public_properties(), **lookup_by_slug_or_id(key))
        return Response(PropertySerializer(prop, context={"request": request}).data)


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
                look_id=data.get("look_id"),
                check_in=data["check_in"],
                check_out=data.get("check_out"),
                length=data.get("length"),
                guest_count=data.get("guest_count", 1),
                message=data.get("message", ""),
            )
        except (StayStateError, PermissionError, Property.DoesNotExist) as exc:
            return _error(exc)
        enquiry = StayEnquiry.objects.select_related("property__host__user", "unit").get(
            id=enquiry.id
        )
        return Response(StayEnquirySerializer(enquiry).data, status=status.HTTP_201_CREATED)


class VisitSchedulePagination(NewestFirstPagination):
    """A host's visits in the order they happen, so the next one is at the top of page one."""

    ordering = ("visit_date", "start_time", "id")


class MyStayEnquiriesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        parameters=[CURSOR_PARAMETER],
        responses=page_serializer(StayEnquirySerializer, "StayEnquiryPage"),
    )
    def get(self, request: Any) -> Response:
        rows = StayEnquiry.objects.filter(customer=request.user).select_related(
            "property__host__user", "unit"
        )
        return paginated(request, self, rows, StayEnquirySerializer)


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

    @extend_schema(request=None, responses=PartnerStayEnquirySerializer)
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
        return Response(PartnerStayEnquirySerializer(enquiry).data)


class PartnerEnquiryConfirmView(APIView):
    """Host marks an enquiry as booked after calling the guest, optionally naming the room."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=ConfirmEnquirySerializer, responses=PartnerStayEnquirySerializer)
    def post(self, request: Any, enquiry_id: UUID) -> Response:
        ser = ConfirmEnquirySerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        enquiry = get_object_or_404(
            StayEnquiry.objects.select_related("property", "unit"),
            id=enquiry_id,
            property__host=partner,
        )
        try:
            enquiry = confirm_enquiry(
                enquiry=enquiry, host=partner, room_id=ser.validated_data.get("room_id")
            )
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(PartnerStayEnquirySerializer(enquiry).data)


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
            .prefetch_related(
                "units__rooms",
                "units__media",
                "units__looks__media",
                "media",
                "reviews",
                "visit_slots",
                "variant__a9_configurations",
            )
            .select_related("variant__service__subcategory")
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
        try:
            prop = update_property_ad(prop=prop, host=partner, **ser.validated_data)
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


class PartnerUnitMediaCreateView(APIView):
    """Partner adds a photo of a room type (uploaded first through the stay photo upload)."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=AddUnitMediaSerializer, responses={201: UnitMediaSerializer})
    def post(self, request: Any, unit_id: UUID) -> Response:
        ser = AddUnitMediaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        unit = get_object_or_404(
            Unit.objects.select_related("property"), id=unit_id, property__host=partner
        )
        try:
            media = add_unit_media(unit=unit, host=partner, url=ser.validated_data["url"])
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(UnitMediaSerializer(media).data, status=status.HTTP_201_CREATED)


class PartnerUnitMediaDeleteView(APIView):
    """Partner removes a photo from a room type."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(responses={204: None})
    def delete(self, request: Any, unit_id: UUID, media_id: UUID) -> Response:
        partner = _partner(request.user)
        unit = get_object_or_404(
            Unit.objects.select_related("property"), id=unit_id, property__host=partner
        )
        try:
            remove_unit_media(unit=unit, host=partner, media_id=media_id)
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _partner_look(partner: Any, look_id: UUID) -> RoomLook:
    return get_object_or_404(
        RoomLook.objects.select_related("unit__property"),
        id=look_id,
        unit__property__host=partner,
    )


def _look_payload(look: RoomLook) -> dict[str, Any]:
    unit = Unit.objects.prefetch_related("looks__media", "rooms").get(id=look.unit_id)
    row = next(x for x in unit_looks(unit) if x["id"] == look.id)
    return dict(RoomLookSerializer(row).data)


class PartnerUnitLookCollectionView(APIView):
    """Add a look (a named photo set) to a room type. Rooms join it from the room screens."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=CreateLookSerializer, responses={201: RoomLookSerializer})
    def post(self, request: Any, unit_id: UUID) -> Response:
        ser = CreateLookSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        unit = get_object_or_404(
            Unit.objects.select_related("property"), id=unit_id, property__host=partner
        )
        try:
            look = create_look(
                unit=unit,
                host=partner,
                name=ser.validated_data["name"],
                image_urls=ser.validated_data["image_urls"],
            )
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(_look_payload(look), status=status.HTTP_201_CREATED)


class PartnerLookDetailView(APIView):
    """Rename a look, or remove an empty one."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=UpdateLookSerializer, responses=RoomLookSerializer)
    def patch(self, request: Any, look_id: UUID) -> Response:
        ser = UpdateLookSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        look = _partner_look(partner, look_id)
        try:
            look = rename_look(look=look, host=partner, name=ser.validated_data["name"])
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(_look_payload(look))

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Any, look_id: UUID) -> Response:
        partner = _partner(request.user)
        look = _partner_look(partner, look_id)
        try:
            delete_look(look=look, host=partner)
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerLookMediaCreateView(APIView):
    """Add a photo to one look. Removing uses the room type's photo delete."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=AddLookMediaSerializer, responses={201: UnitMediaSerializer})
    def post(self, request: Any, look_id: UUID) -> Response:
        ser = AddLookMediaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        look = _partner_look(partner, look_id)
        try:
            media = add_unit_media(
                unit=look.unit, host=partner, url=ser.validated_data["url"], look=look
            )
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(UnitMediaSerializer(media).data, status=status.HTTP_201_CREATED)


class PartnerEnquiryCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        parameters=[STATUS_PARAMETER, CURSOR_PARAMETER],
        responses=page_serializer(PartnerStayEnquirySerializer, "PartnerStayEnquiryPage"),
    )
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = StayEnquiry.objects.filter(property__host=partner).select_related(
            "property", "unit", "customer"
        )
        rows = filter_statuses(rows, request, StayEnquiry.Status.values)
        return paginated(request, self, rows, PartnerStayEnquirySerializer)


class PartnerEnquiryRespondView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=RespondEnquirySerializer, responses=PartnerStayEnquirySerializer)
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
        return Response(PartnerStayEnquirySerializer(enquiry).data)


class OpsStayCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "moderation_status",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                description="e.g. PENDING for the review queue.",
            ),
            CURSOR_PARAMETER,
        ],
        responses=page_serializer(PropertySerializer, "PropertyPage"),
    )
    def get(self, request: Any) -> Response:
        rows = (
            Property.objects.all()
            .prefetch_related(
                "units__media",
                "units__looks__media",
                "units__rooms",
                "media",
                "reviews",
                "variant__a9_configurations",
            )
            .select_related("host__user", "variant")
        )
        wanted = (request.query_params.get("moderation_status") or "").strip().upper()
        if wanted:
            if wanted not in Property.ModerationStatus.values:
                raise ValidationError({"moderation_status": ["That is not a listing status."]})
            rows = rows.filter(moderation_status=wanted)
        return paginated(
            request, self, rows, PropertySerializer, pagination=OperationsNewestFirstPagination
        )


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

    @extend_schema(
        parameters=[CURSOR_PARAMETER],
        responses=page_serializer(StayReservationSerializer, "StayReservationPage"),
    )
    def get(self, request: Any) -> Response:
        rows = StayReservation.objects.filter(customer=request.user).select_related(
            "property", "unit", "customer"
        )
        return paginated(request, self, rows, StayReservationSerializer)


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

    @extend_schema(
        parameters=[STATUS_PARAMETER, CURSOR_PARAMETER],
        responses=page_serializer(StayReservationSerializer, "PartnerStayReservationPage"),
    )
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = StayReservation.objects.filter(property__host=partner).select_related(
            "property", "unit", "customer"
        )
        rows = filter_statuses(rows, request, StayReservation.Status.values)
        return paginated(request, self, rows, StayReservationSerializer)


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

    @extend_schema(
        parameters=[CURSOR_PARAMETER],
        responses=page_serializer(StayEnquirySerializer, "OpsStayEnquiryPage"),
    )
    def get(self, request: Any) -> Response:
        rows = StayEnquiry.objects.all().select_related("property", "unit")
        return paginated(
            request, self, rows, StayEnquirySerializer, pagination=OperationsNewestFirstPagination
        )


class OpsStayReservationsView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter(
                "q",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                description="Guest name or phone, property title, or a reservation id.",
            ),
            CURSOR_PARAMETER,
        ],
        responses=page_serializer(StayReservationSerializer, "OpsStayReservationPage"),
    )
    def get(self, request: Any) -> Response:
        rows = StayReservation.objects.all().select_related("property", "unit", "customer")
        wanted = (request.query_params.get("status") or "").strip().upper()
        if wanted:
            if wanted not in StayReservation.Status.values:
                raise ValidationError({"status": ["That is not a reservation status."]})
            rows = rows.filter(status=wanted)
        query = (request.query_params.get("q") or "").strip()
        if query:
            match = (
                Q(customer__full_name__icontains=query)
                | Q(customer__phone_number__icontains=query)
                | Q(property__title__icontains=query)
            )
            with suppress(ValueError):
                match |= Q(id=UUID(query))
            rows = rows.filter(match)
        return paginated(
            request,
            self,
            rows,
            StayReservationSerializer,
            pagination=OperationsNewestFirstPagination,
        )


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


class StayReviewPhotoUploadView(APIView):
    """A guest uploads one photo for a review (JPEG, PNG or WebP, up to 10 MB)."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(
        request={"multipart/form-data": {"type": "object"}},
        responses={201: StayReviewPhotoUploadSerializer},
    )
    def post(self, request: Any) -> Response:
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Attach a photo file."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            row = store_stay_review_photo(customer=request.user, upload=upload)
        except StayStateError as exc:
            return _error(exc)
        return Response(
            {"upload_id": str(row.id), "url": request.build_absolute_uri(row.stored_file.url)},
            status=status.HTTP_201_CREATED,
        )


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


# --- numbered rooms and the host's summary --------------------------------------------------


def _partner_room(partner: PartnerProfile, room_id: UUID) -> Room:
    return get_object_or_404(
        Room.objects.select_related("property", "unit"), id=room_id, property__host=partner
    )


class PartnerStaySummaryView(APIView):
    """The numbers at the top of the host's stays dashboard."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=HostStaySummarySerializer)
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        return Response(HostStaySummarySerializer(host_stay_summary(host=partner)).data)


class PartnerUnitRoomCollectionView(APIView):
    """Add one numbered room to a room type."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=AddRoomSerializer, responses={201: RoomSerializer})
    def post(self, request: Any, unit_id: UUID) -> Response:
        ser = AddRoomSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        unit = get_object_or_404(
            Unit.objects.select_related("property"), id=unit_id, property__host=partner
        )
        try:
            new_look = ser.validated_data.get("new_look")
            room = add_room(
                unit=unit,
                host=partner,
                number=ser.validated_data["number"],
                available=ser.validated_data["available"],
                look_id=ser.validated_data.get("look_id"),
                new_look_name=new_look["name"] if new_look else None,
                new_look_image_urls=new_look.get("image_urls", []) if new_look else None,
            )
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RoomSerializer(room).data, status=status.HTTP_201_CREATED)


class PartnerRoomDetailView(APIView):
    """Rename a room, switch it on or off, or remove it."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=UpdateRoomSerializer, responses=RoomSerializer)
    def patch(self, request: Any, room_id: UUID) -> Response:
        ser = UpdateRoomSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        room = _partner_room(partner, room_id)
        try:
            if "number" in ser.validated_data:
                room = rename_room(room=room, host=partner, number=ser.validated_data["number"])
            if "available" in ser.validated_data:
                room = set_room_available(
                    room=room, host=partner, available=ser.validated_data["available"]
                )
            if "look_id" in ser.validated_data:
                room = move_room(room=room, host=partner, look_id=ser.validated_data["look_id"])
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RoomSerializer(room).data)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Any, room_id: UUID) -> Response:
        partner = _partner(request.user)
        room = _partner_room(partner, room_id)
        try:
            delete_room(room=room, host=partner)
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerRoomActionView(APIView):
    """``book``: mark the room Booked. ``release``: the guest left; it is available again."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_stays_room_action",
        request=MarkRoomBookedSerializer,
        responses=RoomSerializer,
    )
    def post(self, request: Any, room_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        room = _partner_room(partner, room_id)
        try:
            if action == "book":
                ser = MarkRoomBookedSerializer(data=request.data or {})
                ser.is_valid(raise_exception=True)
                visit_id = ser.validated_data.get("visit_id")
                visit = (
                    get_object_or_404(
                        StayVisit.objects.select_related("customer"),
                        id=visit_id,
                        property__host=partner,
                    )
                    if visit_id
                    else None
                )
                room = mark_room_booked(
                    room=room,
                    host=partner,
                    occupant_name=ser.validated_data["occupant_name"],
                    visit=visit,
                )
            elif action == "release":
                room = release_room(room=room, host=partner)
            else:
                raise StayStateError("Unknown action.")
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(RoomSerializer(room).data)


# --- visits ---------------------------------------------------------------------------------


class PartnerVisitingHoursView(APIView):
    """Replace a property's weekly visiting slots, blocked days and visits switch."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(request=SetVisitingHoursSerializer, responses=PartnerPropertySerializer)
    def put(self, request: Any, property_id: UUID) -> Response:
        ser = SetVisitingHoursSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id, host=partner)
        try:
            prop = set_visiting_hours(
                prop=prop,
                host=partner,
                visits_enabled=ser.validated_data["visits_enabled"],
                slots=ser.validated_data["slots"],
                blocked_dates=ser.validated_data["blocked_dates"],
            )
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(PartnerPropertySerializer(prop).data)


class StayVisitAvailabilityView(APIView):
    """The days and slots a guest can pick for a visit, for the next two weeks by default."""

    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        parameters=[OpenApiParameter("days", OpenApiTypes.INT, OpenApiParameter.QUERY)],
        responses=VisitAvailabilityDaySerializer(many=True),
    )
    def get(self, request: Any, property_id: UUID) -> Response:
        prop = get_object_or_404(public_properties(), id=property_id)
        days_raw = request.query_params.get("days", "")
        days = min(int(days_raw), 30) if days_raw.isdigit() else 14
        rows: Any = visit_availability(prop=prop, days=days)
        return Response(VisitAvailabilityDaySerializer(rows, many=True).data)


class StayVisitCreateView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=CreateVisitSerializer, responses={201: StayVisitSerializer})
    def post(self, request: Any) -> Response:
        ser = CreateVisitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            visit = request_visit(
                customer=request.user,
                property_id=data["property_id"],
                slot_id=data["slot_id"],
                visit_date=data["visit_date"],
                unit_id=data.get("unit_id"),
                look_id=data.get("look_id"),
                message=data.get("message", ""),
            )
        except (StayStateError, PermissionError, Property.DoesNotExist) as exc:
            _raise_domain_error(exc)
        return Response(StayVisitSerializer(visit).data, status=status.HTTP_201_CREATED)


class MyStayVisitsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        parameters=[CURSOR_PARAMETER],
        responses=page_serializer(StayVisitSerializer, "StayVisitPage"),
    )
    def get(self, request: Any) -> Response:
        rows = StayVisit.objects.filter(customer=request.user).select_related(
            "property__host__user", "unit"
        )
        return paginated(request, self, rows, StayVisitSerializer)


class MyStayVisitCancelView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(request=None, responses=StayVisitSerializer)
    def post(self, request: Any, visit_id: UUID) -> Response:
        visit = get_object_or_404(StayVisit, id=visit_id, customer=request.user)
        try:
            visit = cancel_visit(visit=visit, customer=request.user)
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(StayVisitSerializer(visit).data)


class PartnerVisitCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(
        parameters=[STATUS_PARAMETER, CURSOR_PARAMETER],
        responses=page_serializer(PartnerStayVisitSerializer, "PartnerStayVisitPage"),
    )
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = StayVisit.objects.filter(property__host=partner).select_related(
            "property__host__user", "unit", "customer"
        )
        rows = filter_statuses(rows, request, StayVisit.Status.values)
        return paginated(
            request, self, rows, PartnerStayVisitSerializer, pagination=VisitSchedulePagination
        )


class PartnerVisitActionView(APIView):
    """``accept`` or ``decline`` (with an optional reason) a visit request."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_stays_visit_action",
        request=DeclineVisitSerializer,
        responses=PartnerStayVisitSerializer,
    )
    def post(self, request: Any, visit_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        visit = get_object_or_404(
            StayVisit.objects.select_related("property"), id=visit_id, property__host=partner
        )
        try:
            if action == "accept":
                visit = accept_visit(visit=visit, host=partner)
            elif action == "decline":
                ser = DeclineVisitSerializer(data=request.data or {})
                ser.is_valid(raise_exception=True)
                visit = decline_visit(
                    visit=visit,
                    host=partner,
                    reason=ser.validated_data["reason"],
                    note=ser.validated_data["note"],
                )
            else:
                raise StayStateError("Unknown action.")
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(PartnerStayVisitSerializer(visit).data)


class OpsStaySubscriptionPlanCollectionView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        operation_id="ops_stay_subscription_plans_list",
        responses=StaySubscriptionPlanSerializer(many=True),
    )
    def get(self, _request: Any) -> Response:
        plans = StaySubscriptionPlan.objects.all().order_by("price_paise")
        return Response(StaySubscriptionPlanSerializer(plans, many=True).data)

    @extend_schema(
        operation_id="ops_stay_subscription_plans_create",
        request=OpsCreateStaySubscriptionPlanSerializer,
        responses={201: StaySubscriptionPlanSerializer},
    )
    def post(self, request: Any) -> Response:
        ser = OpsCreateStaySubscriptionPlanSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plan = ser.save()
        return Response(StaySubscriptionPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class OpsStaySubscriptionPlanDetailView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        operation_id="ops_stay_subscription_plans_retrieve",
        responses=StaySubscriptionPlanSerializer,
    )
    def get(self, _request: Any, plan_id: UUID) -> Response:
        plan = get_object_or_404(StaySubscriptionPlan, id=plan_id)
        return Response(StaySubscriptionPlanSerializer(plan).data)

    @extend_schema(
        operation_id="ops_stay_subscription_plans_update",
        request=OpsUpdateStaySubscriptionPlanSerializer,
        responses=StaySubscriptionPlanSerializer,
    )
    def patch(self, request: Any, plan_id: UUID) -> Response:
        plan = get_object_or_404(StaySubscriptionPlan, id=plan_id)
        ser = OpsUpdateStaySubscriptionPlanSerializer(plan, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        plan = ser.save()
        return Response(StaySubscriptionPlanSerializer(plan).data)

    @extend_schema(
        operation_id="ops_stay_subscription_plans_delete",
        responses={204: None},
    )
    def delete(self, _request: Any, plan_id: UUID) -> Response:
        plan = get_object_or_404(StaySubscriptionPlan, id=plan_id)
        plan.is_active = False
        plan.save(update_fields=("is_active", "updated_at"))
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerStaySubscriptionView(APIView):
    """Host views current subscription and available tiers, or starts an upgrade."""

    permission_classes = (IsPartnerUser,)

    @extend_schema(
        operation_id="partner_stays_subscription_get",
        responses=HostSubscriptionStatusSerializer,
    )
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        sub = _active_stay_subscription(partner)
        plans = StaySubscriptionPlan.objects.filter(is_active=True).order_by("price_paise")
        live_count = Property.objects.filter(
            host=partner,
            moderation_status=Property.ModerationStatus.APPROVED,
            listing_status=Property.ListingStatus.LIVE,
        ).count()
        max_props = sub.plan.max_properties if sub else 0
        data = {
            "subscription": StaySubscriptionSerializer(sub).data if sub else None,
            "available_plans": StaySubscriptionPlanSerializer(plans, many=True).data,
            "live_properties_count": live_count,
            "max_properties": max_props,
        }
        return Response(HostSubscriptionStatusSerializer(data).data)

    @extend_schema(
        operation_id="partner_stays_subscription_purchase",
        request=StartStaySubscriptionPurchaseSerializer,
        responses={201: StaySubscriptionSerializer},
    )
    def post(self, request: Any) -> Response:
        partner = _partner(request.user)
        ser = StartStaySubscriptionPurchaseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        plan = get_object_or_404(
            StaySubscriptionPlan, id=ser.validated_data["plan_id"], is_active=True
        )
        idempotency_key = (
            request.headers.get("Idempotency-Key")
            or f"stay-sub:{partner.id}:{plan.id}:{timezone.now().timestamp()}"
        )
        try:
            sub = start_stay_subscription_purchase(
                host=partner, plan=plan, idempotency_key=str(idempotency_key)
            )
        except (StayStateError, PermissionError) as exc:
            _raise_domain_error(exc)
        return Response(StaySubscriptionSerializer(sub).data, status=status.HTTP_201_CREATED)
