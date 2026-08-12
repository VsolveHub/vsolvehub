"""HTTP surface for M2 requirements, enquiries and proposals.

Thin by policy. Every state change here delegates to a command in `services`, `matching` or
`proposals`; the only work these views do is authorise the actor, resolve records the caller is
allowed to see, and translate a domain refusal into the standard error envelope. If a rule appears
in this file that is not also in the domain, it is in the wrong place.

Object-level authorization is per record, not per route. A requirement that belongs to another
Customer answers `404`, never `403` — existence is itself private, and a `403` confirms there is a
record there to find.
"""

import uuid
from dataclasses import asdict
from typing import Any, NoReturn, cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.locations.models import Address
from apps.locations.services import check_serviceability
from apps.partners.capabilities import (
    assert_capability_active,
    assert_kyc_complete,
    workspace_grants,
)
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsPartnerUser
from apps.partners.selectors import partner_profile_for_user
from apps.requirements import attachments, matching, proposals, services
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementAttachment,
    RequirementQuestion,
    SiteVisit,
)
from apps.requirements.selectors import (
    customer_requirements,
    demand_preview,
    invitation_for_partner,
    partner_invitations,
    requirement_for_customer,
    requirement_summary_text,
    requirement_timeline,
    site_visit_for_participant,
)
from apps.requirements.serializers import (
    AttachmentFinalizeSerializer,
    AttachmentUploadGrantSerializer,
    AttachmentUploadRequestSerializer,
    DemandPreviewSerializer,
    DuplicateCheckQuerySerializer,
    EnquiryDeclineSerializer,
    EnquiryDetailSerializer,
    EnquirySummarySerializer,
    ProbableDuplicateListSerializer,
    ProposalCreateSerializer,
    ProposalSerializer,
    QuestionAnswerSerializer,
    QuestionCreateSerializer,
    QuoteTeaserListSerializer,
    RequirementAttachmentSerializer,
    RequirementCreateSerializer,
    RequirementDraftSerializer,
    RequirementQuestionSerializer,
    RequirementSubmitSerializer,
    RequirementSubmittedSerializer,
    RequirementSummarySerializer,
    RequirementTimelineSerializer,
    RequirementUpdateSerializer,
    SiteVisitCompleteSerializer,
    SiteVisitRequestSerializer,
    SiteVisitScheduleSerializer,
    SiteVisitSerializer,
    WorkspaceGrantListSerializer,
)
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER

DomainError = RequirementDomainError | PartnerDomainError


class M2ApiException(APIException):
    """Carries a domain refusal into `common.errors.handler` with its code intact."""

    def __init__(self, error: DomainError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = error.retryable
        super().__init__(detail=error.message, code=error.code)


def _raise_api_error(error: DomainError) -> NoReturn:
    """Always raises.

    Typed `NoReturn` deliberately: it is what lets `except ...: _raise_api_error(exc)` narrow, so
    the happy path below an error branch does not need a redundant re-raise to convince the type
    checker that a record is bound.
    """
    raise M2ApiException(error)


def _idempotency_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _draft_response(
    requirement: CustomerRequirement,
    *,
    http_status: int = status.HTTP_200_OK,
) -> Response:
    payload = RequirementDraftSerializer(
        requirement,
        context={"server_now": timezone.now()},
    ).data
    return Response(payload, status=http_status)


def _partner_profile(request: Request) -> Any:
    profile = partner_profile_for_user(cast(User, request.user))
    if profile is None:
        raise RequirementNotFoundError()
    return profile


# ---------------------------------------------------------------------------
# Customer: requirement capture
# ---------------------------------------------------------------------------


class RequirementCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class RequirementCollectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_list",
        responses={200: RequirementSummarySerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        queryset = customer_requirements(cast(User, request.user))
        paginator = RequirementCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(RequirementSummarySerializer(page, many=True).data)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_create",
        request=RequirementCreateSerializer,
        responses={
            201: RequirementDraftSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` when the service has no active A3/A5 "
                "configuration. The Customer sees 'we do not cover this yet' and a route back to "
                "the catalog, not a validation error on a field they cannot see.",
            ),
            403: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = RequirementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = get_object_or_404(
            ServiceVariant.objects.select_related("service"),
            id=serializer.validated_data["variant_id"],
            is_active=True,
        )
        try:
            requirement = services.create_draft(
                customer=cast(User, request.user),
                variant=variant,
                answers=serializer.validated_data.get("answers") or {},
                language=serializer.validated_data["language"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return _draft_response(requirement, http_status=status.HTTP_201_CREATED)


class RequirementDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_read",
        responses={200: RequirementDraftSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return _draft_response(requirement)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_update",
        request=RequirementUpdateSerializer,
        responses={
            200: RequirementDraftSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_locked` once the requirement has left DRAFT and "
                "vendors have seen it.",
            ),
        },
    )
    def patch(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = RequirementUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        customer = cast(User, request.user)

        try:
            requirement = requirement_for_customer(
                customer=customer,
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        address: Address | None = None
        service_area = None
        if values.get("address_id") is not None:
            # Scoped to the caller's own addresses: an address id is guessable, and resolving one
            # the Customer does not own would attach a stranger's location to a live requirement.
            address = get_object_or_404(
                Address,
                id=values["address_id"],
                customer=customer,
                archived_at__isnull=True,
            )
            # The same serviceability check the A1 cart uses, so the two cannot disagree about
            # which area covers a postal code.
            decision = check_serviceability(
                postal_code=address.postal_code,
                variant_id=requirement.variant_id,
            )
            service_area = decision.service_area

        try:
            requirement = services.update_draft(
                requirement=requirement,
                answers=values.get("answers"),
                address=address,
                service_area=service_area,
                requested_start=values.get("requested_start"),
                flexibility_days=values.get("flexibility_days"),
                service_by=values.get("service_by"),
                budget_min_paise=values.get("budget_min_paise"),
                budget_max_paise=values.get("budget_max_paise"),
                additional_details=values.get("additional_details"),
                language=values.get("language"),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return _draft_response(requirement)


class RequirementSubmitView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RequirementSubmitSerializer,
        responses={
            202: RequirementSubmittedSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_duplicate` (show the duplicate and offer a merge "
                "before allowing `allow_duplicate`), `m2_requirement_expired`, or "
                "`idempotency_in_progress` — wait and re-read, never resend under a new key.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = RequirementSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)

        try:
            requirement = requirement_for_customer(
                customer=customer,
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                submitted = services.submit_requirement(
                    requirement=requirement,
                    actor=customer,
                    allow_duplicate=serializer.validated_data["allow_duplicate"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            body = RequirementSubmittedSerializer(
                {
                    "id": submitted.id,
                    "status": submitted.status,
                    "service_by": submitted.service_by,
                    "quote_delivery_deadline_at": submitted.quotes_due_at,
                    # Read from the server that enforces it. A hardcoded `true` in a screen is a
                    # promise that outlives the policy it describes.
                    "is_free": True,
                    "server_now": timezone.now(),
                }
            ).data
            return status.HTTP_202_ACCEPTED, cast(dict[str, object], body)

        result = execute_idempotent(
            actor=customer,
            operation="m2.requirement.submit",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "allow_duplicate": serializer.validated_data["allow_duplicate"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementDuplicateCheckView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_duplicate_check",
        parameters=[DuplicateCheckQuerySerializer],
        responses={200: ProbableDuplicateListSerializer, 400: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        query = DuplicateCheckQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        customer = cast(User, request.user)

        variant = get_object_or_404(
            ServiceVariant, id=query.validated_data["variant_id"], is_active=True
        )
        address = get_object_or_404(
            Address, id=query.validated_data["address_id"], customer=customer
        )
        match = services.find_probable_duplicate(
            customer=customer,
            variant=variant,
            address=address,
            requested_start=query.validated_data["requested_start"],
        )

        duplicates: list[dict[str, object]] = []
        if match is not None:
            existing = CustomerRequirement.objects.select_related("variant__service").get(
                pk=match.requirement_id
            )
            duplicates.append(
                {
                    "id": existing.id,
                    "created_at": existing.created_at,
                    "summary": requirement_summary_text(existing),
                    "status": existing.status,
                    "mergeable": existing.status in CustomerRequirement.LIVE_STATUSES,
                }
            )
        return Response(ProbableDuplicateListSerializer({"probable_duplicates": duplicates}).data)


class RequirementTimelineView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_timeline",
        responses={200: RequirementTimelineSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            RequirementTimelineSerializer(
                {
                    "events": requirement_timeline(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementTeaserListView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_teaser_list",
        description=(
            "Pre-unlock quote teasers. This payload is sent to a Customer who has paid nothing, "
            "so vendor name, contact, scope, line items and the exact total are absent from the "
            "response — not merely unrendered."
        ),
        responses={200: QuoteTeaserListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        teasers = proposals.teasers_for(requirement)
        usable = [teaser for teaser in teasers if teaser.usability == Proposal.Usability.USABLE]
        payload = [
            {
                "proposal_id": teaser.proposal_id,
                "vendor_type": teaser.vendor_type,
                "is_verified": teaser.is_verified,
                "price_band_low_paise": teaser.price_band_low_paise,
                "price_band_high_paise": teaser.price_band_high_paise,
                "is_out_of_budget": teaser.usability == Proposal.Usability.OUT_OF_BUDGET,
            }
            for teaser in teasers
        ]
        return Response(
            QuoteTeaserListSerializer(
                {
                    "teasers": payload,
                    "usable_quote_count": len(usable),
                    # Fee after value, in one expression: the unlock is offered only once a quote
                    # worth unlocking exists. The unlock command re-checks this in BE4; a client
                    # holding a stale `true` still cannot buy.
                    "unlock_available": bool(usable),
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementAttachmentCollectionView(APIView):
    """Presign an attachment upload. Bytes go straight to storage, never through Django."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_attachment_upload_create",
        description=(
            "Ask for a signed upload URL. The server names the object key and records the size, "
            "media type and SHA-256 the client declares; finalization streams the stored object "
            "back and refuses anything that does not match. `scan_status` is `PENDING` on arrival "
            "because the object does not exist yet."
        ),
        request=AttachmentUploadRequestSerializer,
        responses={
            201: AttachmentUploadGrantSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_invalid` for an unsupported media type, an oversized "
                "file, a malformed checksum, or more attachments than one requirement may carry.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_locked` once the requirement has left DRAFT — a "
                "photograph appearing after a vendor quoted is a scope change, not an attachment.",
            ),
            503: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_unavailable` when the storage adapter is down. "
                "Retryable, and the only retryable error on this path.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = AttachmentUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
            grant = attachments.issue_attachment_upload(
                requirement=requirement,
                kind=values["kind"],
                content_type=values["content_type"],
                size_bytes=values["size_bytes"],
                sha256=values["sha256"],
                language=values["language"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        return Response(
            AttachmentUploadGrantSerializer(
                {
                    "id": grant.upload.id,
                    "kind": grant.upload.kind,
                    "upload_url": grant.upload_url,
                    "upload_token": grant.upload_token,
                    "upload_expires_at": grant.expires_at,
                    "scan_status": RequirementAttachment.ProcessingStatus.PENDING,
                    "server_now": timezone.now(),
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class RequirementAttachmentFinalizeView(APIView):
    """Turn a completed upload into an attachment, after verifying what actually arrived."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_attachment_finalize",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=AttachmentFinalizeSerializer,
        responses={
            201: RequirementAttachmentSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_invalid` when the stored object does not match the "
                "size, media type or checksum the client declared, when the upload expired, or "
                "when it has already been finalized.",
            ),
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = AttachmentFinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        upload_id = serializer.validated_data["upload_id"]

        try:
            requirement = requirement_for_customer(
                customer=customer,
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                attachment = attachments.finalize_attachment_upload(
                    requirement=requirement,
                    upload_id=upload_id,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_201_CREATED, cast(
                dict[str, object], RequirementAttachmentSerializer(attachment).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.requirement.attachment.finalize",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "upload_id": str(upload_id),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementAttachmentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_attachment_remove",
        description=(
            "Remove an attachment and delete the stored object. Refused after the requirement "
            "leaves DRAFT, because a vendor was invited against a snapshot and removing a "
            "photograph they quoted on rewrites the question after the answer. An `INFECTED` "
            "attachment is removable in any state."
        ),
        responses={
            204: OpenApiResponse(description="Removed."),
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def delete(
        self,
        request: Request,
        requirement_id: uuid.UUID,
        attachment_id: uuid.UUID,
    ) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
            attachments.remove_attachment(
                requirement=requirement,
                attachment_id=attachment_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequirementQuestionAnswerView(APIView):
    """The Customer's half of structured clarification."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_question_answer",
        request=QuestionAnswerSerializer,
        responses={
            200: RequirementQuestionSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, question_id: uuid.UUID) -> Response:
        serializer = QuestionAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        question = RequirementQuestion.objects.filter(
            id=question_id,
            requirement__customer=customer,
        ).first()
        if question is None:
            _raise_api_error(RequirementNotFoundError())

        try:
            answered = proposals.answer_question(
                question_id=question.id,
                answered_by=customer,
                answer=serializer.validated_data["answer"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(RequirementQuestionSerializer(answered).data)


# ---------------------------------------------------------------------------
# Partner: enquiries
# ---------------------------------------------------------------------------


class EnquiryCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class PartnerEnquiryCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_list",
        responses={200: EnquirySummarySerializer(many=True), 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        queryset = partner_invitations(profile)
        paginator = EnquiryCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(EnquirySummarySerializer(page, many=True).data)


class PartnerEnquiryDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_read",
        responses={200: EnquiryDetailSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, invitation_id: uuid.UUID) -> Response:
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(EnquiryDetailSerializer(invitation).data)


class PartnerEnquiryAcceptView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_accept",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={
            200: EnquiryDetailSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_kyc_required` — identity verification is gated here, at the "
                "first accept, rather than at registration. `m2_capability_not_approved` and "
                "`m2_capability_suspended` when the lifecycle capability is not live.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_invitation_expired`, `m2_invitation_slots_exhausted` or "
                "`m2_proposal_slot_conflict` when a linked account already holds a slot.",
            ),
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        key = _idempotency_key(request)
        actor = cast(User, request.user)
        try:
            profile = _partner_profile(request)
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            # The progressive-registration gate fires at the moment it becomes necessary. A
            # Partner browses masked demand freely; proving who they are is the price of taking
            # a slot away from another vendor, not the price of looking.
            assert_kyc_complete(profile)
            assert_capability_active(partner=profile, variant=invitation.requirement.variant)
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                accepted = matching.accept_invitation(invitation_id=invitation.id)
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(
                dict[str, object], EnquiryDetailSerializer(accepted).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.enquiry.accept",
            key=key,
            request_payload={"invitation_id": str(invitation_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerEnquiryDeclineView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_decline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=EnquiryDeclineSerializer,
        responses={
            200: EnquiryDetailSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = EnquiryDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = _idempotency_key(request)
        actor = cast(User, request.user)
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                declined = matching.decline_invitation(
                    invitation_id=invitation.id,
                    reason_code=serializer.validated_data["reason_code"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(
                dict[str, object], EnquiryDetailSerializer(declined).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.enquiry.decline",
            key=key,
            request_payload={
                "invitation_id": str(invitation_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerEnquiryQuestionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_question_create",
        request=QuestionCreateSerializer,
        responses={
            201: RequirementQuestionSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = QuestionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            question = proposals.ask_question(
                invitation_id=invitation.id,
                asked_by=cast(User, request.user),
                question=serializer.validated_data["question"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            RequirementQuestionSerializer(question).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerEnquirySiteVisitView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_site_visit_request",
        description=(
            "Request a paid site visit. The fee is what makes a vendor willing to travel before "
            "winning the job; free visits are not offered. Charging the fee is not built until "
            "BE4 — this records the request and its fee."
        ),
        request=SiteVisitRequestSerializer,
        responses={
            201: SiteVisitSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = SiteVisitRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            visit = proposals.request_site_visit(
                invitation_id=invitation.id,
                fee_paise=serializer.validated_data["fee_paise"],
                adjusts_against_final_price=serializer.validated_data[
                    "adjusts_against_final_price"
                ],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(SiteVisitSerializer(visit).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Site visits, shared by both roles
#
# A visit has two participants and both need to move it, so these routes sit outside the
# `partner/` and `requirements/` prefixes and resolve by participation rather than by role. Wave C0
# published `request_site_visit` only, which left a paid visit that could be asked for and never
# scheduled or closed.
# ---------------------------------------------------------------------------


class SiteVisitScheduleView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_schedule",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        description=(
            "Put a time on a requested visit, or move one already scheduled. Either party may "
            "call it: the vendor proposes a slot they can travel in, the Customer confirms a time "
            "somebody will be on site, and neither can do it alone."
        ),
        request=SiteVisitScheduleSerializer,
        responses={
            200: SiteVisitSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` once the visit is completed "
                "or cancelled.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        serializer = SiteVisitScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)

        try:
            visit = site_visit_for_participant(user=actor, site_visit_id=site_visit_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                scheduled = proposals.schedule_site_visit(
                    site_visit_id=visit.id,
                    scheduled_for=serializer.validated_data["scheduled_for"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(scheduled).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.schedule",
            key=key,
            request_payload={
                "site_visit_id": str(site_visit_id),
                "scheduled_for": serializer.validated_data["scheduled_for"].isoformat(),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SiteVisitCompleteView(APIView):
    """Only the vendor closes a visit, because only the vendor attended it.

    Scheduling takes both parties; completion is a report of what happened, and the party that
    travelled is the one who can make it. A Customer who disagrees with the outcome has the
    clarification timeline and, from Wave C6, a case — not a competing completion.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_complete",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SiteVisitCompleteSerializer,
        responses={
            200: SiteVisitSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit was never "
                "scheduled. A visit with no agreed time cannot have happened.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        serializer = SiteVisitCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)

        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        visit = SiteVisit.objects.filter(
            id=site_visit_id,
            invitation__partner=profile,
        ).first()
        if visit is None:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                completed = proposals.complete_site_visit(
                    site_visit_id=visit.id,
                    outcome_notes=serializer.validated_data.get("outcome_notes", ""),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(completed).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.complete",
            key=key,
            request_payload={
                "site_visit_id": str(site_visit_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Partner: proposals
# ---------------------------------------------------------------------------


class PartnerProposalCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Proposals"],
        operation_id="m2_proposal_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        description=(
            "Submit a quote, or a revision that supersedes this vendor's previous one. Proposals "
            "are append-only: a revision never overwrites what the Customer was originally "
            "offered. The archetype decides which fields are required and the server enforces it."
        ),
        request=ProposalCreateSerializer,
        responses={
            201: ProposalSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_proposal_invalid_shape` when the quote does not match the "
                "requirement's lifecycle or the stage totals do not reconcile; "
                "`m2_proposal_below_wage_floor`; `m2_wage_floor_unavailable` when no floor is "
                "loaded for the state and skill — this fails closed rather than guessing.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = ProposalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        invitation_id = values.pop("invitation_id")
        key = _idempotency_key(request)
        actor = cast(User, request.user)

        try:
            profile = _partner_profile(request)
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            assert_capability_active(partner=profile, variant=invitation.requirement.variant)
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                proposal = proposals.submit_proposal(invitation_id=invitation.id, **values)
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)

            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProposalSerializer(proposal).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.proposal.submit",
            key=key,
            request_payload={"invitation_id": str(invitation_id), **values},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerProposalDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Proposals"],
        operation_id="m2_proposal_read",
        responses={200: ProposalSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, proposal_id: uuid.UUID) -> Response:
        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = Proposal.objects.filter(id=proposal_id, partner=profile).first()
        if proposal is None:
            _raise_api_error(RequirementNotFoundError())
        return Response(ProposalSerializer(proposal).data)


class PartnerProposalWithdrawView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Proposals"],
        operation_id="m2_proposal_withdraw",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={
            200: ProposalSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, proposal_id: uuid.UUID) -> Response:
        key = _idempotency_key(request)
        actor = cast(User, request.user)
        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        existing = Proposal.objects.filter(id=proposal_id, partner=profile).first()
        if existing is None:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                withdrawn = proposals.withdraw_proposal(proposal_id=proposal_id)
            except RequirementDomainError as exc:
                _raise_api_error(exc)

            return status.HTTP_200_OK, cast(dict[str, object], ProposalSerializer(withdrawn).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.proposal.withdraw",
            key=key,
            request_payload={"proposal_id": str(proposal_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Partner: workspace grants
#
# Lives here rather than in `apps.partners.views` only because the M2 URL module is here; the
# read model itself is `partners.capabilities.workspace_grants`.
# ---------------------------------------------------------------------------


class PartnerWorkspaceListView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner workspaces"],
        operation_id="m2_partner_workspace_list",
        description=(
            "The Partner's approved lifecycle capabilities as `{workspace_key, commercial_mode, "
            "actions[]}`. Drives navigation and nothing else: no routes, no labels, no icons. "
            'A Partner with no approved capability receives `200 {"workspaces": []}` — that is '
            "a real, common state (registered, not yet reviewed), not an error. Suspension is "
            "expressed by omitting the workspace or reducing its actions, never by an error, so "
            "navigation degrades in place rather than blanking mid-session."
        ),
        responses={200: WorkspaceGrantListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        grants = workspace_grants(profile) if profile is not None else []
        return Response(WorkspaceGrantListSerializer({"workspaces": grants}).data)


class PartnerDemandPreviewView(APIView):
    """Masked live demand, for a Partner who has proved nothing yet.

    Lives in this module rather than `apps.partners.views` because it reads `CustomerRequirement`,
    and `apps.requirements` already depends on `apps.partners`. Putting it the other way round would
    make the two apps import each other.

    `IsPartnerUser` rather than `IsAuthenticated`: a Partner who has begun registering holds the
    role before any document is verified, so the gate here is "is a vendor" and not "is vetted" —
    which is the whole point of the screen.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner workspaces"],
        operation_id="m2_partner_demand_preview",
        description=(
            "Live requirement summaries in the areas this Partner serves, masked. **Customer "
            "name, phone, full address, building number and the exact budget are absent from the "
            "response.** `id` is a preview identifier — a keyed hash, not a requirement primary "
            "key — and resolves on no other route. Ineligible demand is returned with a hint "
            "rather than hidden: hiding it would make an empty screen the first thing most new "
            'Partners see. An empty list is a real answer ("nothing in your area right now"), '
            "never a `404`."
        ),
        responses={200: DemandPreviewSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = partner_profile_for_user(cast(User, request.user))
        summaries: list[dict[str, Any]] = []
        matched = 0
        if profile is not None:
            found, matched = demand_preview(profile)
            summaries = [asdict(summary) for summary in found]
        return Response(
            DemandPreviewSerializer(
                {
                    "summaries": summaries,
                    "matched_service_count": matched,
                    "server_now": timezone.now(),
                }
            ).data
        )


__all__ = [
    "PartnerDemandPreviewView",
    "PartnerEnquiryAcceptView",
    "PartnerEnquiryCollectionView",
    "PartnerEnquiryDeclineView",
    "PartnerEnquiryDetailView",
    "PartnerEnquiryQuestionView",
    "PartnerEnquirySiteVisitView",
    "PartnerProposalCollectionView",
    "PartnerProposalDetailView",
    "PartnerProposalWithdrawView",
    "PartnerWorkspaceListView",
    "RequirementAttachmentCollectionView",
    "RequirementAttachmentDetailView",
    "RequirementAttachmentFinalizeView",
    "RequirementCollectionView",
    "RequirementDetailView",
    "RequirementDuplicateCheckView",
    "RequirementQuestionAnswerView",
    "RequirementSubmitView",
    "RequirementTeaserListView",
    "RequirementTimelineView",
    "SiteVisitCompleteView",
    "SiteVisitScheduleView",
]
