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
from apps.stay.models import Property, StayEnquiry
from apps.stay.serializers import (
    CreateEnquirySerializer,
    CreatePropertySerializer,
    PropertySerializer,
    RespondEnquirySerializer,
    StayEnquirySerializer,
    StayModerationSerializer,
    StayQuoteRequestSerializer,
    StayQuoteResponseSerializer,
)
from apps.stay.services import (
    StayStateError,
    calculate_stay_quote,
    create_enquiry,
    create_property,
    moderate_property,
    public_properties,
    respond_enquiry,
    submit_property,
)


def _partner(user: Any) -> PartnerProfile:
    return get_object_or_404(PartnerProfile, user=user)


def _error(exc: Exception) -> Response:
    code = status.HTTP_400_BAD_REQUEST
    if isinstance(exc, PermissionError):
        code = status.HTTP_403_FORBIDDEN
    return Response({"detail": str(exc)}, status=code)


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
            OpenApiParameter("limit", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("offset", OpenApiTypes.INT, OpenApiParameter.QUERY),
        ],
        responses=PropertySerializer(many=True),
    )
    def get(self, request: Any) -> Response:
        sharing_count = request.query_params.get("sharing_count")
        ac_param = request.query_params.get("ac")
        food_param = request.query_params.get("food")
        min_price = request.query_params.get("min_price")
        max_price = request.query_params.get("max_price")
        limit_raw = request.query_params.get("limit")
        offset_raw = request.query_params.get("offset")

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
            limit=int(limit_raw) if limit_raw and limit_raw.isdigit() else None,
            offset=int(offset_raw) if offset_raw and offset_raw.isdigit() else 0,
        )
        return Response(PropertySerializer(props, many=True).data)


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


class PartnerPropertyCollectionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(responses=PropertySerializer(many=True))
    def get(self, request: Any) -> Response:
        partner = _partner(request.user)
        rows = Property.objects.filter(host=partner).prefetch_related("units")
        return Response(PropertySerializer(rows, many=True).data)

    @extend_schema(request=CreatePropertySerializer, responses=PropertySerializer)
    def post(self, request: Any) -> Response:
        ser = CreatePropertySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        partner = _partner(request.user)
        try:
            prop = create_property(host=partner, **ser.validated_data)
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(PropertySerializer(prop).data, status=status.HTTP_201_CREATED)


class PartnerPropertyActionView(APIView):
    permission_classes = (IsPartnerUser,)

    @extend_schema(request=None, responses=PropertySerializer)
    def post(self, request: Any, property_id: UUID, action: str) -> Response:
        partner = _partner(request.user)
        prop = get_object_or_404(Property, id=property_id, host=partner)
        try:
            if action == "submit":
                prop = submit_property(prop=prop, host=partner)
            else:
                raise StayStateError("Unknown action.")
        except (StayStateError, PermissionError) as exc:
            return _error(exc)
        return Response(PropertySerializer(prop).data)


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
        rows = Property.objects.all().prefetch_related("units").select_related("host")
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
