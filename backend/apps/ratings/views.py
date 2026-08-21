from collections.abc import Callable
from typing import cast
from uuid import UUID

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from common.errors.serializers import ApiErrorSerializer

from .exceptions import RatingDomainError
from .serializers import RatingCreateSerializer, RatingSummarySerializer, rating_summary
from .services import (
    RatingContext,
    booking_rating_context,
    engagement_rating_context,
    submit_rating,
)


class RatingApiException(APIException):
    def __init__(self, error: RatingDomainError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = False
        super().__init__(detail=error.message, code=error.code)


ContextResolver = Callable[..., RatingContext]


class RatingCollectionView(APIView):
    permission_classes = (IsAuthenticated,)
    resolver: ContextResolver
    id_parameter: str
    operation_prefix: str

    def context_for(self, request: Request, subject_id: UUID) -> RatingContext:
        try:
            return self.resolver(
                **{self.id_parameter: subject_id, "actor": cast(User, request.user)}
            )
        except RatingDomainError as exc:
            raise RatingApiException(exc) from exc

    def get(self, request: Request, subject_id: UUID) -> Response:
        context = self.context_for(request, subject_id)
        return Response(rating_summary(context))

    def post(self, request: Request, subject_id: UUID) -> Response:
        serializer = RatingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        context = self.context_for(request, subject_id)
        try:
            _rating, created = submit_rating(
                context=context,
                score=serializer.validated_data["score"],
                comment=serializer.validated_data["comment"],
            )
        except RatingDomainError as exc:
            raise RatingApiException(exc) from exc
        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(rating_summary(context), status=http_status)


class BookingRatingCollectionView(RatingCollectionView):
    resolver = staticmethod(booking_rating_context)
    id_parameter = "booking_id"

    @extend_schema(
        tags=["Ratings"],
        operation_id="booking_rating_list",
        responses={200: RatingSummarySerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, booking_id: UUID) -> Response:
        return super().get(request, booking_id)

    @extend_schema(
        tags=["Ratings"],
        operation_id="booking_rating_create",
        request=RatingCreateSerializer,
        responses={
            201: RatingSummarySerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(response=ApiErrorSerializer),
        },
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)


class EngagementRatingCollectionView(RatingCollectionView):
    resolver = staticmethod(engagement_rating_context)
    id_parameter = "engagement_id"

    @extend_schema(
        tags=["Ratings"],
        operation_id="engagement_rating_list",
        responses={200: RatingSummarySerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: UUID) -> Response:
        return super().get(request, engagement_id)

    @extend_schema(
        tags=["Ratings"],
        operation_id="engagement_rating_create",
        request=RatingCreateSerializer,
        responses={
            201: RatingSummarySerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(response=ApiErrorSerializer),
        },
    )
    def post(self, request: Request, engagement_id: UUID) -> Response:
        return super().post(request, engagement_id)
