"""Partner and Operations application APIs."""

import uuid
from http import HTTPStatus
from typing import cast

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import AccessAuditEvent, User
from apps.identity.services import record_access_event
from apps.locations.serializers import PartnerServiceAreaOptionSerializer
from apps.partners.exceptions import PartnerDomainError, PartnerSelfReviewError
from apps.partners.models import PartnerDocument, PartnerProfile
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.partners.selectors import (
    applicant_service_areas,
    applicant_skills,
    operations_partner_application_detail,
    operations_partner_application_queue,
    partner_application_for_user,
    partner_profile_for_user,
    partner_schedule,
    required_partner_consent_documents,
)
from apps.partners.serializers import (
    ExpectedVersionSerializer,
    OperationsApplicationQueueItemSerializer,
    OperationsApplicationQueuePageSerializer,
    OperationsApplicationQueueQuerySerializer,
    OperationsDocumentReviewSerializer,
    OperationsPartnerScheduleUpdateSerializer,
    OperationsTransitionSerializer,
    PartnerApplicationSerializer,
    PartnerApplicationUpdateSerializer,
    PartnerConsentDocumentSerializer,
    PartnerDocumentFinalizeSerializer,
    PartnerDocumentReviewAccessSerializer,
    PartnerDocumentSerializer,
    PartnerDocumentUploadRequestSerializer,
    PartnerDocumentUploadSerializer,
    PartnerGoOnlineSerializer,
    PartnerPresenceHeartbeatSerializer,
    PartnerPresenceSerializer,
    PartnerPresenceSessionRequestSerializer,
    PartnerProfileSerializer,
    PartnerScheduleSerializer,
    PartnerScheduleUpdateSerializer,
    PartnerSkillOptionSerializer,
)
from apps.partners.services import (
    ScheduleExceptionInput,
    ScheduleRuleInput,
    claim_partner_application,
    create_partner_document_review_access,
    finalize_partner_document_upload,
    go_offline,
    go_online,
    heartbeat_presence,
    issue_partner_document_upload,
    replace_partner_schedule,
    replace_partner_schedule_for_operations,
    review_partner_document,
    submit_partner_application,
    transition_partner_application,
    update_partner_application,
)
from common.errors.serializers import ApiErrorSerializer
from common.observability.context import get_request_id
from common.schema import PARTNER_VERSION_CONFLICT_EXAMPLE


class PartnerApiException(APIException):
    def __init__(self, error: PartnerDomainError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = error.retryable
        super().__init__(detail=error.message, code=error.code)


def _raise_api_error(error: PartnerDomainError) -> None:
    raise PartnerApiException(error)


def _audit_self_review_denial(*, actor: User, error: PartnerSelfReviewError) -> None:
    record_access_event(
        actor=actor,
        subject_user=actor,
        action="operations.partner_self_review",
        object_type=error.object_type,
        object_id=error.object_id,
        decision=AccessAuditEvent.Decision.DENIED,
        request_id=get_request_id() or "",
    )


def _request_ip(request: Request) -> str:
    return str(request.META.get("REMOTE_ADDR") or "unknown")


def _application_response(user: User) -> Response:
    application = partner_application_for_user(user)
    if application is None:
        raise NotFound("Partner application was not found.")
    return Response(PartnerApplicationSerializer(application).data)


class ApplicantServiceAreaListView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        responses={200: PartnerServiceAreaOptionSerializer(many=True)},
    )
    def get(self, _request: Request) -> Response:
        return Response(
            PartnerServiceAreaOptionSerializer(applicant_service_areas(), many=True).data
        )


class PartnerSkillListView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        responses={200: PartnerSkillOptionSerializer(many=True)},
    )
    def get(self, _request: Request) -> Response:
        return Response(PartnerSkillOptionSerializer(applicant_skills(), many=True).data)


class RequiredPartnerConsentListView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        responses={200: PartnerConsentDocumentSerializer(many=True)},
    )
    def get(self, _request: Request) -> Response:
        documents = required_partner_consent_documents()
        return Response(PartnerConsentDocumentSerializer(documents, many=True).data)


class PartnerMeView(APIView):
    """The signed-in Partner's own profile.

    This used to return the *application* — byte-for-byte the same payload as
    `GET /partner/application/` — which is why "Profile" in the app opened a
    half-finished onboarding form. An application is a submission under review; a
    profile is the standing record of someone who works here.

    404 while no profile exists yet, because an applicant who has not been set up
    genuinely has none, and inventing an empty one would make the app render a
    person who is not there.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["Partner"],
        responses={200: PartnerProfileSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = (
            PartnerProfile.objects.select_related("user", "application")
            .prefetch_related(
                "service_links__variant__service",
                "service_area_links__service_area",
            )
            .filter(user=cast(User, request.user))
            .first()
        )
        if profile is None:
            raise NotFound("No Partner profile exists for this account.")
        return Response(PartnerProfileSerializer(profile).data)


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
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[PARTNER_VERSION_CONFLICT_EXAMPLE],
            ),
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
                display_name=data.get("display_name"),
                biography=data.get("biography"),
                experience_years=data.get("experience_years"),
                skill_codes=data.get("skill_codes"),
                service_variant_ids=data.get("service_variant_ids"),
                service_area_ids=data.get("service_area_ids"),
                consents=data.get("consents"),
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


class PartnerDocumentUploadView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        request=PartnerDocumentUploadRequestSerializer,
        responses={
            201: PartnerDocumentUploadSerializer,
            400: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[PARTNER_VERSION_CONFLICT_EXAMPLE],
            ),
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = PartnerDocumentUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            grant = issue_partner_document_upload(
                user=cast(User, request.user),
                **serializer.validated_data,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        payload = {
            "id": grant.upload.id,
            "kind": grant.upload.kind,
            "object_key": grant.upload.object_key,
            "content_type": grant.upload.content_type,
            "size_bytes": grant.upload.size_bytes,
            "sha256": grant.upload.sha256,
            "upload_url": grant.signed.upload_url,
            "upload_token": grant.signed.upload_token,
            "resumable_url": grant.signed.resumable_url,
            "expires_at": grant.signed.expires_at,
        }
        return Response(
            PartnerDocumentUploadSerializer(payload).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerDocumentCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        request=PartnerDocumentFinalizeSerializer,
        responses={
            201: PartnerDocumentSerializer,
            400: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[PARTNER_VERSION_CONFLICT_EXAMPLE],
            ),
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = PartnerDocumentFinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            document = finalize_partner_document_upload(
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


class OperationsApplicationCursorPagination(CursorPagination):
    page_size = 25
    ordering = ("submitted_at", "id")


class OperationsPartnerApplicationQueueView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_partner_application_queue_list",
        parameters=[OperationsApplicationQueueQuerySerializer],
        responses={
            200: OperationsApplicationQueuePageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        serializer = OperationsApplicationQueueQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        queryset = operations_partner_application_queue(
            actor=cast(User, request.user),
            status=cast(str | None, data.get("status")),
            assigned_to_me=bool(data["assigned_to_me"]),
            unassigned=bool(data["unassigned"]),
        )
        paginator = OperationsApplicationCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            OperationsApplicationQueueItemSerializer(page, many=True).data,
        )


class OperationsPartnerApplicationDetailView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_partner_application_detail_retrieve",
        responses={
            200: PartnerApplicationSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, application_id: uuid.UUID) -> Response:
        application = operations_partner_application_detail(application_id)
        if application is None:
            raise NotFound("Partner application was not found.")
        actor = cast(User, request.user)
        if application.partner.user_id == actor.id:
            error = PartnerSelfReviewError(
                object_type="partner_application",
                object_id=application.id,
            )
            _audit_self_review_denial(actor=actor, error=error)
            _raise_api_error(error)
        record_access_event(
            actor=actor,
            subject_user=application.partner.user,
            action="operations.partner_application.read",
            object_type="partner_application",
            object_id=application.id,
            request_id=get_request_id() or "",
        )
        return Response(PartnerApplicationSerializer(application).data)


class OperationsPartnerApplicationClaimView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations"],
        request=ExpectedVersionSerializer,
        responses={
            200: PartnerApplicationSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                examples=[PARTNER_VERSION_CONFLICT_EXAMPLE],
            ),
        },
    )
    def post(self, request: Request, application_id: uuid.UUID) -> Response:
        serializer = ExpectedVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        try:
            application = claim_partner_application(
                reviewer=actor,
                application_id=application_id,
                **serializer.validated_data,
            )
        except PartnerSelfReviewError as exc:
            _audit_self_review_denial(actor=actor, error=exc)
            _raise_api_error(exc)
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        refreshed = operations_partner_application_detail(application.id)
        return Response(PartnerApplicationSerializer(refreshed).data)


class OperationsPartnerDocumentAccessView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations"],
        request=None,
        responses={
            200: PartnerDocumentReviewAccessSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, document_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        try:
            signed = create_partner_document_review_access(
                reviewer=actor,
                document_id=document_id,
            )
        except PartnerSelfReviewError as exc:
            _audit_self_review_denial(actor=actor, error=exc)
            _raise_api_error(exc)
        except PartnerDomainError as exc:
            denied_document = (
                PartnerDocument.objects.select_related("application__partner__user")
                .filter(id=document_id)
                .first()
            )
            record_access_event(
                actor=actor,
                subject_user=(
                    denied_document.application.partner.user
                    if denied_document is not None
                    else None
                ),
                action="operations.partner_document.reveal",
                object_type="partner_document",
                object_id=document_id,
                decision=AccessAuditEvent.Decision.DENIED,
                request_id=get_request_id() or "",
                metadata={"error_code": exc.code},
            )
            _raise_api_error(exc)
        document = PartnerDocument.objects.select_related("application__partner").get(
            id=document_id
        )
        record_access_event(
            actor=actor,
            subject_user=document.application.partner.user,
            action="operations.partner_document.reveal",
            object_type="partner_document",
            object_id=document.id,
            request_id=get_request_id() or "",
        )
        return Response(
            PartnerDocumentReviewAccessSerializer(
                {"review_url": signed.review_url, "expires_at": signed.expires_at},
            ).data,
        )


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
        except PartnerSelfReviewError as exc:
            _audit_self_review_denial(actor=cast(User, request.user), error=exc)
            _raise_api_error(exc)
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
        except PartnerSelfReviewError as exc:
            _audit_self_review_denial(actor=cast(User, request.user), error=exc)
            _raise_api_error(exc)
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
