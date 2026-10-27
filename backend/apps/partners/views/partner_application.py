"""The Partner's own surface: application, profile, documents, availability, presence.

Everything a signed-in Partner reads or writes about themselves before Operations is involved — the
applicant option lists, `GET`/`PATCH` on their own profile, the application and its document
uploads, the weekly schedule, and the going-online presence session. The Operations counterparts
live in `operations`; the M2 registration surface lives in `m2_registration` and `m2_crew`.
"""

import uuid
from http import HTTPStatus
from typing import cast

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.locations.serializers import PartnerServiceAreaOptionSerializer
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import PartnerProfile
from apps.partners.permissions import IsPartnerUser
from apps.partners.selectors import (
    applicant_service_areas,
    applicant_skills,
    partner_profile_for_user,
    partner_schedule,
    required_partner_consent_documents,
)
from apps.partners.serializers import (
    ExpectedVersionSerializer,
    PartnerApplicationSerializer,
    PartnerApplicationUpdateSerializer,
    PartnerConsentDocumentSerializer,
    PartnerDocumentApplicantAccessSerializer,
    PartnerDocumentFinalizeSerializer,
    PartnerDocumentSerializer,
    PartnerDocumentUploadRequestSerializer,
    PartnerDocumentUploadSerializer,
    PartnerGoOnlineSerializer,
    PartnerPresenceHeartbeatSerializer,
    PartnerPresenceSerializer,
    PartnerPresenceSessionRequestSerializer,
    PartnerProfileSerializer,
    PartnerProfileUpdateSerializer,
    PartnerScheduleSerializer,
    PartnerScheduleUpdateSerializer,
    PartnerSkillOptionSerializer,
)
from apps.partners.services import (
    ScheduleExceptionInput,
    ScheduleRuleInput,
    create_partner_document_applicant_access,
    finalize_partner_document_upload,
    go_offline,
    go_online,
    heartbeat_presence,
    issue_partner_document_upload,
    replace_partner_schedule,
    submit_partner_application,
    update_partner_application,
)
from common.errors.serializers import ApiErrorSerializer
from common.schema import PARTNER_VERSION_CONFLICT_EXAMPLE
from common.throttling import ThrottledWriteMixin

from .base import _application_response, _raise_api_error, _request_ip


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
        updates = ["updated_at"]
        if "display_name" in serializer.validated_data:
            profile.display_name = cast(str, serializer.validated_data["display_name"])
            updates.append("display_name")
        if "default_location_text" in serializer.validated_data:
            profile.default_location_text = cast(
                str, serializer.validated_data["default_location_text"]
            )
            updates.append("default_location_text")
        if len(updates) == 1:
            raise ValidationError(
                {"non_field_errors": ["Provide display_name and/or default_location_text."]}
            )
        profile.save(update_fields=updates)
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
                track=data.get("track"),
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


class PartnerDocumentUploadView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_attachment_upload"

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


class PartnerDocumentCreateView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_attachment_upload"

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


class PartnerDocumentAccessView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Partner application"],
        responses={
            200: PartnerDocumentApplicantAccessSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, document_id: uuid.UUID) -> Response:
        try:
            document, signed = create_partner_document_applicant_access(
                user=cast(User, request.user),
                document_id=document_id,
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        payload = {
            "document": document,
            "access_url": signed.review_url,
            "expires_at": signed.expires_at,
        }
        return Response(PartnerDocumentApplicantAccessSerializer(payload).data)


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
