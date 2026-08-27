"""Phase A: the vendor price book — Operations' catalog and policy, the Partner's own rate book.

Thin, like every other view in this package: every write delegates to
`apps.requirements.price_book`, and this file only authorises the actor, resolves the record they
are allowed to see, and translates a domain refusal into the standard error envelope.
"""

import uuid
from typing import cast

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.requirements import price_book
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import (
    CustomWorkItemReview,
    QuoteGuardrailPolicy,
    WorkItem,
    WorkItemRate,
)
from apps.requirements.serializers import (
    CustomWorkItemReviewListSerializer,
    CustomWorkItemReviewResolveSerializer,
    CustomWorkItemReviewSerializer,
    PartnerRateItemSerializer,
    PartnerRateItemSetSerializer,
    PriceBookListSerializer,
    QuoteGuardrailPolicyActivateSerializer,
    QuoteGuardrailPolicySerializer,
    WorkItemCreateSerializer,
    WorkItemRatePublishSerializer,
    WorkItemRateSerializer,
    WorkItemSerializer,
    WorkItemUpdateSerializer,
)
from apps.requirements.views.base import _partner_profile, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.throttling import ThrottledWriteMixin


def _partner_service_area(*, request: Request) -> ServiceArea:
    """The service area a Partner's rate-book request applies to.

    `?service_area_id=` when the Partner serves more than one city; otherwise their sole active
    area. A Partner with no active service area at all has nothing to price against — that reads
    as `m2_requirement_not_found` rather than an empty price book, because there is no such thing
    as a price book with no city behind it.
    """

    profile = _partner_profile(request)
    raw = request.query_params.get("service_area_id")
    if raw:
        try:
            area_id = uuid.UUID(raw)
        except ValueError as exc:
            raise ValidationError(
                {"service_area_id": "Must be a UUID."}, code="invalid_service_area"
            ) from exc
        link = profile.service_area_links.filter(service_area_id=area_id, is_active=True).first()
        if link is None:
            raise RequirementNotFoundError()
        return cast(ServiceArea, link.service_area)
    link = profile.service_area_links.filter(is_active=True).select_related("service_area").first()
    if link is None:
        raise RequirementNotFoundError()
    return cast(ServiceArea, link.service_area)


# ---------------------------------------------------------------------------
# Operations: the catalog
# ---------------------------------------------------------------------------


class OperationsWorkItemCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_work_item_list",
        parameters=[
            OpenApiParameter(
                name="skill_id", type=OpenApiTypes.UUID, location=OpenApiParameter.QUERY
            ),
            OpenApiParameter(
                name="status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY
            ),
        ],
        responses={200: WorkItemSerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        queryset = WorkItem.objects.select_related("skill").order_by("skill", "sort_order", "name")
        skill_id = request.query_params.get("skill_id")
        if skill_id:
            queryset = queryset.filter(skill_id=skill_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return Response(WorkItemSerializer(queryset, many=True).data)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_work_item_create",
        request=WorkItemCreateSerializer,
        responses={201: WorkItemSerializer, 400: ApiErrorSerializer, 403: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = WorkItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = WorkItem.objects.create(
            skill_id=serializer.validated_data["skill_id"],
            name=serializer.validated_data["name"],
            unit=serializer.validated_data["unit"],
            description=serializer.validated_data.get("description", ""),
            sort_order=serializer.validated_data.get("sort_order", 0),
        )
        return Response(WorkItemSerializer(item).data, status=status.HTTP_201_CREATED)


class OperationsWorkItemDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_work_item_update",
        request=WorkItemUpdateSerializer,
        responses={200: WorkItemSerializer, 400: ApiErrorSerializer, 403: ApiErrorSerializer},
    )
    def patch(self, request: Request, work_item_id: uuid.UUID) -> Response:
        serializer = WorkItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = WorkItem.objects.select_for_update().get(pk=work_item_id)
        for field, value in serializer.validated_data.items():
            setattr(item, field, value)
        item.full_clean()
        item.save()
        return Response(WorkItemSerializer(item).data)


class OperationsWorkItemRateView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_work_item_rate_list",
        responses={200: WorkItemRateSerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, _request: Request, work_item_id: uuid.UUID) -> Response:
        rates = WorkItemRate.objects.filter(work_item_id=work_item_id).order_by(
            "service_area", "-version"
        )
        return Response(WorkItemRateSerializer(rates, many=True).data)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_work_item_rate_publish",
        request=WorkItemRatePublishSerializer,
        description=(
            "Publish a reference rate for one item in one city, effective immediately. Loaded, "
            "never edited — the previous published version is retired in the same transaction."
        ),
        responses={
            201: WorkItemRateSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, work_item_id: uuid.UUID) -> Response:
        serializer = WorkItemRatePublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            rate = price_book.publish_reference_rate(
                actor=cast(User, request.user),
                work_item_id=work_item_id,
                service_area_id=serializer.validated_data["service_area_id"],
                reference_rate_paise=serializer.validated_data["reference_rate_paise"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(WorkItemRateSerializer(rate).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Operations: the guardrail policy
# ---------------------------------------------------------------------------


class OperationsQuoteGuardrailPolicyView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_guardrail_policy_list",
        description="Every guardrail policy version, newest first. Mirrors the commercial policy "
        "review calendar's own read.",
        responses={200: QuoteGuardrailPolicySerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        policies = QuoteGuardrailPolicy.objects.order_by("-version")
        return Response(QuoteGuardrailPolicySerializer(policies, many=True).data)


class OperationsQuoteGuardrailPolicyActivateView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_guardrail_policy_activate",
        request=QuoteGuardrailPolicyActivateSerializer,
        responses={
            200: QuoteGuardrailPolicySerializer,
            400: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = QuoteGuardrailPolicyActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            policy = price_book.activate_guardrail_policy(
                actor=cast(User, request.user), **serializer.validated_data
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(QuoteGuardrailPolicySerializer(policy).data)


# ---------------------------------------------------------------------------
# Operations: the custom-item review queue
# ---------------------------------------------------------------------------


class OperationsCustomWorkItemReviewQueueView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_custom_item_review_queue",
        responses={200: CustomWorkItemReviewListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        reviews = (
            CustomWorkItemReview.objects.filter(status=CustomWorkItemReview.Status.PENDING)
            .select_related("partner", "partner__business_profile")
            .order_by("-created_at")
        )
        return Response(
            CustomWorkItemReviewListSerializer({"reviews": reviews}).data
        )


class OperationsCustomWorkItemReviewResolveView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_operations_custom_item_review_resolve",
        request=CustomWorkItemReviewResolveSerializer,
        responses={
            200: CustomWorkItemReviewSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, review_id: uuid.UUID) -> Response:
        serializer = CustomWorkItemReviewResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = price_book.resolve_custom_item_review(
                actor=cast(User, request.user),
                review_id=review_id,
                approve=serializer.validated_data["approve"],
                skill_id=serializer.validated_data.get("skill_id"),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(CustomWorkItemReviewSerializer(review).data)


# ---------------------------------------------------------------------------
# Partner: the rate book
# ---------------------------------------------------------------------------


class PartnerPriceBookView(APIView):
    """The catalog for this Partner's skills and one city, with their own saved rates."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_partner_price_book_read",
        parameters=[
            OpenApiParameter(
                name="service_area_id",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description="One of the Partner's own active service areas. Defaults to their "
                "sole area when they serve only one.",
            )
        ],
        responses={200: PriceBookListSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(request)
        try:
            service_area = _partner_service_area(request=request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        entries = price_book.price_book_for_partner(partner=profile, service_area=service_area)
        payload = {
            "items": [
                {
                    "work_item": entry.work_item,
                    "reference_rate_paise": entry.reference_rate_paise,
                    "rate_version": entry.rate_version,
                    "floor_paise": entry.floor_paise,
                    "ceiling_paise": entry.ceiling_paise,
                    "partner_rate_paise": entry.partner_rate_paise,
                    "partner_is_active": entry.partner_is_active,
                }
                for entry in entries
            ]
        }
        return Response(PriceBookListSerializer(payload).data)


class PartnerPriceBookItemView(ThrottledWriteMixin, APIView):
    """Set this Partner's own rate for one catalog item."""

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

    @extend_schema(
        tags=["M2 - Price book"],
        operation_id="m2_partner_price_book_item_set",
        parameters=[
            OpenApiParameter(
                name="service_area_id",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
            )
        ],
        request=PartnerRateItemSetSerializer,
        responses={
            200: PartnerRateItemSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`rate_outside_band` when the rate sits outside the allowed range "
                "for this item in this city.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def put(self, request: Request, work_item_id: uuid.UUID) -> Response:
        serializer = PartnerRateItemSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = _partner_profile(request)
        try:
            service_area = _partner_service_area(request=request)
            item = price_book.set_partner_rate(
                partner=profile,
                work_item_id=work_item_id,
                service_area=service_area,
                rate_paise=serializer.validated_data["rate_paise"],
                is_active=serializer.validated_data.get("is_active", True),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerRateItemSerializer(item).data)
