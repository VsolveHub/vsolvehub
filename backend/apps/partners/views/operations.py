"""The Operations review surface for Partners.

The review queue and the Partner directory, one application's or one Partner's detail record, the
claim, the document reveal, the status transition, the document decision, and the Operations-side
schedule replacement.

Two guards run through the whole slice: a reviewer may not act on their own record, and every read
of a named person is recorded.
"""

import csv
import hashlib
import io
import uuid
from typing import Any, cast

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import AccessAuditEvent, Role, User, UserRole
from apps.identity.phone import normalize_phone_number
from apps.identity.services import record_access_event
from apps.partners.capabilities import verify_business_tax_profile
from apps.partners.exceptions import PartnerDomainError, PartnerSelfReviewError
from apps.partners.models import PartnerDocument, PartnerProfile
from apps.partners.permissions import IsOperationsUser
from apps.partners.selectors import (
    operations_partner_application_detail,
    operations_partner_application_queue,
    operations_partner_detail,
    operations_partner_directory,
    partner_application_for_user,
)
from apps.partners.serializers import (
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
    OperationsTaxProfileVerifySerializer,
    OperationsTransitionSerializer,
    PartnerApplicationSerializer,
    PartnerBusinessProfileSerializer,
    PartnerDocumentReviewAccessSerializer,
    PartnerDocumentSerializer,
    PartnerScheduleSerializer,
)
from apps.partners.services import (
    ScheduleExceptionInput,
    ScheduleRuleInput,
    claim_partner_application,
    create_partner_document_review_access,
    release_partner_application_review,
    replace_partner_schedule_for_operations,
    review_partner_document,
    transition_partner_application,
)
from common.errors.serializers import ApiErrorSerializer
from common.observability.context import get_request_id
from common.schema import PARTNER_VERSION_CONFLICT_EXAMPLE

from .base import (
    OperationsApplicationCursorPagination,
    OperationsPartnerDirectoryCursorPagination,
    _audit_self_review_denial,
    _raise_api_error,
)


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


class OperationsPartnerTaxProfileVerificationView(APIView):
    permission_classes = (IsOperationsUser,)

    @extend_schema(
        tags=["Operations - Partners"],
        operation_id="operations_partner_tax_profile_verify",
        request=OperationsTaxProfileVerifySerializer,
        responses={
            200: PartnerBusinessProfileSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, partner_id: uuid.UUID) -> Response:
        serializer = OperationsTaxProfileVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        partner = PartnerProfile.objects.filter(pk=partner_id).first()
        if partner is None:
            raise NotFound("Partner not found.")
        try:
            profile = verify_business_tax_profile(
                partner=partner,
                actor=cast(User, request.user),
                registered_state_code=str(
                    serializer.validated_data.get("registered_state_code") or ""
                ),
            )
        except PartnerDomainError as exc:
            _raise_api_error(exc)
        return Response(PartnerBusinessProfileSerializer(profile).data)


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


class OperationsPartnerApplicationReleaseView(APIView):
    """Give a claimed application back to the queue, so another reviewer can take it."""

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
            application = release_partner_application_review(
                actor=actor,
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


class PartnerImportView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    parser_classes = (MultiPartParser,)

    @extend_schema(summary="Import partners via CSV", request=dict, tags=["operations"])
    def post(self, request: Request) -> Response:
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "File required"}, status=status.HTTP_400_BAD_REQUEST)

        dry_run = request.data.get("dry_run", "true").lower() == "true"

        file_bytes = file_obj.read()
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        try:
            content = file_bytes.decode("utf-8")
            reader = csv.DictReader(io.StringIO(content))
        except Exception:
            return Response({"detail": "Invalid CSV file"}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        skipped = 0
        errors = 0
        rows: list[dict[str, Any]] = []

        # We need to import User and PartnerProfile to create them

        try:
            with transaction.atomic():
                partner_role, _ = Role.objects.get_or_create(
                    code="partner", defaults={"name": "Partner"}
                )
                for i, row in enumerate(reader, start=2):
                    phone = row.get("phone", "").strip()
                    full_name = row.get("full_name", "").strip()

                    if not phone or not full_name:
                        errors += 1
                        rows.append(
                            {"row": i, "status": "error", "message": "Phone and full_name required"}
                        )
                        continue

                    try:
                        phone = normalize_phone_number(phone)
                    except Exception:
                        errors += 1
                        rows.append(
                            {"row": i, "status": "error", "message": "Invalid phone number format"}
                        )
                        continue

                    if User.objects.filter(phone_number=phone).exists():
                        skipped += 1
                        rows.append({"row": i, "status": "skipped", "message": "Phone exists"})
                        continue

                    if not dry_run:
                        user = User.objects.create_user(phone_number=phone, full_name=full_name)
                        UserRole.objects.create(user=user, role=partner_role)
                        PartnerProfile.objects.create(
                            user=user,
                            display_name=full_name,
                        )

                    created += 1
                    rows.append({"row": i, "status": "created", "phone": phone})

                if dry_run:
                    transaction.set_rollback(True)
        except Exception as e:
            return Response(
                {"detail": f"Import failed: {e!s}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                "dry_run": dry_run,
                "file_hash": file_hash,
                "results": {
                    "created": created,
                    "skipped": skipped,
                    "errors": errors,
                    "rows": rows,
                },
            }
        )
