"""Partner and Operations application APIs."""

import uuid
from http import HTTPStatus
from typing import cast

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsOperationsUser
from apps.partners.selectors import (
    partner_application_for_user,
    partner_profile_for_user,
    partner_schedule,
)
from apps.partners.serializers import (
    ExpectedVersionSerializer,
    OperationsDocumentReviewSerializer,
    OperationsPartnerScheduleUpdateSerializer,
    OperationsTransitionSerializer,
    PartnerApplicationSerializer,
    PartnerApplicationUpdateSerializer,
    PartnerDocumentCreateSerializer,
    PartnerDocumentSerializer,
    PartnerGoOnlineSerializer,
    PartnerPresenceHeartbeatSerializer,
    PartnerPresenceSerializer,
    PartnerPresenceSessionRequestSerializer,
    PartnerScheduleSerializer,
    PartnerScheduleUpdateSerializer,
)
from apps.partners.services import (
    ScheduleExceptionInput,
    ScheduleRuleInput,
    go_offline,
    go_online,
    heartbeat_presence,
    register_partner_document,
    replace_partner_schedule,
    replace_partner_schedule_for_operations,
    review_partner_document,
    submit_partner_application,
    transition_partner_application,
    update_partner_application,
)
from common.errors.serializers import ApiErrorSerializer


class PartnerApiException(APIException):
    def __init__(self, error: PartnerDomainError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = error.retryable
        super().__init__(detail=error.message, code=error.code)


def _raise_api_error(error: PartnerDomainError) -> None:
    raise PartnerApiException(error)


def _request_ip(request: Request) -> str:
    return str(request.META.get("REMOTE_ADDR") or "unknown")


def _application_response(user: User) -> Response:
    application = partner_application_for_user(user)
    if application is None:
        raise NotFound("Partner application was not found.")
    return Response(PartnerApplicationSerializer(application).data)


class PartnerMeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner"],
        responses={200: PartnerApplicationSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        return _application_response(cast(User, request.user))


class PartnerApplicationView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        responses={200: PartnerApplicationSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        return _application_response(cast(User, request.user))

    @extend_schema(
        tags=["Partner application"],
        request=PartnerApplicationUpdateSerializer,
        responses={
            200: PartnerApplicationSerializer,
            201: PartnerApplicationSerializer,
            400: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def patch(self, request: Request) -> Response:
        serializer = PartnerApplicationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = cast(User, request.user)
        existed = partner_profile_for_user(user) is not None
        try:
            update_partner_application(
                user=user,
                expected_version=data.get("expected_version"),
                display_name=data["display_name"],
                biography=data.get("biography", ""),
                experience_years=data.get("experience_years", 0),
                skill_codes=data["skill_codes"],
                service_variant_ids=data["service_variant_ids"],
                service_area_ids=data["service_area_ids"],
                consents=data["consents"],
                request_ip=_request_ip(request),
                device_identifier=data.get("device_identifier", ""),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        response = _application_response(user)
        response.status_code = HTTPStatus.OK if existed else HTTPStatus.CREATED
        return response


class PartnerApplicationSubmitView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        request=ExpectedVersionSerializer,
        responses={200: PartnerApplicationSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = ExpectedVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            submit_partner_application(
                user=cast(User, request.user),
                expected_version=serializer.validated_data["expected_version"],
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return _application_response(cast(User, request.user))


class PartnerDocumentCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        request=PartnerDocumentCreateSerializer,
        responses={
            201: PartnerDocumentSerializer,
            400: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = PartnerDocumentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            document = register_partner_document(
                user=cast(User, request.user),
                **serializer.validated_data,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            PartnerDocumentSerializer(document).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerScheduleView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner availability"],
        responses={200: PartnerScheduleSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        partner = partner_profile_for_user(cast(User, request.user))
        if partner is None:
            raise NotFound("Partner application was not found.")
        rules, exceptions = partner_schedule(partner)
        return Response(
            PartnerScheduleSerializer({"rules": rules, "exceptions": exceptions}).data,
        )

    @extend_schema(
        tags=["Partner availability"],
        request=PartnerScheduleUpdateSerializer,
        responses={
            200: PartnerScheduleSerializer,
            400: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def put(self, request: Request) -> Response:
        serializer = PartnerScheduleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            rules, exceptions = replace_partner_schedule(
                user=cast(User, request.user),
                rules=cast(list[ScheduleRuleInput], serializer.validated_data["rules"]),
                exceptions=cast(
                    list[ScheduleExceptionInput],
                    serializer.validated_data["exceptions"],
                ),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            PartnerScheduleSerializer({"rules": rules, "exceptions": exceptions}).data,
        )


class PartnerPresenceOnlineView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner presence"],
        request=PartnerGoOnlineSerializer,
        responses={
            201: PartnerPresenceSerializer,
            403: ApiErrorSerializer,
            409: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = PartnerGoOnlineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = go_online(
                user=cast(User, request.user),
                **serializer.validated_data,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            PartnerPresenceSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerPresenceHeartbeatView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner presence"],
        request=PartnerPresenceHeartbeatSerializer,
        responses={
            200: PartnerPresenceSerializer,
            409: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = PartnerPresenceHeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = heartbeat_presence(
                user=cast(User, request.user),
                **serializer.validated_data,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerPresenceSerializer(session).data)


class PartnerPresenceOfflineView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner presence"],
        request=PartnerPresenceSessionRequestSerializer,
        responses={
            204: OpenApiResponse(description="The Partner is offline."),
            409: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = PartnerPresenceSessionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            go_offline(
                user=cast(User, request.user),
                session_id=serializer.validated_data["session_id"],
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OperationsPartnerApplicationTransitionView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Partners"],
        request=OperationsTransitionSerializer,
        responses={
            200: PartnerApplicationSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(
        self,
        request: Request,
        application_id: uuid.UUID,
    ) -> Response:
        serializer = OperationsTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            application = transition_partner_application(
                reviewer=cast(User, request.user),
                application_id=application_id,
                **serializer.validated_data,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        refreshed = partner_application_for_user(application.partner.user)
        return Response(PartnerApplicationSerializer(refreshed).data)


class OperationsPartnerDocumentReviewView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Partners"],
        request=OperationsDocumentReviewSerializer,
        responses={
            200: PartnerDocumentSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, document_id: uuid.UUID) -> Response:
        serializer = OperationsDocumentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            document = review_partner_document(
                reviewer=cast(User, request.user),
                document_id=document_id,
                **serializer.validated_data,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerDocumentSerializer(document).data)


class OperationsPartnerScheduleView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations - Partners"],
        request=OperationsPartnerScheduleUpdateSerializer,
        responses={
            200: PartnerScheduleSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def put(self, request: Request, partner_id: uuid.UUID) -> Response:
        serializer = OperationsPartnerScheduleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            rules, exceptions = replace_partner_schedule_for_operations(
                actor=cast(User, request.user),
                partner_id=partner_id,
                consent_purpose=data["consent_purpose"],
                consent_document_version=data["consent_document_version"],
                rules=cast(list[ScheduleRuleInput], data["rules"]),
                exceptions=cast(list[ScheduleExceptionInput], data["exceptions"]),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerScheduleSerializer({"rules": rules, "exceptions": exceptions}).data)
