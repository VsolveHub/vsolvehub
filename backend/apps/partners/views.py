"""Partner and Operations application APIs."""

import uuid
from dataclasses import asdict
from http import HTTPStatus
from typing import cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.foundation.services import execute_idempotent
from apps.identity.models import AccessAuditEvent, User
from apps.identity.services import record_access_event
from apps.locations.serializers import PartnerServiceAreaOptionSerializer
from apps.partners.capabilities import (
    add_crew_to_roster,
    archive_crew_member,
    crew_roster,
    declare_insurance,
    gate_states,
    live_insurance_declaration,
    request_capability,
    transition_capability,
    update_crew_member,
    upsert_business_profile,
)
from apps.partners.capability_options import (
    BUSINESS_TYPE_OPTIONS,
    capability_options,
    capability_records,
)
from apps.partners.exceptions import (
    CapabilityNotApprovedError,
    PartnerDomainError,
    PartnerSelfReviewError,
)
from apps.partners.gates import GATE_BLOCKS, GATE_COPY, GateState
from apps.partners.models import (
    PartnerCapability,
    PartnerCrewMembership,
    PartnerDocument,
    PartnerProfile,
    Skill,
)
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.partners.selectors import (
    applicant_service_areas,
    applicant_skills,
    operations_partner_application_detail,
    operations_partner_application_queue,
    operations_partner_detail,
    operations_partner_directory,
    partner_application_for_user,
    partner_profile_for_user,
    partner_schedule,
    required_partner_consent_documents,
)
from apps.partners.serializers import (
    CapabilityOptionsSerializer,
    CapabilityRequestSerializer,
    CrewListSerializer,
    CrewMemberCreateSerializer,
    CrewMemberSerializer,
    CrewMemberUpdateSerializer,
    ExpectedVersionSerializer,
    OperationsApplicationQueueItemSerializer,
    OperationsApplicationQueuePageSerializer,
    OperationsApplicationQueueQuerySerializer,
    OperationsDocumentReviewSerializer,
    OperationsPartnerDetailSerializer,
    OperationsPartnerDirectoryItemSerializer,
    OperationsPartnerDirectoryPageSerializer,
    OperationsPartnerDirectoryQuerySerializer,
    OperationsPartnerScheduleUpdateSerializer,
    OperationsTransitionSerializer,
    PartnerApplicationSerializer,
    PartnerApplicationUpdateSerializer,
    PartnerBusinessProfileSerializer,
    PartnerBusinessProfileWriteSerializer,
    PartnerCapabilityListSerializer,
    PartnerCapabilitySerializer,
    PartnerConsentDocumentSerializer,
    PartnerDocumentFinalizeSerializer,
    PartnerDocumentReviewAccessSerializer,
    PartnerDocumentSerializer,
    PartnerDocumentUploadRequestSerializer,
    PartnerDocumentUploadSerializer,
    PartnerGoOnlineSerializer,
    PartnerInsuranceSerializer,
    PartnerInsuranceWriteSerializer,
    PartnerPresenceHeartbeatSerializer,
    PartnerPresenceSerializer,
    PartnerPresenceSessionRequestSerializer,
    PartnerProfileSerializer,
    PartnerProfileUpdateSerializer,
    PartnerScheduleSerializer,
    PartnerScheduleUpdateSerializer,
    PartnerSkillOptionSerializer,
    ProgressiveGateListSerializer,
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
from common.schema import IDEMPOTENCY_KEY_HEADER, PARTNER_VERSION_CONFLICT_EXAMPLE


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

    @extend_schema(
        tags=["Partner"],
        operation_id="partner_me_update",
        request=PartnerProfileUpdateSerializer,
        responses={200: PartnerProfileSerializer, 400: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def patch(self, request: Request) -> Response:
        """Changes what a Partner may change about themselves.

        Deliberately narrow. The phone number is the login credential and is not
        accepted here — see `PartnerProfileUpdateSerializer`.
        """
        serializer = PartnerProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = PartnerProfile.objects.filter(user=cast(User, request.user)).first()
        if profile is None:
            raise NotFound("No Partner profile exists for this account.")
        profile.display_name = cast(str, serializer.validated_data["display_name"])
        profile.save(update_fields=("display_name", "updated_at"))
        profile = (
            PartnerProfile.objects.select_related("user", "application")
            .prefetch_related(
                "service_links__variant__service",
                "service_area_links__service_area",
            )
            .get(id=profile.id)
        )
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


class OperationsPartnerDirectoryCursorPagination(CursorPagination):
    """Ordered by name, matching the directory's own ordering.

    `CursorPagination` reads its ordering from itself, not from the queryset — a paginator whose
    ordering disagreed with the queryset's would page inconsistently.
    """

    page_size = 25
    ordering = ("display_name", "id")


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


class OperationsPartnerDirectoryView(APIView):
    """Everyone who works for us, not just everyone awaiting a decision.

    Deliberately a second surface rather than a widened review queue. The queue is a worklist —
    it defaults to the three in-review statuses and orders by how long somebody has waited. This
    is a directory: it lists approved, suspended and offboarded Partners too, ordered by name,
    because "find me this Partner" and "what should I review next" are different jobs and one
    screen doing both serves neither.
    """

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_partner_directory_list",
        parameters=[
            OpenApiParameter("status", str, description="Filter by application status."),
            OpenApiParameter(
                "skill",
                str,
                many=True,
                description=(
                    "Repeatable skill code. A Partner matching *any* supplied skill is listed — "
                    "a directory multi-select reads as a union."
                ),
            ),
            OpenApiParameter("cursor", str, description="Opaque page cursor."),
        ],
        responses={
            200: OperationsPartnerDirectoryPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        # `getlist` rather than the serializer's own read: a plain `Serializer` sees only the
        # last value of a repeated query parameter, so `?skill=a&skill=b` would silently filter
        # on `b` alone.
        payload: dict[str, object] = {
            key: value for key, value in request.query_params.items() if key != "skill"
        }
        payload["skill"] = request.query_params.getlist("skill")
        serializer = OperationsPartnerDirectoryQuerySerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        queryset = operations_partner_directory(
            status=cast(str | None, data.get("status")),
            skill_codes=cast(list[str], data.get("skill") or []),
        )
        paginator = OperationsPartnerDirectoryCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            OperationsPartnerDirectoryItemSerializer(page, many=True).data,
        )


class OperationsPartnerDetailView(APIView):
    """One Partner's management record.

    Carries the same two guards the application detail does, for the same reasons: a reviewer
    may not open their own record, and every read is recorded — this projection names a person
    and summarises their documents, so who looked is itself a fact worth keeping.
    """

    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_partner_detail_retrieve",
        responses={
            200: OperationsPartnerDetailSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, partner_id: uuid.UUID) -> Response:
        partner = operations_partner_detail(partner_id)
        if partner is None:
            raise NotFound("Partner was not found.")
        actor = cast(User, request.user)
        if partner.user_id == actor.id:
            error = PartnerSelfReviewError(object_type="partner", object_id=partner.id)
            _audit_self_review_denial(actor=actor, error=error)
            _raise_api_error(error)
        record_access_event(
            actor=actor,
            subject_user=partner.user,
            action="operations.partner.read",
            object_type="partner",
            object_id=partner.id,
            request_id=get_request_id() or "",
        )
        return Response(OperationsPartnerDetailSerializer(partner).data)


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


# ---------------------------------------------------------------------------
# M2 (proposal 0013): the registration surface
#
# Thin, like the rest of this file. Every view below authorises the actor, resolves records the
# caller owns, calls one command in `apps.partners.capabilities` and translates a refusal. The
# domain here was built and tested on 10 August; until now none of it was reachable.
#
# Object-level authorization is per record. A capability or membership belonging to another Partner
# answers `404`, never `403`.
# ---------------------------------------------------------------------------


def _unmet_gates() -> list[dict[str, object]]:
    """Every gate, unsatisfied, for a caller with no Partner profile yet.

    Built from the same `GATE_COPY` table `gate_states` reads, so the sentences an account sees
    before it exists are the sentences it sees afterwards.
    """
    return [
        asdict(
            GateState(
                gate=gate,
                is_satisfied=False,
                blocks=GATE_BLOCKS[gate],
                reason=reason,
                next_action=next_action,
            )
        )
        for gate, reason, next_action in GATE_COPY.values()
    ]


def _partner_profile_or_404(request: Request) -> PartnerProfile:
    """For per-record reads and every write. A caller with no profile owns no records."""
    profile = partner_profile_for_user(cast(User, request.user))
    if profile is None:
        raise NotFound("Partner profile was not found.")
    return profile


def _partner_profile_or_none(request: Request) -> PartnerProfile | None:
    """For list reads, which answer an account that has only just begun registering.

    The split matters more than it looks. A Partner-role session with no `PartnerProfile` is a real
    state — the thirty seconds between holding the role and being set up — and the reads a Partner
    needs *during* registration must answer it with an empty list rather than a `404` the client
    renders as an error. Proposal 0013's first constraint is that no gate stands before browsing
    demand, and a `404` on the options list is a gate.

    Per-*record* reads still use `_partner_profile_or_404`: an account with no profile genuinely has
    no business profile, no insurance declaration and no capability to read.
    """
    return partner_profile_for_user(cast(User, request.user))


def _idempotency_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


class PartnerBusinessProfileView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_business_profile_read",
        description=(
            "The Partner's business identity. **`404` when none exists, and that is the ordinary "
            "state for every M1 Partner** — the client renders the individual default and offers "
            "the step rather than showing an error."
        ),
        responses={
            200: PartnerBusinessProfileSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_404(request)
        business = getattr(profile, "business_profile", None)
        if business is None:
            raise NotFound("No business profile has been declared.")
        return Response(PartnerBusinessProfileSerializer(business).data)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_business_profile_replace",
        description=(
            "Create or replace. A `PUT` rather than a `PATCH` because the three business types "
            "have genuinely different required fields, and a partial update is how a Partner "
            "switching "
            "from agency to individual keeps a registration number the database forbids."
        ),
        request=PartnerBusinessProfileWriteSerializer,
        responses={
            200: PartnerBusinessProfileSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_business_type_invalid` for a registration number on an "
                "`INDIVIDUAL`, or a GSTIN without `gst_registered`. Both are model constraints.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def put(self, request: Request) -> Response:
        serializer = PartnerBusinessProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        try:
            business = upsert_business_profile(
                partner=profile,
                business_type=values["business_type"],
                legal_name=values.get("legal_name", ""),
                registration_number=values.get("registration_number", ""),
                gst_registered=values.get("gst_registered", False),
                gstin=values.get("gstin", ""),
                years_in_operation=values.get("years_in_operation", 0),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerBusinessProfileSerializer(business).data)


class PartnerCapabilityOptionListView(APIView):
    """What this Partner may ask to be considered for.

    `IsPartnerUser` and nothing more. This answers for an account with no application, no documents
    and no approved capability — that is the account the screen exists for, and a gate here would
    break the flow-weight budget `M2-FE-101` sets from the server side.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_option_list",
        description=(
            "Business types with their consequences, and the lifecycle capabilities open for "
            "request. All copy is server-authored: `lifecycle_explanation` is the sentence that "
            "decides whether a Partner understands what they are signing up to, and `asks_for` "
            "names the fields one form should render so the client needs no archetype branch."
        ),
        responses={200: CapabilityOptionsSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        options = [asdict(option) for option in capability_options(profile)] if profile else []
        return Response(
            CapabilityOptionsSerializer(
                {
                    # Catalog copy that does not depend on the caller, so it is published even
                    # to an account with no profile yet — the account deciding which type it is.
                    "business_types": [
                        {"value": value, "label": label, "consequence": consequence}
                        for value, label, consequence in BUSINESS_TYPE_OPTIONS
                    ],
                    "capabilities": options,
                    "server_now": timezone.now(),
                }
            ).data
        )


class PartnerCapabilityCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_list",
        description=(
            "Every capability this Partner holds, in any status. **This is the read that tells "
            '"not applied" from "under review" from "suspended"** — an empty workspace-grant list '
            "cannot, and inferring a review banner from one would show it to every existing M1 "
            "Partner. `REJECTED` is Operations' refusal; `WITHDRAWN` is the Partner's own exit."
        ),
        responses={200: PartnerCapabilityListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        records = [asdict(record) for record in capability_records(profile)] if profile else []
        return Response(
            PartnerCapabilityListSerializer(
                {"capabilities": records, "server_now": timezone.now()}
            ).data
        )

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_request",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CapabilityRequestSerializer,
        responses={
            201: PartnerCapabilitySerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` when the variant carries no A3/A5 "
                'archetype. Show "we do not cover this yet" and return to the options list, not a '
                "field error.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_already_requested` when a live request exists for this "
                'variant — the recovery is "open the one you have", not "try something else". '
                "`idempotency_in_progress` means wait and re-read, never resend under a new key.",
            ),
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CapabilityRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        actor = cast(User, request.user)
        profile = _partner_profile_or_404(request)
        key = _idempotency_key(request)
        variant = get_object_or_404(
            ServiceVariant.objects.select_related("service"),
            id=values["variant_id"],
            is_active=True,
        )

        def command() -> tuple[int, dict[str, object]]:
            try:
                capability = request_capability(
                    partner=profile,
                    variant=variant,
                    max_crew_size=values.get("max_crew_size"),
                    max_project_value_paise=values.get("max_project_value_paise"),
                )
            except PartnerDomainError as exc:
                _raise_api_error(exc)

            return HTTPStatus.CREATED, cast(
                dict[str, object],
                PartnerCapabilitySerializer(
                    _capability_record(profile=profile, capability_id=capability.id)
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.capability.request",
            key=key,
            request_payload={"variant_id": str(values["variant_id"])},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerCapabilityWithdrawView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_capability_withdraw",
        request=None,
        description=(
            "The Partner's own exit. Distinct from Operations' `REJECTED` refusal, which the "
            "Partner cannot cause and this route cannot reach. Neither status blocks a fresh "
            "request for the same variant."
        ),
        responses={
            200: PartnerCapabilitySerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, capability_id: uuid.UUID) -> Response:
        profile = _partner_profile_or_404(request)
        capability = PartnerCapability.objects.filter(id=capability_id, partner=profile).first()
        if capability is None:
            raise NotFound("Capability was not found.")
        try:
            transition_capability(
                capability_id=capability.id,
                to_status=PartnerCapability.Status.WITHDRAWN,
                actor=cast(User, request.user),
                reason_code="partner_withdrew",
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(
            PartnerCapabilitySerializer(
                _capability_record(profile=profile, capability_id=capability.id)
            ).data
        )


class PartnerInsuranceView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_insurance_read",
        description=(
            "The worker-insurance declaration in force today. **`404` when none is declared, which "
            "is the ordinary state and not an error.** `verified_at` is read-only and set only by "
            "Operations: a client must render an unverified declaration as *declared*, never as "
            "*insured*, because the difference is who carries the liability if a worker is hurt."
        ),
        responses={
            200: PartnerInsuranceSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_404(request)
        declaration = live_insurance_declaration(profile)
        if declaration is None:
            raise NotFound("No insurance declaration is on record.")
        return Response(PartnerInsuranceSerializer(declaration).data)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_insurance_replace",
        request=PartnerInsuranceWriteSerializer,
        description=(
            "Declare or replace. A replacement clears `verified_at`: swapping a checked policy for "
            "an unchecked one must not keep the badge."
        ),
        responses={
            200: PartnerInsuranceSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def put(self, request: Request) -> Response:
        serializer = PartnerInsuranceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        try:
            declaration = declare_insurance(
                partner=profile,
                insurer_name=values["insurer_name"],
                policy_reference=values["policy_reference"],
                coverage_paise=values["coverage_paise"],
                covers_workmen_compensation=values.get("covers_workmen_compensation", False),
                valid_from=values["valid_from"],
                valid_to=values["valid_to"],
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerInsuranceSerializer(declaration).data)


class PartnerGateListView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner registration"],
        operation_id="m2_partner_gate_list",
        description=(
            "The three progressive gates, each with the reason it is being asked for and the one "
            "action that clears it. **Advisory**: the commands enforce these at the moment they "
            "run, and this read only decides what the UI explains beforehand. A client treating it "
            "as authoritative would block somebody whose KYC completed thirty seconds ago. "
            "`blocks` names actions, never screens — an unsatisfied gate never hides demand."
        ),
        responses={200: ProgressiveGateListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        # No profile means no gate is satisfied, which is the truth rather than a refusal: nothing
        # has been proved, and this screen's job is to say which three things will be asked for.
        gates = [asdict(gate) for gate in gate_states(profile)] if profile else _unmet_gates()
        return Response(
            ProgressiveGateListSerializer({"gates": gates, "server_now": timezone.now()}).data
        )


class PartnerCrewCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_list",
        description=(
            "This Partner's roster. Publishes **no `crew_member_id`** — identity is global, and "
            "handing the global id to one agency would let two agencies compare rosters and "
            "discover a worker is on both. `phone_masked` shows four digits; the number itself is "
            "never stored, so this is not a redaction but the whole of what exists."
        ),
        responses={200: CrewListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile_or_none(request)
        members = [asdict(entry) for entry in crew_roster(profile)] if profile else []
        return Response(CrewListSerializer({"members": members}).data)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_add",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewMemberCreateSerializer,
        description=(
            "Add a worker. **`201` for a new membership, `200` for a reinstated one**, so the UI "
            'can say "we put Ramesh back on your roster" instead of silently succeeding on a name '
            "the Partner thought was gone."
        ),
        responses={
            200: CrewMemberSerializer,
            201: CrewMemberSerializer,
            400: ApiErrorSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_not_approved` when the Partner holds no approved "
                "workforce capability. The roster is not a general address book.",
            ),
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = CrewMemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        actor = cast(User, request.user)
        profile = _partner_profile_or_404(request)
        key = _idempotency_key(request)

        # The roster exists from the moment a Partner holds an approved workforce capability, and
        # not before. Checked here rather than in the domain because it is an authorization rule
        # about this surface: `add_crew_to_roster` is also reachable from Operations-assisted paths
        # that legitimately predate approval.
        if not PartnerCapability.objects.filter(
            partner=profile,
            status=PartnerCapability.Status.APPROVED,
            archetype=ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
        ).exists():
            _raise_api_error(CapabilityNotApprovedError())

        skills = list(Skill.objects.filter(code__in=values.get("skill_codes") or []))

        def command() -> tuple[int, dict[str, object]]:
            try:
                change = add_crew_to_roster(
                    partner=profile,
                    display_name=values["display_name"],
                    phone_e164=values["phone_e164"],
                    skills=skills,
                    is_supervisor=values.get("is_supervisor", False),
                )
            except PartnerDomainError as exc:
                _raise_api_error(exc)

            status_code = HTTPStatus.CREATED if change.was_created else HTTPStatus.OK
            return int(status_code), _crew_entry(
                profile=profile, membership_id=change.membership.id
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.crew.add",
            key=key,
            request_payload={
                "display_name": values["display_name"],
                "phone_e164": values["phone_e164"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerCrewDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_update",
        request=CrewMemberUpdateSerializer,
        description=(
            "Skills and the supervisor flag. `display_name` is **not** editable: it belongs to the "
            "global crew member, and one agency renaming a person would rename them on every other "
            "roster."
        ),
        responses={
            200: CrewMemberSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def patch(self, request: Request, membership_id: uuid.UUID) -> Response:
        serializer = CrewMemberUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)

        skills = (
            list(Skill.objects.filter(code__in=values["skill_codes"]))
            if "skill_codes" in values
            else None
        )
        try:
            update_crew_member(
                membership=membership,
                skills=skills,
                is_supervisor=values.get("is_supervisor"),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(_crew_entry(profile=profile, membership_id=membership_id))


class PartnerCrewArchiveView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner crew"],
        operation_id="m2_partner_crew_archive",
        request=None,
        description=(
            "Take a worker off this roster. **Does not yet refuse when the worker holds a future "
            "assignment**: crew assignment is per stage and the stage model arrives with "
            "`M2-BE-522`, so there is nothing to read. A guard against a table that does not exist "
            "would be a check that always passes."
        ),
        responses={
            200: CrewMemberSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, membership_id: uuid.UUID) -> Response:
        profile = _partner_profile_or_404(request)
        membership = _crew_membership_or_404(profile=profile, membership_id=membership_id)
        try:
            archive_crew_member(membership=membership)
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(_crew_entry(profile=profile, membership_id=membership_id))


def _crew_membership_or_404(
    *,
    profile: PartnerProfile,
    membership_id: uuid.UUID,
) -> PartnerCrewMembership:
    """Scoped to the caller's own roster. A stranger's membership is `404`, never `403`."""
    membership = PartnerCrewMembership.objects.filter(
        id=membership_id,
        partner=profile,
    ).first()
    if membership is None:
        raise NotFound("Crew member was not found.")
    return membership


def _capability_record(
    *,
    profile: PartnerProfile,
    capability_id: uuid.UUID,
) -> dict[str, object]:
    """One capability as a serializer-ready dict.

    Read back through `capability_records` rather than serialized from the model directly, so the
    write paths and the list read publish the same shape. A second projection for the response of a
    command is how a created record and a listed record start disagreeing.
    """
    record = next(item for item in capability_records(profile) if item.id == capability_id)
    return asdict(record)


def _crew_entry(*, profile: PartnerProfile, membership_id: uuid.UUID) -> dict[str, object]:
    entry = next(item for item in crew_roster(profile) if item.membership_id == membership_id)
    return cast(dict[str, object], CrewMemberSerializer(asdict(entry)).data)
