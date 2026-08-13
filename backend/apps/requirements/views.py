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
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
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
from apps.requirements import (
    access,
    attachments,
    engagements,
    matching,
    pricing,
    proposals,
    services,
    visit_slots,
)
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementDomainError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Proposal,
    RequirementAttachment,
    RequirementQuestion,
    SiteVisit,
    VisitPlan,
)
from apps.requirements.selectors import (
    customer_readable_proposals,
    customer_requirements,
    demand_preview,
    engagement_for_participant,
    invitation_for_partner,
    partner_invitations,
    partner_proposals,
    requirement_for_customer,
    requirement_summary_text,
    requirement_timeline,
    selection_for_partner,
    site_visit_for_participant,
    stage_for_customer,
)
from apps.requirements.serializers import (
    AccessCheckoutSerializer,
    AttachmentFinalizeSerializer,
    AttachmentUploadGrantSerializer,
    AttachmentUploadRequestSerializer,
    CustomerProposalSerializer,
    CustomerQuoteListSerializer,
    DemandPreviewSerializer,
    DuplicateCheckQuerySerializer,
    EngagementSerializer,
    EnquiryDeclineSerializer,
    EnquiryDetailSerializer,
    EnquirySummaryPageSerializer,
    EnquirySummarySerializer,
    ProbableDuplicateListSerializer,
    ProposalCreateSerializer,
    ProposalPageSerializer,
    ProposalRejectSerializer,
    ProposalSelectionSerializer,
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
    RequirementSummaryPageSerializer,
    RequirementSummarySerializer,
    RequirementTimelineSerializer,
    RequirementUpdateSerializer,
    SelectionCreateSerializer,
    SelectionDeclineSerializer,
    SiteVisitCompleteSerializer,
    SiteVisitRequestSerializer,
    SiteVisitScheduleSerializer,
    SiteVisitSerializer,
    UnlockStateSerializer,
    VendorAttachmentListSerializer,
    VisitArrivalSerializer,
    VisitNoShowSerializer,
    VisitPlanChooseSerializer,
    VisitPlanSerializer,
    VisitPlanStateSerializer,
    VisitSlotConfirmationSerializer,
    VisitSlotConfirmSerializer,
    VisitSlotGridSerializer,
    WorkspaceGrantListSerializer,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    BoundedCursorQuerySerializer,
    StrictCursorPagination,
    reject_invalid_cursor_query,
)
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


def _checkout_payload(attempt: Any) -> dict[str, object]:
    """One M2 charge, as much of it as a client is entitled to see.

    `provider_order_id` is usually blank in this response and that is correct rather than a race to
    paper over: the order is created by the outbox consumer that
    `initiate_standalone_payment_attempt` enqueues, so the attempt exists before the provider knows
    about it. The client polls the state read beside it. Creating the order inline would put a
    third-party HTTP call inside the transaction that took the Customer's slot.
    """
    return {
        "payment_attempt_id": attempt.id,
        "amount_paise": attempt.amount_paise,
        "currency": attempt.currency,
        "provider": attempt.provider,
        "provider_order_id": attempt.provider_order_id,
        "status": attempt.status,
        "expires_at": attempt.expires_at,
        "server_now": timezone.now(),
    }


def _optional_policy(read: Any) -> Any:
    """Read an owner-blocked policy value, or `None` when the owner has not set it.

    Used **only on reads**. Every command still fails closed — `m2_policy_unavailable` — because a
    command that guessed would act on a rule nobody approved. A read is different: refusing the
    whole screen because one optional number is unset would hide a request the Customer can still
    see the rest of, so the field arrives `null` and the UI renders nothing where it would have
    rendered a promise.
    """
    try:
        return read()
    except PolicyUnavailableError:
        return None


def _proposal_for_customer(*, requirement: CustomerRequirement, proposal_id: uuid.UUID) -> Proposal:
    proposal = Proposal.objects.filter(id=proposal_id, requirement=requirement).first()
    if proposal is None:
        _raise_api_error(RequirementNotFoundError())
    return proposal


# ---------------------------------------------------------------------------
# Customer: requirement capture
# ---------------------------------------------------------------------------


class RequirementCursorPagination(StrictCursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class RequirementCollectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_list",
        parameters=[BoundedCursorQuerySerializer],
        responses={
            200: RequirementSummaryPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
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


class EnquiryCursorPagination(StrictCursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class PartnerEnquiryCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_list",
        parameters=[BoundedCursorQuerySerializer],
        responses={
            200: EnquirySummaryPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
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
                description="`m2_invitation_expired`, `m2_invitation_slots_exhausted`, "
                "`m2_proposal_slot_conflict` when a linked account already holds a slot, or "
                "`m2_capacity_unavailable` when the vendor already has work booked on these "
                "dates — either another M2 enquiry they accepted or an A1 booking on the shared "
                "availability grid.",
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
            requirement = invitation.requirement
            assert_capability_active(
                partner=profile,
                variant=requirement.variant,
                # Coverage and calendar are checked here, at the moment a slot is taken, rather
                # than only when the wave was built. A vendor's areas and days off move between
                # the two, and the invitation is the point where a stale answer costs a Customer
                # a quote slot.
                service_area=requirement.service_area,
                on_day=(
                    requirement.requested_start.date()
                    if requirement.requested_start is not None
                    else None
                ),
            )
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


class PartnerEnquiryAttachmentListView(APIView):
    """The Customer's site photographs, for one vendor, while they are still entitled to them."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_enquiry_attachment_list",
        description=(
            "Short-lived signed links to the requirement's **checked** attachments. Access lasts "
            "as long as the invitation holds a quote slot, and ends when it is declined, expired "
            "or withdrawn — only the selected vendor keeps it. Expiry is reported as "
            "`has_access: false` on a `200`, not as an error: the vendor still owns their enquiry "
            "record, and an empty list without that flag would read as 'the Customer attached "
            "nothing'. No link is minted once access has lapsed, because a signed URL is a bearer "
            "credential and hiding a button is not revocation."
        ),
        responses={
            200: VendorAttachmentListSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            503: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_unavailable` when the storage adapter is down.",
            ),
        },
    )
    def get(self, request: Request, invitation_id: uuid.UUID) -> Response:
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            access = attachments.vendor_attachments(invitation=invitation)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        return Response(
            VendorAttachmentListSerializer(
                {
                    "has_access": access.has_access,
                    "attachments": [
                        {
                            "id": granted.attachment.id,
                            "kind": granted.attachment.kind,
                            "size_bytes": granted.attachment.size_bytes,
                            "language": granted.attachment.transcript_language,
                            "download_url": granted.download_url,
                            "expires_at": granted.expires_at,
                        }
                        for granted in access.attachments
                    ],
                    "server_now": timezone.now(),
                }
            ).data
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


class ProposalCursorPagination(StrictCursorPagination):
    page_size = 20
    ordering = ("-submitted_at", "id")


class PartnerProposalCollectionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Proposals"],
        operation_id="m2_proposal_list",
        parameters=[
            BoundedCursorQuerySerializer,
            OpenApiParameter(
                name="requirement",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Narrow to one request. The result set is scoped to the caller's own "
                "proposals first, so this filters a set they already own and cannot be used to "
                "discover a request they were never invited to.",
            ),
        ],
        description=(
            "Every quote this vendor has submitted, newest first. **This closes the largest hole "
            "in the Partner surface**: until 1.24.0 a vendor could submit a quote and read it back "
            "only by remembering its id, so withdraw, the six proposal states and the whole "
            "supersession trace ended when the tab closed."
        ),
        responses={
            200: ProposalPageSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        requirement_id: uuid.UUID | None = None
        raw = request.query_params.get("requirement")
        if raw:
            try:
                requirement_id = uuid.UUID(raw)
            except ValueError as exc:
                raise ValidationError(
                    {"requirement": "This must be a UUID."}, code="requirement_invalid"
                ) from exc

        queryset = partner_proposals(partner=profile, requirement_id=requirement_id)
        paginator = ProposalCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(ProposalSerializer(page, many=True).data)

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
                "`m2_proposal_below_wage_floor` when an A3 daily rate is under the statutory "
                "floor for the requirement's own state and skill. **Neither the state nor the "
                "skill is accepted from the caller** — both are derived from the requirement, so "
                "a vendor cannot influence the floor they are measured against.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_wage_floor_unavailable` when Operations has not mapped this "
                "variant to a wage-floor skill, has not set a state code on the service area, or "
                "has loaded no floor for that pair. This **fails closed** — an A3 quote is refused "
                "rather than accepted unchecked, because brokering labour below the statutory "
                "minimum is a violation the platform carries, not only the vendor.",
            ),
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
            requirement = invitation.requirement
            assert_capability_active(
                partner=profile,
                variant=requirement.variant,
                service_area=requirement.service_area,
            )
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
# Wave C2: the A3 unlock
# ---------------------------------------------------------------------------


class RequirementUnlockView(APIView):
    """The A3 paywall. Read it to know whether it can be bought; post to start buying it."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_unlock_read",
        description=(
            "The unlock state for one A3 request. `unlock` is `null` until a checkout has been "
            "started, and reaching `ACTIVE` requires a **verified provider callback** — a client "
            "redirect saying the payment succeeded never grants access. `price_paise` is `null` "
            "when Operations has loaded no effective price, which is a real state while the tier "
            "prices are an open owner decision: the screen says we cannot offer this yet rather "
            "than showing a number nobody approved."
        ),
        responses={200: UnlockStateSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        price = _optional_policy(pricing.unlock_price)
        unlock = access.active_unlock(requirement) or access.latest_unlock(requirement)
        return Response(
            UnlockStateSerializer(
                {
                    "unlock": unlock,
                    "is_available": access.unlock_availability(requirement),
                    "price_paise": price.amount_paise if price is not None else None,
                    "usable_quote_count": len(access.usable_proposals(requirement)),
                    "can_read_full_quotes": access.customer_may_read_full_quotes(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_unlock_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Start the charge that unlocks delivered quotes. **A3 only**, and refused unless at "
            "least one usable quote is live at this instant — that is what makes 'paid but nothing "
            "happened' unreachable rather than merely unlikely. Repeating the call while a "
            "previous attempt is still pending returns that attempt rather than starting a second "
            "charge."
        ),
        responses={
            201: AccessCheckoutSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` on an A5 request, which uses a visit "
                "plan and has no unlock.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_unlock_not_available` when no usable quote exists yet or the "
                "request is already unlocked; `m2_access_price_unavailable` when Operations has "
                "loaded no effective price — this **fails closed** rather than charging a guess.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                _unlock, attempt = access.create_unlock_checkout(
                    requirement_id=requirement.id,
                    actor=customer,
                    idempotency_key=key,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], AccessCheckoutSerializer(_checkout_payload(attempt)).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.unlock.checkout",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C2: the A5 visit plan
# ---------------------------------------------------------------------------


class RequirementVisitPlanView(APIView):
    """The A5 front door: the tier chooser before a plan exists, the tracker after."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_visit_plan_read",
        description=(
            "The visit plan for one A5 request. Before a plan is chosen this carries "
            "`available_tiers` — the priced options for the review screen's chooser, and an "
            "**empty list is the honest answer** while the owner has priced no tier. After a plan "
            "exists it carries the plan, its per-slot shares and the confirmed visits with their "
            "scheduled times. Choosing a plan charges nothing; the whole plan is charged once, at "
            "the first confirmed visit slot."
        ),
        responses={200: VisitPlanStateSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        plan = VisitPlan.objects.filter(requirement=requirement).prefetch_related("shares").first()
        tiers = [
            {"plan_size": tier.row.plan_size, "price_paise": tier.amount_paise}
            for tier in pricing.available_visit_plan_tiers()
        ]
        visits = SiteVisit.objects.filter(
            requirement=requirement,
            plan_share__isnull=False,
        ).order_by("plan_share__position", "created_at")
        return Response(
            VisitPlanStateSerializer(
                {
                    "plan": plan,
                    "available_tiers": tiers,
                    "visits": visits,
                    "checkout_available": access.visit_plan_checkout_availability(requirement),
                    "can_read_full_estimates": access.customer_may_read_full_quotes(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_visit_plan_choose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitPlanChooseSerializer,
        description=(
            "Choose how many verified professionals will visit and estimate on site: one, two or "
            "three. **This charges nothing** — it bounds the invitation wave and snapshots the "
            "price the Customer was shown, so a price loaded between choosing and the first vendor "
            "confirming cannot silently become what they pay. Re-choosing is allowed while no "
            "vendor has committed to a slot. A5 only; an A3 request has no visit plan."
        ),
        responses={
            200: VisitPlanSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` on an A3 request.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_access_price_unavailable` when this tier has no effective price; "
                "`m2_requirement_transition_not_allowed` once a vendor has committed to a visit, "
                "because resizing a plan somebody is already travelling for is not a choice.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = VisitPlanChooseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                plan = access.choose_visit_plan(
                    requirement_id=requirement.id,
                    plan_size=serializer.validated_data["plan_size"],
                    actor=customer,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], VisitPlanSerializer(plan).data)

        result = execute_idempotent(
            actor=customer,
            operation="m2.visit_plan.choose",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementVisitPlanCheckoutView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_visit_plan_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Pay for the whole visit plan, once, against a slot a vendor has actually committed "
            "to. The first vendor's slot is held while this completes and **lapses harmlessly if "
            "the Customer never pays** — nothing was charged and the vendor's time returns to the "
            "availability grid. The held slot hardens to `SCHEDULED` only on the verified provider "
            "callback. Later vendors book without any further payment."
        ),
        responses={
            201: AccessCheckoutSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_plan_not_chargeable` when no vendor holds a slot yet, when "
                "the plan is already paid for, or when a reclassification credit already covers "
                "it; `m2_visit_plan_required` when no plan has been chosen.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                _plan, attempt = access.create_visit_plan_checkout(
                    requirement_id=requirement.id,
                    actor=customer,
                    idempotency_key=key,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], AccessCheckoutSerializer(_checkout_payload(attempt)).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.visit_plan.checkout",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C2: reading, rejecting and re-validating quotes
# ---------------------------------------------------------------------------


class RequirementQuoteListView(APIView):
    """Full quotes and estimates, for a Customer who has paid to read them."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_list",
        description=(
            "Every quote (A3) or on-site estimate (A5) in full: scope, line items, stages, taxes, "
            "validity and the vendor's identity. **Entitlement is enforced here, not hidden in the "
            "UI** — an A3 request needs an active unlock and an A5 request needs a charged visit "
            "plan, and without one this refuses rather than returning a shortened payload. "
            "Contact details are not in this response at any status; they are released by the "
            "engagement, not by the fee."
        ),
        responses={
            200: CustomerQuoteListSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_unlock_required` — the A3 quotes are still behind the unlock.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_plan_required` — no A5 visit plan has been charged, so no "
                "estimate has been bought yet.",
            ),
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
            access.assert_customer_may_read_full_quotes(requirement)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        cap = _optional_policy(lambda: pricing.non_responsive_rejection_cap(requirement))
        used = proposals.non_responsive_rejection_count(requirement)
        return Response(
            CustomerQuoteListSerializer(
                {
                    "quotes": customer_readable_proposals(requirement),
                    "non_responsive_rejections_remaining": (
                        max(cap - used, 0) if cap is not None else None
                    ),
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementQuoteRejectView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_reject",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposalRejectSerializer,
        description=(
            "Refuse a quote. `NOT_CHOSEN` is bookkeeping — the Customer preferred somebody else "
            "and nothing further happens. `NON_RESPONSIVE` is the control against slot squatting: "
            "it releases the vendor's slot and buys a replacement **at no extra charge** — a new "
            "quote slot on A3, a free replacement visit on A5 — up to a configured cap."
        ),
        responses={
            200: CustomerProposalSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_rejection_cap_reached` when every free replacement has been "
                "used; `m2_proposal_not_selectable` when the quote is no longer live; "
                "`m2_policy_unavailable` when the owner has not set the cap — the free "
                "replacement is refused rather than promised on a rule that does not exist.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID) -> Response:
        serializer = ProposalRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                rejected = proposals.reject_proposal(
                    requirement_id=requirement.id,
                    proposal_id=proposal.id,
                    reason=serializer.validated_data["reason"],
                    actor=customer,
                    note=serializer.validated_data["note"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], CustomerProposalSerializer(rejected).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.quote.reject",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "proposal_id": str(proposal_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementQuoteRevalidateView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_quote_revalidate",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Ask this vendor to put a fresh price on a quote whose validity has passed. **This "
            "charges nothing and reuses the unlock or visit plan already paid for** — expiry must "
            "not be a dead end that forces a second purchase. The vendor answers by superseding "
            "the quote; the expired revision stays readable and stays unselectable, because only "
            "a vendor can state a price."
        ),
        responses={
            200: CustomerProposalSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_proposal_not_selectable` when the quote has not expired, when "
                "the request already has a chosen vendor, or when the caller has not unlocked "
                "these quotes at all.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                asked = proposals.request_revalidation(
                    requirement_id=requirement.id,
                    proposal_id=proposal.id,
                    actor=customer,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], CustomerProposalSerializer(asked).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.quote.revalidate",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "proposal_id": str(proposal_id),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C2: selection, reconfirmation and the engagement
# ---------------------------------------------------------------------------


class RequirementSelectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Selection"],
        operation_id="m2_selection_read",
        description=(
            "The live selection for this request, or `null`. `reconfirm_by` is the vendor's "
            "deadline; `engagement_id` fills in once they reconfirm."
        ),
        responses={200: ProposalSelectionSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        selection = requirement.selections.order_by("-created_at").first()
        if selection is None:
            _raise_api_error(RequirementNotFoundError())
        return Response(ProposalSelectionSerializer(selection).data)

    @extend_schema(
        tags=["M2 - Selection"],
        operation_id="m2_selection_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SelectionCreateSerializer,
        description=(
            "Choose one vendor. **Selection is not a booking**: it starts the vendor's "
            "reconfirmation clock, and the engagement opens only when they commit — A3 on their "
            "reconfirmation, A5 when the first stage is funded. If they decline or the clock runs "
            "out, the unlock or visit-plan entitlement survives untouched and the next quote costs "
            "nothing more. Multiple simultaneous selections are not supported."
        ),
        responses={
            201: ProposalSelectionSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_unlock_required` — an A3 quote cannot be selected unread.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_selection_conflict` when another session selected first "
                "(retryable, and the answer changes on its own); `m2_proposal_not_selectable` for "
                "a superseded, withdrawn or expired quote, or an A5 estimate with no completed "
                "visit behind it; `m2_visit_plan_required` when the A5 plan is unpaid.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        serializer = SelectionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        proposal = _proposal_for_customer(
            requirement=requirement,
            proposal_id=serializer.validated_data["proposal_id"],
        )

        def command() -> tuple[int, dict[str, object]]:
            try:
                selection = engagements.select_proposal(
                    requirement_id=requirement.id,
                    proposal_id=proposal.id,
                    actor=customer,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProposalSelectionSerializer(selection).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.selection.create",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "proposal_id": str(serializer.validated_data["proposal_id"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SelectionReconfirmView(APIView):
    """The vendor commits, and the engagement opens."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Selection"],
        operation_id="m2_selection_reconfirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Confirm price, date and capacity after being chosen. **Everything is re-checked "
            "here** rather than trusted from quoting time: the capability against this request's "
            "own area and start date, the vendor's diary on the shared availability grid, and the "
            "quote's validity. A vendor whose approval lapsed in between must not end up holding "
            "authorised money against unauthorised work."
        ),
        responses={
            200: EngagementSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_not_approved` or `m2_capability_suspended` when the "
                "lifecycle capability is no longer live.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_reconfirmation_expired` when the deadline passed — the selection "
                "is expired in the same call, so the Customer is not left waiting; "
                "`m2_capacity_unavailable` when the vendor's diary filled; "
                "`m2_proposal_not_selectable` when the quote's own validity elapsed; "
                "`m2_policy_unavailable` when the A5 commission terms are unset.",
            ),
        },
    )
    def post(self, request: Request, selection_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            selection = selection_for_partner(
                partner=_partner_profile(request),
                selection_id=selection_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                engagement = engagements.reconfirm_selection(selection_id=selection.id)
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], EngagementSerializer(engagement).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.selection.reconfirm",
            key=key,
            request_payload={"selection_id": str(selection_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SelectionDeclineView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Selection"],
        operation_id="m2_selection_decline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SelectionDeclineSerializer,
        description=(
            "Decline after being chosen. The quote is marked `LAPSED` rather than `REJECTED` — a "
            "rejection is the Customer's refusal, and a vendor reading it against their own "
            "decision would be told the wrong story about their own standing. The Customer's "
            "unlock or visit plan survives and the next quote costs nothing more."
        ),
        responses={
            200: ProposalSelectionSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, selection_id: uuid.UUID) -> Response:
        serializer = SelectionDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            selection = selection_for_partner(
                partner=_partner_profile(request),
                selection_id=selection_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                declined = engagements.decline_selection(
                    selection_id=selection.id,
                    reason_code=serializer.validated_data["reason_code"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ProposalSelectionSerializer(declined).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.selection.decline",
            key=key,
            request_payload={"selection_id": str(selection_id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementDetailView(APIView):
    """One agreement, readable by either party to it."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Engagements"],
        operation_id="m2_engagement_read",
        description=(
            "The agreement frozen at reconfirmation, with its ordered stages. **Read "
            "`commercial_mode` before promising anything**: `LEAD_ONLY` (A3) means the Customer "
            "pays the vendor directly and Vsolve's protection is matching and replacement, not a "
            "protected booking. `MANAGED_PAYMENT_REQUIRED` (A5) funds one stage at a time, at face "
            "value — the visit-plan money settles per share and never discounts a stage."
        ),
        responses={200: EngagementSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        try:
            engagement = engagement_for_participant(
                user=cast(User, request.user),
                engagement_id=engagement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(EngagementSerializer(engagement).data)


class EngagementStageFundingView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Engagements"],
        operation_id="m2_stage_funding_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Fund one A5 stage, **at face value and in order**. There is no stage credit: the "
            "visit-plan money was spent on the visits themselves and settles per share, so "
            "discounting a stage by it would pay for those visits twice out of the vendor's work. "
            "Projects collect one stage at a time and never the full project value because a "
            "proposal was accepted."
        ),
        responses={
            201: AccessCheckoutSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_not_funded` when the stage is already funded, when an "
                "earlier stage is not, or when the engagement is `LEAD_ONLY` and paid directly to "
                "the vendor.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_customer(customer=customer, stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                _stage, attempt = engagements.create_stage_funding_checkout(
                    stage_id=stage.id,
                    actor=customer,
                    idempotency_key=key,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], AccessCheckoutSerializer(_checkout_payload(attempt)).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.stage.funding_checkout",
            key=key,
            request_payload={"stage_id": str(stage_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C2: A5 visit slots — the read the whole Partner picker depends on
# ---------------------------------------------------------------------------


class PartnerEnquiryVisitSlotView(APIView):
    """Candidate visit starts for this vendor, and the command that books one.

    The read and the write sit on one path deliberately. `confirm_visit_slot` redeems a token this
    grid issued, so publishing the write without the read would have left the Partner slot picker
    with nothing to render — the browser must never compute availability, and the A1 checkout
    already ships that rule as `POST /booking/windows/`.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Visit slots"],
        operation_id="m2_visit_slot_list",
        description=(
            "The visit times this vendor may confirm, drawn from the **same `carts.availability` "
            "grid the A1 technician flow reads** and narrowed to this one invited vendor. Same "
            "payload shape as `POST /api/v1/booking/windows/` minus `capacity`, which on a "
            "single-vendor grid would be a readout of that vendor's own diary depth.\n\n"
            "Each `id` is a **signed token** bound to this invitation and this start; it is the "
            "only thing the confirm command accepts, so a vendor cannot book a time the grid never "
            "offered or a slot drawn for a competitor. Tokens expire, so a picker left open must "
            "re-read rather than post a stale one.\n\n"
            "An ineligible vendor receives a grid in which every slot reads `NO_CAPACITY` rather "
            "than an error — that is the truth and it is renderable, where a refusal would leave "
            "the screen with nothing to say."
        ),
        responses={
            200: VisitSlotGridSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_policy_unavailable` when the owner has not set how long a visit "
                "takes for this service — the grid cannot be drawn at an invented width; "
                "`m2_visit_slot_unavailable` when the request has no serviceable area.",
            ),
        },
    )
    def get(self, request: Request, invitation_id: uuid.UUID) -> Response:
        try:
            invitation = invitation_for_partner(
                partner=_partner_profile(request),
                invitation_id=invitation_id,
            )
            grid = visit_slots.candidate_visit_starts(invitation=invitation)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(VisitSlotGridSerializer(visit_slots.as_wire(grid)).data)

    @extend_schema(
        tags=["M2 - Visit slots"],
        operation_id="m2_visit_slot_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitSlotConfirmSerializer,
        description=(
            "Commit to being on site at a specific time. **This is A5 acceptance** — it takes the "
            "quote slot and the soft capacity hold, and then a hard slot on the shared "
            "availability grid, so a visit and an A1 booking cannot double-book the same vendor.\n"
            "\nThe **first** confirmation on an unpaid plan holds its slot and opens the "
            "Customer's checkout (`opens_plan_checkout: true`); the visit reads `REQUESTED` until "
            "that payment is verified, and the hold lapses harmlessly if it never is. Later slots "
            "on a paid plan are confirmed outright."
        ),
        responses={
            201: VisitSlotConfirmationSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` — only project requests book visit "
                "slots.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_slot_unavailable` when the slot has gone, the token is "
                "stale or the start has passed — the availability grid's exclusion constraint is "
                "the final authority and this is what losing that race reads as; "
                "`m2_visit_plan_required` when no plan is live; `m2_capacity_unavailable` and "
                "`m2_invitation_slots_exhausted` from the acceptance underneath.",
            ),
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        serializer = VisitSlotConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            profile = _partner_profile(request)
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            # The same progressive gate the plain accept applies, for the same reason: confirming a
            # visit slot *is* acceptance on A5, and taking a slot away from another vendor is what
            # proving identity buys.
            assert_kyc_complete(profile)
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                confirmation = access.confirm_visit_slot(
                    invitation_id=invitation.id,
                    slot_id=serializer.validated_data["slot_id"],
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                VisitSlotConfirmationSerializer(
                    {
                        "visit": confirmation.visit,
                        "share": confirmation.share,
                        "opens_plan_checkout": confirmation.opens_plan_checkout,
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.visit_slot.confirm",
            key=key,
            request_payload={
                "invitation_id": str(invitation_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SiteVisitArrivalView(APIView):
    """Arrival on the non-OTP fallback, which is the default path in M2."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_arrival_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitArrivalSerializer,
        description=(
            "Record that the vendor is on site. Either party may confirm it. M2 uses the "
            "**non-OTP fallback** as the default path rather than as a degraded one — the start "
            "OTP is M3 activation — and `arrival_method` is stored so every historical arrival "
            "still says truthfully how it was proved once the OTP path is switched on."
        ),
        responses={
            200: SiteVisitSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit is not "
                "scheduled — a visit whose plan payment has not been verified is still held, not "
                "scheduled, and nobody has arrived at it.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            visit = site_visit_for_participant(user=actor, site_visit_id=site_visit_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                arrived = access.confirm_visit_arrival(site_visit_id=visit.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(arrived).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.arrival",
            key=key,
            request_payload={"site_visit_id": str(site_visit_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class SiteVisitNoShowView(APIView):
    """A scheduled visit did not happen, reported by the party who turned up."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Site visits"],
        operation_id="m2_site_visit_no_show_report",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VisitNoShowSerializer,
        description=(
            "Report that the other party did not turn up. **You report the other side's absence, "
            "never your own** — a Customer reports `VENDOR`, a vendor reports `CUSTOMER` — because "
            "the report is a statement by the party who was there.\n\n"
            "The two settle differently. A vendor no-show costs the Customer nothing: the slot "
            "goes back to owing a **free replacement visit**. A customer no-show still pays the "
            "vendor their visit payout — they travelled — and only the platform's share is in "
            "question, which is an owner decision read fail-closed."
        ),
        responses={
            200: SiteVisitSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when a party reports its own "
                "no-show.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the visit was never "
                "scheduled; `m2_policy_unavailable` when the owner has not decided how a customer "
                "no-show settles the platform share.",
            ),
        },
    )
    def post(self, request: Request, site_visit_id: uuid.UUID) -> Response:
        serializer = VisitNoShowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        party = serializer.validated_data["party"]
        try:
            visit = site_visit_for_participant(user=actor, site_visit_id=site_visit_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        reporter_is_customer = visit.requirement.customer_id == actor.id
        if (party == "VENDOR") != reporter_is_customer:
            _raise_api_error(
                RequirementTransitionError(
                    "Report the other party's absence; we ask them separately about yours.",
                )
            )

        def command() -> tuple[int, dict[str, object]]:
            try:
                reported = access.report_visit_no_show(
                    site_visit_id=visit.id,
                    party=party,
                    reason_code=serializer.validated_data["reason_code"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], SiteVisitSerializer(reported).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.site_visit.no_show",
            key=key,
            request_payload={
                "site_visit_id": str(site_visit_id),
                **serializer.validated_data,
            },
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
    "EngagementDetailView",
    "EngagementStageFundingView",
    "PartnerDemandPreviewView",
    "PartnerEnquiryAcceptView",
    "PartnerEnquiryAttachmentListView",
    "PartnerEnquiryCollectionView",
    "PartnerEnquiryDeclineView",
    "PartnerEnquiryDetailView",
    "PartnerEnquiryQuestionView",
    "PartnerEnquirySiteVisitView",
    "PartnerEnquiryVisitSlotView",
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
    "RequirementQuoteListView",
    "RequirementQuoteRejectView",
    "RequirementQuoteRevalidateView",
    "RequirementSelectionView",
    "RequirementSubmitView",
    "RequirementTeaserListView",
    "RequirementTimelineView",
    "RequirementUnlockView",
    "RequirementVisitPlanCheckoutView",
    "RequirementVisitPlanView",
    "SelectionDeclineView",
    "SelectionReconfirmView",
    "SiteVisitArrivalView",
    "SiteVisitCompleteView",
    "SiteVisitNoShowView",
    "SiteVisitScheduleView",
]
