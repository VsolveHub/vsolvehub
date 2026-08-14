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
from collections.abc import Callable
from dataclasses import asdict
from typing import Any, NoReturn, cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import ServiceVariant
from apps.commerce.models import PaymentAttempt
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.locations.models import Address, ServiceArea
from apps.locations.services import check_serviceability
from apps.partners.capabilities import (
    assert_capability_active,
    assert_kyc_complete,
    workspace_grants,
)
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import Skill
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.partners.selectors import partner_profile_for_user
from apps.requirements import (
    access,
    amendments,
    attachments,
    booking_fees,
    cancellations,
    crew_dispatch,
    disputes,
    engagements,
    matching,
    operations,
    pricing,
    projects,
    proposals,
    rate_cards,
    reconciliation,
    selectors,
    services,
    stages,
    visit_slots,
    workforce,
)
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    PolicyUnavailableError,
    RateCardUnavailableError,
    RequirementDomainError,
    RequirementNotFoundError,
    RequirementTransitionError,
)
from apps.requirements.models import (
    CustomerRequirement,
    Engagement,
    EngagementStage,
    OperationsTouch,
    Proposal,
    RateCardBooking,
    RequirementAttachment,
    RequirementCancellation,
    RequirementQuestion,
    SafetyIncident,
    SiteVisit,
    VendorInvitation,
    VisitPlan,
)
from apps.requirements.selectors import (
    amendment_for_participant,
    customer_engagements,
    customer_readable_proposals,
    customer_requirements,
    demand_preview,
    engagement_amendments,
    engagement_events,
    engagement_for_participant,
    invitation_for_partner,
    partner_engagements,
    partner_invitations,
    partner_proposals,
    question_asker_role,
    requirement_for_customer,
    requirement_summary_text,
    requirement_timeline,
    selection_for_partner,
    shift_day_payload,
    site_visit_for_participant,
    stage_crew_rows,
    stage_for_customer,
    stage_for_participant,
    stage_for_partner,
    vendor_cards,
)
from apps.requirements.serializers import (
    AccessCheckoutSerializer,
    AssistedClarificationSerializer,
    AttachmentFinalizeSerializer,
    AttachmentUploadGrantSerializer,
    AttachmentUploadRequestSerializer,
    BookingFeeSerializer,
    CancellationDecisionSerializer,
    CancellationRequestSerializer,
    CaseAppealRequestSerializer,
    CaseEvidenceRecordSerializer,
    CaseEvidenceSerializer,
    CashDemandReportSerializer,
    CashDemandSerializer,
    ChargebackSerializer,
    CrewAssignSerializer,
    CrewMembershipVerificationRowSerializer,
    CrewNoShowSerializer,
    CrewOfferAcceptedSerializer,
    CrewOfferDeclineSerializer,
    CrewOfferListSerializer,
    CrewOfferSerializer,
    CrewVerificationQueueSerializer,
    CrewVerificationSerializer,
    CustomerProposalSerializer,
    CustomerQuoteListSerializer,
    DaySettlementSerializer,
    DelayClaimCreateSerializer,
    DelayClaimDecisionSerializer,
    DemandPreviewSerializer,
    DuplicateCheckQuerySerializer,
    EngagementAmendmentCreateSerializer,
    EngagementAmendmentDecisionSerializer,
    EngagementAmendmentListSerializer,
    EngagementAmendmentSerializer,
    EngagementEventListSerializer,
    EngagementPageSerializer,
    EngagementSerializer,
    EngagementStageSerializer,
    EnquiryDeclineSerializer,
    EnquiryDetailSerializer,
    EnquirySummaryPageSerializer,
    EnquirySummarySerializer,
    HandoverSubmitSerializer,
    OperationsDeadlineExtensionSerializer,
    OperationsReasonSerializer,
    OperationsReclassificationSerializer,
    OperationsRefundReviewSerializer,
    OperationsTouchSerializer,
    PartyCaseListSerializer,
    PartyCaseSerializer,
    ProbableDuplicateListSerializer,
    ProjectDelayClaimSerializer,
    ProjectPlanSerializer,
    ProjectTerminationSerializer,
    ProjectTransferDecisionSerializer,
    ProjectTransferProposeSerializer,
    ProjectTransferSerializer,
    ProposalCreateSerializer,
    ProposalPageSerializer,
    ProposalRejectSerializer,
    ProposalSelectionSerializer,
    ProposalSerializer,
    QuestionAnswerSerializer,
    QuestionCreateSerializer,
    QuoteTeaserListSerializer,
    RateCardBookSerializer,
    RateCardListSerializer,
    RateCardPublishSerializer,
    RateCardSerializer,
    RateCardStateSerializer,
    ReconciliationSummarySerializer,
    RequestTimelineSerializer,
    RequirementAttachmentSerializer,
    RequirementCancellationSerializer,
    RequirementCreateSerializer,
    RequirementDraftSerializer,
    RequirementQuestionSerializer,
    RequirementSubmitSerializer,
    RequirementSubmittedSerializer,
    RequirementSummaryPageSerializer,
    RequirementSummarySerializer,
    RequirementTimelineSerializer,
    RequirementUpdateSerializer,
    SafetyIncidentDecisionSerializer,
    SafetyIncidentListSerializer,
    SafetyIncidentReportSerializer,
    SafetyIncidentSerializer,
    SelectionCreateSerializer,
    SelectionDeclineSerializer,
    ShiftAttendanceRecordSerializer,
    ShiftAttendanceResponseSerializer,
    ShiftAttendanceSerializer,
    ShiftDaySerializer,
    ShiftExtraSerializer,
    SiteVisitCompleteSerializer,
    SiteVisitRequestSerializer,
    SiteVisitScheduleSerializer,
    SiteVisitSerializer,
    StageCorrectionSerializer,
    StageCrewListSerializer,
    StageDisputeDecisionSerializer,
    StageDisputeSerializer,
    StageEvidenceFinalizeSerializer,
    StageEvidenceSerializer,
    StageEvidenceSubmitSerializer,
    StageEvidenceUploadGrantSerializer,
    StageEvidenceUploadRequestSerializer,
    StuckQueueListSerializer,
    TouchMetricSerializer,
    TouchRollupSerializer,
    UnlockStateSerializer,
    VendorAttachmentListSerializer,
    VendorCardListSerializer,
    VisitArrivalSerializer,
    VisitNoShowSerializer,
    VisitPlanChooseSerializer,
    VisitPlanSerializer,
    VisitPlanStateSerializer,
    VisitSlotConfirmationSerializer,
    VisitSlotConfirmSerializer,
    VisitSlotGridSerializer,
    WarrantyClaimSerializer,
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


class RequirementVendorCardListView(APIView):
    """The A5 responding pool, on the disclosure ladder (`M2-FE-419`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Access"],
        operation_id="m2_vendor_card_list",
        description=(
            "The professionals responding to one A5 request. **A5 only** — an A3 request's "
            "pre-unlock surface is the quote teaser, and a second one would be a way around the "
            "unlock.\n\n"
            "The ladder, exactly: verification badge, vendor type and a coarse distance band for "
            "every responding vendor; the vendor's **name once they have committed to a visit "
            "slot**, because somebody entering a home has to be nameable; and **no contact "
            "details at any status**, which the engagement releases and the plan fee does not.\n\n"
            "`distance_band_km` is the 5 km band the matcher ranked on, read back from the "
            "invitation's own provenance rather than recomputed, and is `null` when we have no "
            "fresh position for that vendor — the ordinary case for an agency that never runs the "
            "technician app. **No rating is published**: this platform has no review model, and a "
            "number with nothing behind it is worse than none."
        ),
        responses={
            200: VendorCardListSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_lifecycle_not_supported` on an A3 request.",
            ),
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user),
                requirement_id=requirement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        if requirement.archetype != ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
            _raise_api_error(
                LifecycleNotSupportedError(
                    "Workforce requests show quote teasers rather than professional cards.",
                )
            )

        return Response(
            VendorCardListSerializer(
                {
                    "vendor_cards": [asdict(card) for card in vendor_cards(requirement)],
                    "server_now": timezone.now(),
                }
            ).data
        )


class RequirementQuoteQuestionView(APIView):
    """The Customer's half of clarification (`M2-FE-409`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Quotes"],
        operation_id="m2_customer_question_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        description=(
            "Ask the professional behind one quote or estimate a question. Structured "
            "clarification, not chat: one question, one answer, both on the shared timeline.\n\n"
            "Addressed to a **proposal**, so it reaches the vendor who wrote it rather than "
            "broadcasting to a pool that has already quoted. Gated on the paywall the archetype "
            "uses — before the unlock (A3) or the charged plan (A5) the vendors are deliberately "
            "not addressable, and a question would be a channel around the fee.\n\n"
            "A question never changes a price. A new number is a superseding proposal."
        ),
        request=QuestionCreateSerializer,
        responses={
            201: RequirementQuestionSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_unlock_required` before an A3 unlock.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_visit_plan_required` before an A5 plan is charged; "
                "`m2_requirement_transition_not_allowed` once the request is closed.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID, proposal_id: uuid.UUID) -> Response:
        serializer = QuestionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
            proposal = _proposal_for_customer(requirement=requirement, proposal_id=proposal_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                question = proposals.ask_vendor_question(
                    proposal_id=proposal.id,
                    asked_by=customer,
                    question=serializer.validated_data["question"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], RequirementQuestionSerializer(question).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.question.ask",
            key=key,
            request_payload={
                "proposal_id": str(proposal_id),
                **serializer.validated_data,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


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
    """The Customer answers a vendor's question."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_question_answer",
        description=(
            "Answer a question a professional asked about this request. Since 1.26.0 "
            "clarification runs both ways, so this route answers **the vendor's** questions only: "
            "a Customer's own question is answered by the vendor at "
            "`POST /api/v1/partner/questions/{question_id}/answer/`."
        ),
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
        question = (
            RequirementQuestion.objects.select_related("requirement", "invitation__partner")
            .filter(id=question_id, requirement__customer=customer)
            .first()
        )
        # A Customer answering their own question is not a clarification, it is a monologue — and
        # the row would then be `answered` with the vendor never having seen it. `404` rather than
        # a refusal code: from the answering surface's point of view there is no such question to
        # answer, and the Customer already sees it on the timeline as one they asked.
        if question is None or question_asker_role(question) == "CUSTOMER":
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


class PartnerQuestionAnswerView(APIView):
    """The vendor answers a Customer's question.

    The mirror of `RequirementQuestionAnswerView`, and it exists because the Customer-asks command
    would otherwise create a question nobody could answer — which is not clarification, it is a
    suggestion box.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Partner enquiries"],
        operation_id="m2_partner_question_answer",
        description=(
            "Answer a question the Customer asked about one of your quotes. Scoped to this "
            "vendor's own enquiries, and refuses a question this vendor asked — an answer to your "
            "own question would close the row without the Customer ever seeing it."
        ),
        request=QuestionAnswerSerializer,
        responses={
            200: RequirementQuestionSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, question_id: uuid.UUID) -> Response:
        serializer = QuestionAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        try:
            profile = _partner_profile(request)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        question = (
            RequirementQuestion.objects.select_related("requirement", "invitation__partner")
            .filter(id=question_id, invitation__partner=profile)
            .first()
        )
        if question is None or question_asker_role(question) != "CUSTOMER":
            _raise_api_error(RequirementNotFoundError())

        try:
            answered = proposals.answer_question(
                question_id=question.id,
                answered_by=actor,
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


# ---------------------------------------------------------------------------
# Wave C3: the engagement stage spine
#
# One set of routes for both archetypes, because there is one spine. The only thing that varies
# with the archetype is what the commands underneath refuse — an A5 stage cannot start unfunded,
# an A3 stage releases with no ledger entry — and none of that is a routing decision.
#
# Authorization is by participation everywhere a record is shared, and by role where a command
# belongs to one side: the vendor starts and submits, the Customer approves, corrects and
# disputes, Operations decides a dispute. A foreign caller gets `404` rather than `403`, because
# the existence of a stage says a named vendor is doing named work at a named address.
# ---------------------------------------------------------------------------


class EngagementCursorPagination(StrictCursorPagination):
    page_size = 20


class EngagementCollectionView(APIView):
    """Every engagement the caller is a party to. One route, both roles."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Engagements"],
        operation_id="m2_engagement_list",
        parameters=[BoundedCursorQuerySerializer],
        description=(
            "The caller's engagements, newest first, as a cursor page. A Customer sees the ones "
            "they commissioned and a Partner the ones they are performing; the `role` query "
            "parameter picks which, and defaults to whichever the caller can be. Read "
            "`commercial_mode` before promising anything: `LEAD_ONLY` (A3) is a connection, not a "
            "protected booking."
        ),
        responses={200: EngagementPageSerializer, 400: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        user = cast(User, request.user)
        role = request.query_params.get("role", "")
        profile = partner_profile_for_user(user)
        if role == "partner" or (role == "" and profile is not None):
            queryset = partner_engagements(profile) if profile is not None else None
        else:
            queryset = customer_engagements(user)
        if queryset is None:
            return Response({"next": None, "previous": None, "results": []})
        paginator = EngagementCursorPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(EngagementSerializer(page, many=True).data)


class EngagementEventListView(APIView):
    """The agreement's own history. Both parties read the same rows."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Engagements"],
        operation_id="m2_engagement_event_list",
        description=(
            "Every move on this engagement and its stages, oldest first. `actor_is_system` "
            "separates a decision somebody made from one a clock made — 'approved by you' and "
            "'approved because the review window closed' are different sentences and a timeline "
            "that renders them identically is lying about who decided. Actor identity itself is "
            "never published: which of the two parties acted is derivable from `reason_code`, and "
            "the counterparty's user id is not their business."
        ),
        responses={200: EngagementEventListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        try:
            engagement = engagement_for_participant(
                user=cast(User, request.user),
                engagement_id=engagement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            EngagementEventListSerializer(
                {
                    "events": list(engagement_events(engagement)),
                    "server_now": timezone.now(),
                }
            ).data
        )


class EngagementCompletionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Engagements"],
        operation_id="m2_engagement_completion_accept",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "The Customer accepts the finished work. `COMPLETING` → `COMPLETED`, and the "
            "requirement closes as `CLOSED_COMPLETE`. An engagement reaches `COMPLETING` on its "
            "own, when every stage is released; this is the separate fact that the Customer "
            "agrees it is done.\n\n"
            "**Three refusals, and none of them approves anything on the way past** "
            "(`M2-BE-548`). An open stage refuses — an accepted amendment can append work after "
            "`COMPLETING`, and that stage keeps its own review rather than being swept into a "
            "settled one. A disputed stage refuses with `m2_stage_disputed`. A **submitted "
            "handover the Customer has not accepted** refuses, which is the mechanism that keeps "
            "Event and Media delivery on the platform: accept it at "
            "`POST /engagements/{id}/handover/acceptance/` first.\n\n"
            "**An A5 engagement that withheld warranty retention then moves straight to "
            "`WARRANTY`, not `COMPLETED`.** Read `status` from the response rather than assuming "
            "the transition you asked for: `warranty_ends_at` on the project read says when the "
            "hold-back releases and the engagement becomes `CLOSED`."
        ),
        responses={
            200: EngagementSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when stages are still open or a "
                "handover is unaccepted; `m2_stage_disputed` when a stage is disputed.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            engagement = engagement_for_participant(user=customer, engagement_id=engagement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if engagement.customer_id != customer.id:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                completed = stages.accept_engagement_completion(
                    engagement_id=engagement.id, actor=customer
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(completed).data)

        result = execute_idempotent(
            actor=customer,
            operation="m2.engagement.accept_completion",
            key=key,
            request_payload={"engagement_id": str(engagement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_read",
        description=(
            "One shift-day (A3) or milestone (A5) with its evidence, money and clocks. Both "
            "`review_due_at` and `payout_release_due_at` are nullable and their nulls are real "
            "policy states: no review window is configured, so this stage never auto-approves; no "
            "payout hold is configured, so its payout does not release on a clock. Render nothing "
            "there rather than a countdown to a deadline nobody set."
        ),
        responses={200: EngagementStageSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, stage_id: uuid.UUID) -> Response:
        try:
            stage = stage_for_participant(user=cast(User, request.user), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(EngagementStageSerializer(stage).data)


class EngagementStageStartView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_start",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Begin work on a stage. `PENDING` → `IN_PROGRESS`, and `CORRECTION_REQUESTED` → "
            "`IN_PROGRESS` after the Customer sent it back. **A5 requires verified funding at "
            "face value** — the visit-plan money settles per share and never discounts a stage — "
            "so a funded A5 stage is already `IN_PROGRESS` and this call is an idempotent no-op; "
            "reaching it on an unfunded one is `m2_stage_not_funded`."
        ),
        responses={
            200: EngagementStageSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_not_funded` on an unfunded A5 stage; "
                "`m2_stage_transition_not_allowed` from any other status, or before work has been "
                "cleared to start.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                started = stages.start_stage(stage_id=stage.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], EngagementStageSerializer(started).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.stage.start",
            key=key,
            request_payload={"stage_id": str(stage_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageEvidenceUploadView(APIView):
    """Presign one evidence file. Bytes never pass through Django."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_evidence_upload_create",
        request=StageEvidenceUploadRequestSerializer,
        description=(
            "A signed, short-lived upload URL for one evidence file, plus the intent id to "
            "finalize against. The server names the object key and records the size, media type "
            "and SHA-256 it expects; finalization fetches the object back and compares. Without "
            "the intent row, 'verify the upload' would mean 'believe the client'. `NOTE` is not a "
            "kind here — a note carries no file and is submitted with the stage."
        ),
        responses={
            201: StageEvidenceUploadGrantSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_invalid` for an unsupported media type, an empty "
                "file, a file over the per-kind ceiling or a malformed checksum.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` once the stage no longer accepts "
                "evidence.",
            ),
            503: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_attachment_unavailable` when storage is down. Retryable.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        serializer = StageEvidenceUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
            grant = stages.issue_stage_evidence_upload(
                stage_id=stage.id,
                kind=serializer.validated_data["kind"],
                content_type=serializer.validated_data["content_type"],
                size_bytes=serializer.validated_data["size_bytes"],
                sha256=serializer.validated_data["sha256"],
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            StageEvidenceUploadGrantSerializer(
                {
                    "upload_id": grant.upload.id,
                    "upload_url": grant.upload_url,
                    "upload_token": grant.upload_token,
                    "expires_at": grant.expires_at,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class EngagementStageEvidenceView(APIView):
    """Finalize an uploaded evidence file, and read the stage's evidence back."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_evidence_finalize",
        request=StageEvidenceFinalizeSerializer,
        description=(
            "Verify the object that arrived against the intent and record it as evidence. "
            "`processing_status` lands `PENDING`: the bytes are the ones the client promised, and "
            "whether they are safe is a separate question a scanner answers. Two concurrent "
            "finalizes of one intent produce one evidence row."
        ),
        responses={
            201: StageEvidenceSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        serializer = StageEvidenceFinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
            evidence = stages.finalize_stage_evidence_upload(
                stage_id=stage.id,
                upload_id=serializer.validated_data["upload_id"],
                actor=actor,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            StageEvidenceSerializer(evidence).data,
            status=status.HTTP_201_CREATED,
        )


class EngagementStageSubmitView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_evidence_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=StageEvidenceSubmitSerializer,
        description=(
            "Hand the stage to the Customer for review. `IN_PROGRESS` → `AWAITING_REVIEW`, and "
            "the moment the review clock starts. The note is required and is stored as its own "
            "append-only evidence row rather than as a field on the stage, so a correction cycle "
            "leaves both accounts readable — what the vendor said the first time and what they "
            "said after the Customer pushed back. Resubmitting after a correction restarts the "
            "review window from zero, because the Customer is looking at different evidence."
        ),
        responses={
            200: EngagementStageSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        serializer = StageEvidenceSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                submitted = stages.submit_stage_evidence(
                    stage_id=stage.id,
                    actor=actor,
                    note=serializer.validated_data["note"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], EngagementStageSerializer(submitted).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.stage.submit_evidence",
            key=key,
            request_payload={"stage_id": str(stage_id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageApprovalView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_approve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "The Customer accepts the work on one stage. `AWAITING_REVIEW` → `APPROVED`. On a "
            "managed (A5) engagement this writes the vendor's earning **held** on the M1 payout "
            "rails and stamps `payout_release_due_at` — the dispute window — and the money becomes "
            "payable when that window closes. On `LEAD_ONLY` (A3) nothing is held because nothing "
            "was collected, so the stage goes straight to `RELEASED`."
        ),
        responses={
            200: EngagementStageSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_disputed` while a dispute is open; "
                "`m2_stage_transition_not_allowed` when nothing has been submitted.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        return _customer_stage_command(
            request=request,
            stage_id=stage_id,
            operation="m2.stage.approve",
            run=lambda stage, actor, _data: stages.approve_stage(stage_id=stage.id, actor=actor),
            payload={},
        )


class EngagementStageCorrectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_request_correction",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=StageCorrectionSerializer,
        description=(
            "Send a stage back to be done properly. `AWAITING_REVIEW` → `CORRECTION_REQUESTED`, "
            "and the review clock stops. **A correction is not an amendment**: it asks for the "
            "agreed work, it does not change what the agreed work is, and it moves no money. A "
            "Customer who wants something different is asking for a change order, which needs the "
            "vendor's agreement."
        ),
        responses={
            200: EngagementStageSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        serializer = StageCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _customer_stage_command(
            request=request,
            stage_id=stage_id,
            operation="m2.stage.request_correction",
            run=lambda stage, actor, data: stages.request_stage_correction(
                stage_id=stage.id, actor=actor, note=data["note"]
            ),
            payload=dict(serializer.validated_data),
        )


class EngagementStageDisputeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_dispute",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=StageDisputeSerializer,
        description=(
            "Formally object to submitted work. `AWAITING_REVIEW` → `DISPUTED`, and the "
            "engagement shows `DISPUTED` alongside. **A dispute stops only the disputed "
            "allocation**: every other stage carries on and any payout already released stays "
            "released. The review timeout cannot reach a disputed stage, so silence never becomes "
            "approval on something somebody has objected to."
        ),
        responses={
            200: EngagementStageSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        serializer = StageDisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return _customer_stage_command(
            request=request,
            stage_id=stage_id,
            operation="m2.stage.dispute",
            run=lambda stage, actor, data: stages.dispute_stage(
                stage_id=stage.id,
                actor=actor,
                reason_code=data["reason_code"],
                note=data["note"],
            ),
            payload=dict(serializer.validated_data),
        )


class EngagementStageDisputeDecisionView(APIView):
    """Operations decides a disputed stage."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Stages"],
        operation_id="m2_stage_dispute_resolve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=StageDisputeDecisionSerializer,
        description=(
            "`DISPUTED` → `APPROVED` or `CORRECTION_REQUESTED`, as an auditable domain command "
            "rather than a database edit. Two outcomes and not three: a partial outcome is a "
            "scope amendment both sides accept, never an operator quietly repricing a stage. The "
            "full case machinery — evidence, deadlines, appeals — is Wave C6; this is the "
            "transition it will drive, published now so a disputed stage is not a dead end."
        ),
        responses={
            200: EngagementStageSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        serializer = StageDisputeDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        stage = EngagementStage.objects.filter(id=stage_id).first()
        if stage is None:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                resolved = stages.resolve_stage_dispute(
                    stage_id=stage.id,
                    actor=actor,
                    outcome=serializer.validated_data["outcome"],
                    note=serializer.validated_data["note"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], EngagementStageSerializer(resolved).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.stage.resolve_dispute",
            key=key,
            request_payload={"stage_id": str(stage_id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


def _customer_stage_command(
    *,
    request: Request,
    stage_id: uuid.UUID,
    operation: str,
    run: Callable[[EngagementStage, User, dict[str, Any]], EngagementStage],
    payload: dict[str, Any],
) -> Response:
    """The three Customer stage commands, which differ only in what they call.

    Extracted because approve, request-correction and dispute are the same twelve lines of
    authorize-then-run-idempotently, and three copies of an authorization check is three places for
    one of them to be dropped.
    """
    customer = cast(User, request.user)
    key = _idempotency_key(request)
    try:
        stage = stage_for_customer(customer=customer, stage_id=stage_id)
    except RequirementDomainError as exc:
        _raise_api_error(exc)

    def command() -> tuple[int, dict[str, object]]:
        try:
            moved = run(stage, customer, payload)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return status.HTTP_200_OK, cast(dict[str, object], EngagementStageSerializer(moved).data)

    result = execute_idempotent(
        actor=customer,
        operation=operation,
        key=key,
        request_payload={"stage_id": str(stage_id), **payload},
        command=command,
    )
    return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C3: scope amendments, through the M1 engine
# ---------------------------------------------------------------------------


def _amendment_payload(link: Any) -> dict[str, Any]:
    """Flatten one amendment across its two rows.

    The split between `EngagementAmendment` and the M1 `ScopeAmendment` is a storage fact — one
    engine, two aggregates — and pushing it onto the wire would ask every client to know which
    half holds the status.
    """
    amendment = link.amendment
    signed = {
        line.position: int(line.snapshot.get("signed_amount_paise", line.amount_paise))
        for line in amendment.lines.all()
    }
    return {
        "id": link.id,
        "engagement_id": link.engagement_id,
        "stage_id": link.stage_id,
        "kind": link.kind,
        "status": amendment.status,
        "reason": amendment.reason,
        "delta_paise": link.delta_paise,
        "lines": [
            {
                "position": line.position,
                "kind": line.kind,
                "title": line.label,
                "quantity": line.quantity,
                "amount_paise": signed.get(line.position, line.amount_paise),
            }
            for line in amendment.lines.all()
        ],
        "expires_at": amendment.expires_at,
        "responded_at": amendment.responded_at,
        "applied_at": link.applied_at,
        "created_at": link.created_at,
        "server_now": timezone.now(),
    }


class EngagementAmendmentCollectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Amendments"],
        operation_id="m2_engagement_amendment_list",
        description="Every change request on this engagement, newest first. Both parties read it.",
        responses={200: EngagementAmendmentListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        try:
            engagement = engagement_for_participant(
                user=cast(User, request.user),
                engagement_id=engagement_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            EngagementAmendmentListSerializer(
                {
                    "amendments": [
                        _amendment_payload(link) for link in engagement_amendments(engagement)
                    ],
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Amendments"],
        operation_id="m2_engagement_amendment_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=EngagementAmendmentCreateSerializer,
        description=(
            "The vendor asks to change the agreed work. **Routed through the M1 scope-amendment "
            "engine** — same status machine, same lines, same expiry rule — with two line kinds "
            "M2 adds because an engagement has no catalog task to price from.\n\n"
            "**The archetype fixes the shape and the pricing authority.** An A3 engagement takes "
            "a `TIME_EXTENSION`, priced by the **server** from the worker-day rate frozen at "
            "reconfirmation: the vendor names days, never money, because a vendor who could name "
            "the money could re-price a job the Customer already committed to. An A5 engagement "
            "takes a `CHANGE_ORDER`, priced by the vendor line by line, because a bespoke outcome "
            "has no catalog rate — and the server still sums the lines and rejects any "
            "client-supplied total. `amount_paise` is signed: negative removes scope.\n\n"
            "One live change request per engagement."
        ),
        responses={
            201: EngagementAmendmentSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_not_actionable` when one is already open; "
                "`m2_stage_transition_not_allowed` for the wrong kind, an engagement that is not "
                "open to changes, or a reduction that is too large or too late; "
                "`m2_amendment_required` when the engagement carries no agreed daily rate to "
                "price an extension from; `m2_policy_unavailable` when the response window is "
                "unset — an amendment with no deadline is an open-ended claim on somebody's "
                "money, so it is refused rather than invented.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        serializer = EngagementAmendmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            engagement = engagement_for_participant(user=actor, engagement_id=engagement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if engagement.partner.user_id != actor.id:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                link = amendments.propose_engagement_amendment(
                    engagement_id=engagement.id,
                    actor=actor,
                    kind=serializer.validated_data["kind"],
                    reason=serializer.validated_data["reason"],
                    stage_id=serializer.validated_data["stage_id"],
                    lines=[
                        amendments.AmendmentLineInput(
                            label=line["title"],
                            quantity=line["quantity"],
                            amount_paise=line["amount_paise"],
                        )
                        for line in serializer.validated_data["lines"]
                    ],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                EngagementAmendmentSerializer(_amendment_payload(link)).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.amendment.propose",
            key=key,
            request_payload={"engagement_id": str(engagement_id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementAmendmentDecisionView(APIView):
    """The Customer accepts or declines a change request."""

    permission_classes = (IsAuthenticated,)
    accept = True

    @extend_schema(
        tags=["M2 - Amendments"],
        operation_id="m2_engagement_amendment_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "**Money first, scope second (`M2-BE-506`).** Accepting does not change the agreed "
            "work until the money has moved. Three routes, chosen by the commercial mode and the "
            "sign of the delta and never by anything a client sends:\n\n"
            "- `LEAD_ONLY` (A3): no platform money exists to move, so the amendment authorizes "
            "here and the extra shift-days appear immediately. `checkout` is `null`.\n"
            "- Managed (A5), negative delta: the refund is issued against the stage's own funding "
            "payment **before** the scope shrinks, so there is no instant in which the Customer "
            "owns less work than they have paid for. `checkout` is `null`.\n"
            "- Managed (A5), positive delta: `checkout` carries a `PaymentAttempt` and **nothing "
            "changes until a verified provider callback**. A client redirect claiming success is "
            "a claim by the party that benefits from it.\n\n"
            "Repeating an acceptance while its payment is pending returns the same attempt rather "
            "than starting a second charge."
        ),
        responses={
            200: EngagementAmendmentDecisionSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_not_actionable` when it expired or already has a "
                "decision.",
            ),
        },
    )
    def post(self, request: Request, engagement_amendment_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            link = amendment_for_participant(
                user=customer,
                engagement_amendment_id=engagement_amendment_id,
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if link.engagement.customer_id != customer.id:
            _raise_api_error(RequirementNotFoundError())
        accept = self.accept

        def command() -> tuple[int, dict[str, object]]:
            try:
                if accept:
                    decided, attempt = amendments.accept_engagement_amendment(
                        engagement_amendment_id=link.id,
                        actor=customer,
                        idempotency_key=key,
                    )
                else:
                    decided = amendments.decline_engagement_amendment(
                        engagement_amendment_id=link.id,
                        actor=customer,
                    )
                    attempt = None
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            decided.refresh_from_db()
            return status.HTTP_200_OK, cast(
                dict[str, object],
                EngagementAmendmentDecisionSerializer(
                    {
                        "amendment": _amendment_payload(decided),
                        "checkout": None if attempt is None else _checkout_payload(attempt),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.amendment.accept" if accept else "m2.amendment.decline",
            key=key,
            request_payload={"engagement_amendment_id": str(engagement_amendment_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementAmendmentDeclineView(EngagementAmendmentDecisionView):
    accept = False

    @extend_schema(
        tags=["M2 - Amendments"],
        operation_id="m2_engagement_amendment_decline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "The Customer says no. The agreed work is unchanged, nothing has moved, and the "
            "vendor may propose a different change."
        ),
        responses={
            200: EngagementAmendmentDecisionSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, engagement_amendment_id: uuid.UUID) -> Response:
        return super().post(request, engagement_amendment_id)


__all__ = [
    "EngagementAmendmentCollectionView",
    "EngagementAmendmentDecisionView",
    "EngagementAmendmentDeclineView",
    "EngagementCollectionView",
    "EngagementCompletionView",
    "EngagementDetailView",
    "EngagementEventListView",
    "EngagementStageApprovalView",
    "EngagementStageCorrectionView",
    "EngagementStageDetailView",
    "EngagementStageDisputeDecisionView",
    "EngagementStageDisputeView",
    "EngagementStageEvidenceUploadView",
    "EngagementStageEvidenceView",
    "EngagementStageFundingView",
    "EngagementStageStartView",
    "EngagementStageSubmitView",
    "OperationsRateCardView",
    "PartnerCrewOfferAcceptView",
    "PartnerCrewOfferDeclineView",
    "PartnerCrewOfferListView",
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
    "RequirementBookingFeeCancelView",
    "RequirementBookingFeeCheckoutView",
    "RequirementCollectionView",
    "RequirementCrewArrivalView",
    "RequirementCrewNoShowView",
    "RequirementDetailView",
    "RequirementDuplicateCheckView",
    "RequirementQuestionAnswerView",
    "RequirementQuoteListView",
    "RequirementQuoteRejectView",
    "RequirementQuoteRevalidateView",
    "RequirementRateCardBookView",
    "RequirementRateCardView",
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


# ---------------------------------------------------------------------------
# Wave C2R / revision 4 (ADR-0009): the rate-card A3 front door.
#
# Thin, like everything else in this file. The one thing worth noticing is that the read below
# publishes *unavailability as a state on a `200`*, not as an error. An A3 Customer whose city has
# no published card can still submit their request — it simply collects quotes — so refusing the
# whole screen because instant booking is not offered here would hide a path that works. The
# **commands** still fail closed, with the published code, because a command that guessed would
# book a crew at a price nobody approved.
# ---------------------------------------------------------------------------


def _rate_card_preview_payload(requirement: CustomerRequirement) -> dict[str, object]:
    """The published rate, or an honest reason there is none.

    Catches exactly the two fail-closed refusals and no others. A `m2_rate_card_unavailable` or a
    `m2_policy_unavailable` here means "we do not offer instant booking for this request"; anything
    else is a genuine failure and must not be flattened into a screen that says the same thing.
    """
    try:
        preview = crew_dispatch.preview_published_rate(requirement)
    except (RateCardUnavailableError, PolicyUnavailableError) as exc:
        return {
            "is_available": False,
            "rate_card_id": None,
            "headcount": None,
            "days": None,
            "day_rate_paise": None,
            "total_customer_paise": None,
            "lead_receipt_paise": None,
            "booking_fee_paise": None,
            "standard_day_hours": None,
            "overtime_hourly_paise": None,
            "add_on_rates": None,
            "inclusions": None,
            "unavailable_code": exc.code,
            "unavailable_reason": exc.message,
            "server_now": timezone.now(),
        }
    except RequirementDomainError as exc:
        # A preset with no headcount or no days is the Customer's own unfinished draft, not an
        # unpriced city. Reported with its own code so the screen can say "tell us how many
        # people" rather than "we do not cover this area".
        return {
            "is_available": False,
            "rate_card_id": None,
            "headcount": None,
            "days": None,
            "day_rate_paise": None,
            "total_customer_paise": None,
            "lead_receipt_paise": None,
            "booking_fee_paise": None,
            "standard_day_hours": None,
            "overtime_hourly_paise": None,
            "add_on_rates": None,
            "inclusions": None,
            "unavailable_code": exc.code,
            "unavailable_reason": exc.message,
            "server_now": timezone.now(),
        }
    return {
        "is_available": True,
        "rate_card_id": preview.card.id,
        "headcount": preview.quote.headcount,
        "days": preview.quote.days,
        "day_rate_paise": preview.quote.day_rate_paise,
        "total_customer_paise": preview.quote.total_customer_paise,
        "lead_receipt_paise": preview.quote.lead_receipt_paise,
        "booking_fee_paise": preview.quote.booking_fee_paise,
        "standard_day_hours": preview.standard_day_hours,
        "overtime_hourly_paise": preview.overtime_hourly_paise,
        "add_on_rates": preview.add_on_rates,
        "inclusions": preview.inclusions,
        "unavailable_code": None,
        "unavailable_reason": None,
        "server_now": timezone.now(),
    }


def _rate_card_state_payload(requirement: CustomerRequirement) -> dict[str, object]:
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    fee = booking_fees.latest_booking_fee(requirement)
    holder = booking_fees.crew_offer_holder(requirement)
    # Identity is released by the confirmation, never by the hold. A Customer watching a held
    # booking sees that *a* crew took it; they learn who once the fee is verified.
    confirmed = (
        holder
        if booking is not None and booking.status == RateCardBooking.Status.CONFIRMED
        else None
    )
    return {
        "preview": _rate_card_preview_payload(requirement),
        "booking": booking,
        "booking_fee": fee,
        "checkout_available": booking_fees.booking_fee_checkout_availability(requirement),
        "confirmed_partner_id": confirmed.partner_id if confirmed is not None else None,
        "confirmed_partner_name": (
            confirmed.partner.display_name if confirmed is not None else None
        ),
        "server_now": timezone.now(),
    }


class RequirementRateCardView(APIView):
    """The A3 instant path as one read: the price before, the crew and the fee after."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_read",
        description=(
            "The published day rate for this request and everything that has happened to it "
            "since. **`preview.is_available: false` is not an error** — it means this city and "
            "skill have no published card, or instant dispatch is not configured for this "
            "service, and the request will collect quotes instead. `unavailable_code` says "
            "which.\n\n"
            "The money split published here is the Customer's: `total_customer_paise` divides "
            "into `lead_receipt_paise`, **paid directly to the crew at day end and never held by "
            "Vsolve**, and `booking_fee_paise`, the one online charge. The lead's own wage and "
            "supervision split is deliberately absent."
        ),
        responses={
            200: RateCardStateSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user), requirement_id=requirement_id
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(RateCardStateSerializer(_rate_card_state_payload(requirement)).data)


class RequirementRateCardBookView(APIView):
    """Submit an A3 preset at the published rate and start the crew cascade, in one step."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_book",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RateCardBookSerializer,
        description=(
            "Book a crew at the published day rate. The rate and its inclusion list are shown by "
            "`m2_rate_card_read` **before** this runs and are frozen onto the booking here, so a "
            "rate loaded between the screen and the tap cannot become what the Customer agreed "
            "to.\n\n"
            "**Nothing is charged by this call.** It submits the requirement and sends the first "
            "wave of crew offers on the M1 dispatch clock — minutes, not business hours. The "
            "booking fee is charged only once a lead has accepted, through "
            "`m2_booking_fee_checkout_create`."
        ),
        responses={
            201: RateCardStateSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_rate_card_unavailable` when no card is published for this city "
                "and skill — the Customer is routed to the quote flow, which is the honest "
                "degradation rather than a guessed price. `m2_policy_unavailable` when instant "
                "dispatch is not configured for this service. `m2_requirement_duplicate` unless "
                "`allow_duplicate` is set.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        serializer = RateCardBookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allow_duplicate = bool(serializer.validated_data["allow_duplicate"])
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                result = crew_dispatch.book_at_published_rate(
                    requirement_id=requirement.id,
                    actor=customer,
                    allow_duplicate=allow_duplicate,
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                RateCardStateSerializer(_rate_card_state_payload(result.requirement)).data,
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.rate_card.book",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "allow_duplicate": allow_duplicate,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementBookingFeeCheckoutView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_booking_fee_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Pay the booking fee against a lead who is holding this job right now. The hold is "
            "checked under the booking's own row lock in the same transaction that creates the "
            "attempt, so paying for a crew nobody is holding is unreachable rather than merely "
            "unlikely.\n\n"
            "**The crew is not confirmed by this response.** Only a verified provider callback "
            "moves the fee to `ACTIVE`, and that same callback creates the engagement; until it "
            "lands the fee reads `PENDING` and `m2_booking_fee_payment_pending` is the refusal "
            "anything gated on confirmation returns. If the Customer never pays, the hold lapses "
            "harmlessly and the next offer or wave proceeds."
        ),
        responses={
            201: AccessCheckoutSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_booking_fee_not_chargeable` when no lead is holding the job, "
                "when the hold has expired, or when the fee is already settled; "
                "`m2_lifecycle_not_supported` on a request that is on the quote flow.",
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
                _fee, attempt = booking_fees.create_booking_fee_checkout(
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
            operation="m2.booking_fee.checkout",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementBookingFeeCancelView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_booking_fee_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Cancel a booked crew. **The free-cancellation window decides the money**, server-side "
            "and never from the client: at or beyond T hours before the requested start the "
            "booking fee refunds in full; inside T it forfeits and splits, because the lead has "
            "already turned other work down for that day.\n\n"
            "T is an open owner decision and is read fail-closed: while it is unset this refuses "
            "with `m2_policy_unavailable` rather than guessing which way a real Customer's money "
            "should go."
        ),
        responses={
            200: BookingFeeSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_policy_unavailable` while the free-cancellation window is unset; "
                "`m2_booking_fee_not_chargeable` when there is no fee on this request; "
                "`m2_requirement_transition_not_allowed` once the fee is settled.",
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
                fee = booking_fees.cancel_booking(requirement_id=requirement.id, actor=customer)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], BookingFeeSerializer(fee).data)

        result = execute_idempotent(
            actor=customer,
            operation="m2.booking_fee.cancel",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


def _rate_card_participant(request: Request, requirement_id: uuid.UUID) -> CustomerRequirement:
    """The requirement, resolved by **participation** — either the Customer or the booked lead.

    Day-one arrival and a no-show are facts about what happened at a site, and both parties were
    there. Resolving by participation rather than by role is the same choice
    `site_visit_for_participant` made, and it answers `404` to anybody else because existence is
    private.
    """
    user = cast(User, request.user)
    requirement = CustomerRequirement.objects.filter(pk=requirement_id).first()
    if requirement is None:
        _raise_api_error(RequirementNotFoundError())
    if requirement.customer_id == user.id:
        return requirement
    profile = partner_profile_for_user(user)
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    if (
        profile is not None
        and booking is not None
        and booking.accepted_invitation is not None
        and booking.accepted_invitation.partner_id == profile.id
    ):
        return requirement
    _raise_api_error(RequirementNotFoundError())


class RequirementCrewArrivalView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_arrival_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Confirm the crew arrived on day one, which is the moment the booking fee is earned. "
            "Either party may record it. **Non-OTP** — the start OTP is deferred to M3, so this "
            "is the default path in M2 rather than a degraded one.\n\n"
            "Nothing is paid out here: the fee is Vsolve's revenue once the crew arrived, and the "
            "wages are peer-to-peer and settle at day end."
        ),
        responses={
            200: BookingFeeSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        requirement = _rate_card_participant(request, requirement_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                fee = booking_fees.earn_booking_fee(requirement_id=requirement.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], BookingFeeSerializer(fee).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.crew.arrival",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementCrewNoShowView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_no_show_report",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewNoShowSerializer,
        description=(
            "Report that day one did not happen. **`party` decides the money and the reason code "
            "cannot move it.**\n\n"
            "`VENDOR`: the booking fee refunds in full, no travel compensation is paid — neither "
            "party earns from an undelivered crew — the request returns to matching for a **free "
            "re-dispatch**, and the vendor's standing carries the record.\n\n"
            "`CUSTOMER`: the fee forfeits and splits. A configured share pays the lead as travel "
            "compensation through the payout rails, and the remainder is the platform share; the "
            "two reconcile to the fee in integer paise."
        ),
        responses={
            200: BookingFeeSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_policy_unavailable` while the forfeit split is unset — the fee "
                "stays `ACTIVE` and visible rather than being split on an invented ratio.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        requirement = _rate_card_participant(request, requirement_id)
        serializer = CrewNoShowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        party = str(serializer.validated_data["party"])
        reason_code = str(serializer.validated_data["reason_code"])

        def command() -> tuple[int, dict[str, object]]:
            try:
                fee = booking_fees.report_crew_no_show(
                    requirement_id=requirement.id, party=party, reason_code=reason_code
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], BookingFeeSerializer(fee).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.crew.no_show",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "party": party,
                "reason_code": reason_code,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Partner: crew offers
# ---------------------------------------------------------------------------


def _crew_offer_payload(offer: crew_dispatch.CrewOffer) -> dict[str, object]:
    invitation = offer.invitation
    requirement = invitation.requirement
    area = requirement.service_area
    return {
        "invitation_id": invitation.id,
        "requirement_id": requirement.id,
        "status": invitation.status,
        "decline_reason_code": invitation.decline_reason_code,
        "headcount": offer.headcount,
        "days": offer.days,
        "lead_day_receipt_paise": offer.lead_day_receipt_paise,
        "lead_total_receipt_paise": offer.lead_total_receipt_paise,
        "standard_day_hours": offer.standard_day_hours,
        "overtime_hourly_paise": offer.overtime_hourly_paise,
        "inclusions": offer.inclusions,
        "responds_by": offer.responds_by,
        "verified_roster_size": offer.verified_roster_size,
        "requested_start": requirement.requested_start,
        "area_label": area.name if area is not None else "",
        "server_now": timezone.now(),
    }


class PartnerCrewOfferListView(APIView):
    """Live crew offers for this lead, each carrying **their own** number."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_offer_list",
        description=(
            "Crew offers this lead can still answer, on the M1 dispatch clock — `responds_by` is "
            "wall-clock and minutes away, not a business-hours deadline.\n\n"
            "**Every offer carries the lead's own number**: what they receive per day for the "
            "requested crew, paid directly by the Customer at day end. The Customer's "
            "all-inclusive rate is not in this payload at any status, because it contains this "
            "platform's booking fee and showing a vendor money they do not receive is how a "
            "published rate starts an argument on site."
        ),
        responses={200: CrewOfferListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(request)
        invitations = (
            VendorInvitation.objects.filter(
                partner=profile,
                status=VendorInvitation.Status.INVITED,
                requirement__rate_card_booking__isnull=False,
            )
            .select_related("requirement__service_area", "partner")
            .order_by("responds_by", "created_at")
        )
        offers = [
            _crew_offer_payload(offer)
            for offer in (crew_dispatch.crew_offer_for(item) for item in invitations)
            if offer is not None
        ]
        return Response(
            CrewOfferListSerializer({"offers": offers, "server_now": timezone.now()}).data
        )


class PartnerCrewOfferAcceptView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_offer_accept",
        request=None,
        description=(
            "Take the job at the published rate. **First accept wins** — a rate-card request has "
            "exactly one slot, so the second lead to arrive is refused with "
            "`m2_invitation_slots_exhausted` rather than losing a race.\n\n"
            "Accepting takes a soft capacity hold for the requested dates, records this lead's "
            "acceptance of the published card, and holds the job while the Customer pays the "
            "booking fee. If they never pay, the hold lapses, the vendor keeps their standing, "
            "and the cascade moves on.\n\n"
            "Refused with `m2_roster_insufficient` when the lead's **verified** roster is smaller "
            "than the headcount. Crews are never aggregated across vendors: one lead is "
            "accountable for the whole crew."
        ),
        responses={
            200: CrewOfferAcceptedSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_roster_insufficient`, `m2_invitation_slots_exhausted` when "
                "another lead took the job, `m2_capacity_unavailable` when this lead is already "
                "committed on those dates, or `m2_invitation_expired`.",
            ),
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        profile = _partner_profile(request)
        try:
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            assert_kyc_complete(profile)
            booking = crew_dispatch.accept_crew_offer(invitation_id=invitation.id)
        except (RequirementDomainError, PartnerDomainError) as exc:
            _raise_api_error(exc)
        return Response(
            CrewOfferAcceptedSerializer(
                {
                    "booking_id": booking.id,
                    "requirement_id": booking.requirement_id,
                    "status": booking.status,
                    "headcount": booking.headcount,
                    "days": booking.days,
                    "lead_day_receipt_paise": booking.lead_day_receipt_paise,
                    "lead_receipt_paise": booking.lead_receipt_paise,
                    "standard_day_hours": booking.standard_day_hours,
                    "overtime_hourly_paise": booking.overtime_hourly_paise,
                    "add_on_rates": booking.add_on_rates,
                    "inclusions": booking.inclusions,
                    "hold_expires_at": booking.hold_expires_at,
                    "requested_start": invitation.requirement.requested_start,
                    "server_now": timezone.now(),
                }
            ).data
        )


class PartnerCrewOfferDeclineView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_offer_decline",
        request=CrewOfferDeclineSerializer,
        description=(
            "Pass on a crew offer. **The reason is required and is read by the decline-rate "
            "alarm.** `RATE_TOO_LOW` is the answer that matters most: a published rate below the "
            "street rate makes leads decline everything and the instant product dies quietly, so "
            "a sustained decline rate pages Operations rather than appearing in a monthly report.\n"
            "\nDeclining releases the slot and moves the cascade to its next, wider wave."
        ),
        responses={
            200: CrewOfferSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        profile = _partner_profile(request)
        serializer = CrewOfferDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = invitation_for_partner(partner=profile, invitation_id=invitation_id)
            declined = crew_dispatch.decline_crew_offer(
                invitation_id=invitation.id,
                reason_code=str(serializer.validated_data["reason_code"]),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        offer = crew_dispatch.crew_offer_for(declined)
        if offer is None:
            _raise_api_error(RequirementNotFoundError())
        return Response(CrewOfferSerializer(_crew_offer_payload(offer)).data)


# ---------------------------------------------------------------------------
# Operations: publishing rate cards
# ---------------------------------------------------------------------------


class OperationsRateCardView(APIView):
    """Publish and review the day rates this platform sets."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_list",
        parameters=[
            OpenApiParameter(
                name="service_area",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Narrow to one city.",
            )
        ],
        description=(
            "Every published card, newest effective date first. This is the monthly review "
            "calendar's read and the only surface that publishes the three components, because "
            "reviewing a rate against the wage floor means seeing the wage part of it."
        ),
        responses={200: RateCardListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        raw_area = request.query_params.get("service_area")
        area_id: uuid.UUID | None = None
        if raw_area:
            try:
                area_id = uuid.UUID(raw_area)
            except ValueError as exc:
                raise ValidationError(
                    {"service_area": "Must be a UUID."}, code="invalid_service_area"
                ) from exc
        cards = rate_cards.published_rate_cards(service_area_id=area_id)
        return Response(
            RateCardListSerializer({"rate_cards": cards, "server_now": timezone.now()}).data
        )

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_publish",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RateCardPublishSerializer,
        description=(
            "Publish a day rate for one city and one statutory skill, effective from a date. A "
            "card is **loaded, never edited**: a booking made last week reconciles against the "
            "number it was made at, and raising a rate is one more row.\n\n"
            "Two refusals are the point of this endpoint. The wage component is checked against "
            "the statutory floor with the same fail-closed guard vendor quotes pass — a platform "
            "that refuses a vendor's rate for being below the floor and publishes its own below "
            "it has no rule at all. And a card cannot be **backdated under a live booking**, "
            "because that would retroactively change the number a live booking was priced at."
        ),
        responses={
            201: RateCardSerializer,
            400: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_proposal_below_wage_floor` when the wage component is under the "
                "statutory floor for that state and skill.",
            ),
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_wage_floor_unavailable` when no floor is loaded for the area's "
                "state and this skill, or when the area carries no state code — the check fails "
                "closed rather than being skipped. "
                "`m2_requirement_transition_not_allowed` when the effective date would land on or "
                "before a live booking made at the current rate.",
            ),
        },
    )
    def post(self, request: Request) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        serializer = RateCardPublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                card = rate_cards.publish_rate_card(
                    service_area_id=data["service_area_id"],
                    skill_id=data["skill_id"],
                    worker_day_wage_paise=int(data["worker_day_wage_paise"]),
                    supervision_margin_paise=int(data["supervision_margin_paise"]),
                    booking_fee_paise=int(data["booking_fee_paise"]),
                    standard_day_hours=int(data["standard_day_hours"]),
                    overtime_hourly_paise=int(data["overtime_hourly_paise"]),
                    inclusions=list(data["inclusions"]),
                    add_on_rates=dict(data["add_on_rates"]),
                    effective_from=data["effective_from"],
                    actor=actor,
                    source_reference=str(data["source_reference"]),
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            except (ServiceArea.DoesNotExist, Skill.DoesNotExist) as exc:
                raise NotFound("That service area or skill does not exist.") from exc
            return status.HTTP_201_CREATED, cast(dict[str, object], RateCardSerializer(card).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.rate_card.publish",
            key=key,
            request_payload={key_name: str(value) for key_name, value in sorted(data.items())},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C4 (`M2-BE-521..539`): the shift-day surface.
#
# Nine paths, and none of them moves wage money. ADR-0009 is explicit that A3 wages are direct,
# daily and peer-to-peer at day end; there is no checkout, no funding call and no payout release in
# this section, and adding one would make the platform a party to a payment it has always said it
# is not. The settlement path below records two taps against a published figure and returns a UPI
# deep link into the Customer's own app — a convenience, not a rail.
# ---------------------------------------------------------------------------


def _shift_stage_for_participant(request: Request, stage_id: uuid.UUID) -> EngagementStage:
    """One shift-day, if the caller is either party. `404` otherwise, never `403`.

    Both sides operate the same day — the supervisor records the count, the Customer answers it —
    so the read is resolved by participation exactly as `stage_for_participant` is. A stranger
    gets `404` because the existence of a shift-day says a named crew is at a named Customer's
    site today.
    """
    try:
        return stage_for_participant(user=cast(User, request.user), stage_id=stage_id)
    except RequirementDomainError as exc:
        _raise_api_error(exc)


def _is_partner_side(request: Request, stage: EngagementStage) -> bool:
    return stage.engagement.partner.user_id == cast(User, request.user).id


class EngagementStageShiftView(APIView):
    """The whole shift-day as one read: the crew, the attendance and the settlement."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_day_read",
        description=(
            "One A3 shift-day, whole. Returns the day's crew at the disclosure the caller is "
            "entitled to, the supervisor's attendance record and the evening settlement.\n\n"
            "**The Customer never receives `crew_member_id`.** Crew identity is global — one "
            "person is one row however many agencies carry them — so `membership_id` is published "
            "to the Partner only and the global id to nobody. What a Customer gets is a name, four "
            "digits of phone and whether this platform has verified the person's documents.\n\n"
            "`attendance` and `settlement` are `null` until a command touches the day. That is a "
            "real state and not a missing one: nothing is created by reading."
        ),
        responses={
            200: ShiftDaySerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` on an A5 milestone: a project "
                "stage has no crew, no attendance and no daily settlement.",
            ),
        },
    )
    def get(self, request: Request, stage_id: uuid.UUID) -> Response:
        stage = _shift_stage_for_participant(request, stage_id)
        try:
            payload = shift_day_payload(
                stage=stage,
                include_membership_id=_is_partner_side(request, stage),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(ShiftDaySerializer({**payload, "server_now": timezone.now()}).data)


class EngagementStageCrewView(APIView):
    """Name the workers coming to one shift-day (`M2-BE-522`, `528`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_crew_assign",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewAssignSerializer,
        description=(
            "Assign crew to **one shift-day**, not to the engagement. Multi-day work rotates faces "
            "legitimately, and a roster hung off the engagement would either forbid that or record "
            "a lie about who was there.\n\n"
            "Send the **whole** intended crew every time. The server reconciles the day to it: "
            "names that are gone are released with `reason_code`, new names are assigned. A "
            "substitution is therefore one call rather than a delete-then-add a client can half "
            "perform, and re-sending the same set is a no-op.\n\n"
            "Four refusals, each a different failure: `m2_crew_roster_required` (the progressive "
            "gate, at the first assignment rather than at registration), `m2_crew_conflict` for an "
            "unverified worker, for a worker who is not on your roster or is marked unavailable, "
            "and — the cross-agency one — for the same **person** already promised on that date "
            "through any agency. The last is held by a database constraint as well as by this "
            "check, so two supervisors tapping at the same instant cannot both win."
        ),
        responses={
            200: StageCrewListSerializer,
            400: ApiErrorSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_crew_roster_required` — add a verified worker to your roster "
                "before assigning anybody to a shift.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_crew_conflict`, or `m2_stage_transition_not_allowed` when the "
                "shift-day has no date on it, is already settled, or is an A5 milestone.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = CrewAssignSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        membership_ids = list(payload.validated_data["membership_ids"])
        reason_code = payload.validated_data["reason_code"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                assignments = workforce.assign_crew(
                    stage_id=stage.id,
                    actor=actor,
                    membership_ids=membership_ids,
                    reason_code=reason_code,
                )
                attendance = workforce.ensure_attendance(stage=stage)
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            body = StageCrewListSerializer(
                {
                    "crew": stage_crew_rows(assignments, include_membership_id=True),
                    "expected_count": attendance.expected_count,
                    "shift_date": stage.scheduled_on,
                    "server_now": timezone.now(),
                }
            ).data
            return status.HTTP_200_OK, cast(dict[str, object], body)

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.crew_assign",
            key=key,
            request_payload={
                "stage_id": str(stage_id),
                "membership_ids": [str(value) for value in membership_ids],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageArrivalView(APIView):
    """The crew is on site (`M2-BE-524`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_arrival_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Confirm the crew arrived for this shift-day. **Non-OTP, and that is the default path "
            "in M2** rather than a degraded one — the start OTP is M3. Either party may record it: "
            "both were at the site.\n\n"
            "Three things happen in one transaction, because a half-started day is a support "
            "ticket: the arrival is stamped, the stage starts on the shared spine, and **on day "
            "one the booking fee is earned**. Crew must be named first — confirming that people "
            "arrived before saying who they are records nothing anybody can act on."
        ),
        responses={
            200: ShiftAttendanceSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when no crew is assigned yet, the "
                "engagement is closed, or the stage is an A5 milestone.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        stage = _shift_stage_for_participant(request, stage_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                attendance = workforce.confirm_shift_arrival(stage_id=stage.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ShiftAttendanceSerializer(attendance).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.arrival",
            key=key,
            request_payload={"stage_id": str(stage_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageAttendanceView(APIView):
    """The supervisor's one action for the day (`M2-BE-525`, `527`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_attendance_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ShiftAttendanceRecordSerializer,
        description=(
            "Record **n of m present** for this shift-day. One tap, from the supervisor.\n\n"
            "There is deliberately **no per-worker check-in or check-out**: the workers mostly do "
            "not carry smartphones, the supervisor does, and a per-worker attendance product would "
            "be a device dependency this market cannot meet wearing the clothes of rigour. "
            "Per-worker detail is captured in exactly one place — a Customer dispute.\n\n"
            "The count *is* the evidence, so this hands the stage to the Customer through the "
            "ordinary spine and starts the same review clock every other stage runs on.\n\n"
            "`shift_ended_at` is optional and its absence is the point: a **missing check-out** "
            "settles at the agreed shift length and is flagged for review, not disputed. A "
            "supervisor whose crew left at six and who closed the day at nine has done nothing "
            "wrong, and the amount never depended on the end time — only overtime does, and that "
            "needs the Customer's approval either way."
        ),
        responses={
            200: ShiftAttendanceSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` before arrival is confirmed, after "
                "the Customer has already answered, or for a count above the booked crew — an "
                "extra worker is a scope amendment at the published rate, not a bigger number in "
                "an attendance box.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = ShiftAttendanceRecordSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        present_count = payload.validated_data["present_count"]
        shift_ended_at = payload.validated_data["shift_ended_at"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                attendance = workforce.confirm_attendance(
                    stage_id=stage.id,
                    actor=actor,
                    present_count=present_count,
                    shift_ended_at=shift_ended_at,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ShiftAttendanceSerializer(attendance).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.attendance",
            key=key,
            request_payload={"stage_id": str(stage_id), "present_count": present_count},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageAttendanceResponseView(APIView):
    """The Customer's one tap on a recorded day (`M2-BE-525`, `526`, `537`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_attendance_respond",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ShiftAttendanceResponseSerializer,
        description=(
            "Confirm the supervisor's count or dispute it.\n\n"
            "**Confirm** approves the shift-day on the shared spine, which for a workforce "
            "engagement also releases it — there is no payout to hold because Vsolve collected "
            "nothing. On a shortfall `shortfall_choice` is **required**: continue short, ask for "
            "an extra day, or cancel the missing workers free. The day settles at the present "
            "workers' published rate whichever you choose — that is `M2-BE-537`, settlement per "
            "worker-day present and never per job — and the choice decides what happens to the "
            "missing worker-days rather than to the money for the ones who came.\n\n"
            "`ADD_DAY` records a request, and only that. The extra day is the lead's to offer "
            "through the amendment engine; appending a shift-day to somebody's week without their "
            "agreement would be the platform committing a vendor's labour.\n\n"
            "**Dispute** is the only place per-worker detail is ever captured. It stops the review "
            "clock and opens the Operations path; the settlement stays unconfirmed, because a "
            "count nobody agrees on is not an amount either. Nothing derives a third number from "
            "`worker_details` — it is the Customer's objection, and a case decides between them."
        ),
        responses={
            200: ShiftAttendanceSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` before the supervisor has recorded "
                "the day, or when a shortfall was left without a choice.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_customer(customer=actor, stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = ShiftAttendanceResponseSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        response_value = payload.validated_data["response"]
        shortfall_choice = payload.validated_data["shortfall_choice"]
        worker_details = list(payload.validated_data["worker_details"])
        note = payload.validated_data["note"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                attendance = workforce.respond_attendance(
                    stage_id=stage.id,
                    actor=actor,
                    response=response_value,
                    shortfall_choice=shortfall_choice,
                    worker_details=worker_details,
                    note=note,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ShiftAttendanceSerializer(attendance).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.attendance_response",
            key=key,
            request_payload={"stage_id": str(stage_id), "response": response_value},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageSettlementView(APIView):
    """The evening "Day settled?" tap (`M2-BE-536`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_day_settled_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Record that this day was settled. Either party taps; the server records **who**, and "
            "nothing else.\n\n"
            "**No money moves here and none can.** A3 wages are direct, daily and peer-to-peer at "
            "day end — the platform never holds them. `amount_paise` is the exact published figure "
            "for the day (present workers at the day rate, plus any extras both sides accepted "
            "through the amendment engine) and `upi_payment_link` is a deep link into the "
            "Customer's own UPI app at that amount. A convenience, not a rail; `null` when the "
            "lead has published no VPA, which is an ordinary state.\n\n"
            "**A one-sided claim is left standing as `SUPERVISOR_CLAIMED` or `CUSTOMER_CLAIMED`.** "
            "That is what Operations reads as *unproven* — one person says they settled and the "
            'other has not answered, which is a different sentence from either "they were paid" '
            'or "they were not". Only both taps make `SETTLED`, and the amount freezes there.'
        ),
        responses={
            200: DaySettlementSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` before the day has been recorded — "
                "there is no amount to settle until somebody says who was there.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        stage = _shift_stage_for_participant(request, stage_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                settlement = workforce.confirm_day_settled(stage_id=stage.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            # The UPI link is computed by `DaySettlementSerializer` itself since 1.31.0. It used
            # to be injected here, which meant it existed in this one response and nowhere else —
            # absent before the tap and gone after a reload, because the shift-day read declared
            # the field and nothing populated it. Injecting it here as well would put the value
            # back in two places and invite them to disagree.
            return status.HTTP_200_OK, cast(
                dict[str, object], DaySettlementSerializer(settlement).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.day_settled",
            key=key,
            request_payload={"stage_id": str(stage_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageExtraView(APIView):
    """Overtime and published add-ons, through the amendment engine (`M2-BE-531`, `538`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_extra_propose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ShiftExtraSerializer,
        description=(
            "Ask the Customer to approve overtime or an add-on **at the card's published rate**. "
            "This is a caller into the one amendment engine this codebase has, not a second one: "
            "the status machine, the expiry and the acceptance are the M1 engine's, and what this "
            "adds is the *price*, read from the card frozen on the engagement at booking.\n\n"
            "**There is no amount field.** The vendor names what and how much of it; the server "
            "names the money. A vendor who could type a number could re-price a job the Customer "
            "booked at a published rate, which is exactly the on-site renegotiation the rate card "
            "exists to leave nowhere to live.\n\n"
            "**Unapproved overtime is unpaid.** Overtime proposed while the shift is still running "
            "needs no window. Overtime for a shift that has already ended must be approved inside "
            "the configured retroactive window, and the amendment's deadline is shortened to it — "
            "past the window the request is refused outright, and while the owner has not set the "
            "window a retroactive request is refused with `m2_policy_unavailable` rather than "
            "granted on a guess.\n\n"
            "An add-on code that is not on the frozen card has no published price and is refused."
        ),
        responses={
            201: EngagementAmendmentSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_required` when this booking publishes no overtime or "
                "add-on rate, or the retroactive window has closed; `m2_policy_unavailable` when "
                "the owner has set no window; `m2_stage_transition_not_allowed` otherwise.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = ShiftExtraSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        extra = workforce.ShiftExtra(
            kind=payload.validated_data["kind"],
            hours=payload.validated_data["hours"],
            add_on_code=payload.validated_data["add_on_code"],
            worker_days=payload.validated_data["worker_days"],
        )
        reason = payload.validated_data["reason"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                amendment = workforce.propose_shift_extra(
                    stage_id=stage.id,
                    actor=actor,
                    extra=extra,
                    reason=reason,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                EngagementAmendmentSerializer(_amendment_payload(amendment)).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.extra",
            key=key,
            request_payload={
                "stage_id": str(stage_id),
                "kind": extra.kind,
                "hours": extra.hours,
                "add_on_code": extra.add_on_code,
                "worker_days": extra.worker_days,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementSafetyIncidentView(APIView):
    """Safety incidents as first-class records (`M2-BE-530`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_safety_incident_list",
        description=(
            "Every safety report on this engagement, readable by both parties. Empty is the "
            "ordinary answer and is a `200`."
        ),
        responses={200: SafetyIncidentListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        try:
            engagement = engagement_for_participant(
                user=cast(User, request.user), engagement_id=engagement_id
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            SafetyIncidentListSerializer(
                {
                    "incidents": engagement.safety_incidents.all(),
                    "server_now": timezone.now(),
                }
            ).data
        )

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_safety_incident_report",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SafetyIncidentReportSerializer,
        description=(
            "File a safety incident. Reportable by **both parties**: the Customer who saw it and "
            "the lead whose worker it was. `reporter_role` is derived from the caller and cannot "
            "be sent.\n\n"
            "**This is never a cancellation reason.** Nothing here cancels, suspends or refunds "
            "anything and the engagement carries on exactly as it was. A job that has to end "
            "because a site is unsafe ends through cancellation *with* a report beside it, so both "
            'facts exist separately and either can be read without the other — filing "a worker '
            'fell" as "job cancelled, site unsafe" is how a platform ends up unable to say, two '
            "years later, what was reported and what was done about it.\n\n"
            "The report body is **frozen** once filed. Operations may add a status and a "
            "resolution; nobody may rewrite what was reported."
        ),
        responses={
            201: SafetyIncidentSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            engagement = engagement_for_participant(user=actor, engagement_id=engagement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = SafetyIncidentReportSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reporter_role = (
            SafetyIncident.ReporterRole.PARTNER
            if engagement.partner.user_id == actor.id
            else SafetyIncident.ReporterRole.CUSTOMER
        )
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                incident = workforce.report_safety_incident(
                    engagement=engagement,
                    actor=actor,
                    reporter_role=reporter_role,
                    severity=data["severity"],
                    category_code=data["category_code"],
                    description=data["description"],
                    occurred_at=data["occurred_at"],
                    stage_id=data["stage_id"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], SafetyIncidentSerializer(incident).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.safety.report",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "severity": data["severity"],
                "category_code": data["category_code"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsSafetyIncidentDecisionView(APIView):
    """Operations moves a report through review to a close (`M2-BE-530`)."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_safety_incident_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SafetyIncidentDecisionSerializer,
        description=(
            "Move a safety report to `UNDER_REVIEW` or close it as `RESOLVED`. Closing requires an "
            "account of what was done.\n\n"
            "The report body is frozen by the model, so this can only ever add a status and a "
            "resolution — an operator cannot revise what somebody said happened, which is the "
            "property that makes the record worth keeping."
        ),
        responses={
            200: SafetyIncidentSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, safety_incident_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        get_object_or_404(SafetyIncident, pk=safety_incident_id)
        payload = SafetyIncidentDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        decision = payload.validated_data["decision"]
        note = payload.validated_data["resolution_note"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                incident = workforce.decide_safety_incident(
                    incident_id=safety_incident_id,
                    actor=actor,
                    status_value=decision,
                    resolution_note=note,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], SafetyIncidentSerializer(incident).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.safety.decision",
            key=key,
            request_payload={
                "safety_incident_id": str(safety_incident_id),
                "decision": decision,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementCashDemandView(APIView):
    """One tap: they asked for extra in cash (`M2-BE-539`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_cash_demand_report",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CashDemandSerializer,
        description=(
            "Report that a cash extra was demanded on site. The Customer's tap, and one tap is all "
            'it takes — `amount_claimed_paise` is optional because a required amount turns "they '
            'demanded extra" into a form, and the form is what stops it being reported.\n\n'
            "**It is never proof on its own.** The report is recorded immutably and a standing "
            "event is written against the lead — a fact with a date, not a penalty and not a "
            "score. If the owner has configured a removal threshold and a window and this vendor "
            "has crossed it, their A3 capability is suspended through the same command Operations "
            "uses, which routes their live engagements exactly as a human suspension does.\n\n"
            "While the threshold is unset nothing at all happens to the vendor and the reports "
            "still accumulate. That asymmetry is deliberate: refusing a Customer's report because "
            "a policy is unconfigured would punish them for an Operations gap, and ending "
            "somebody's trade on an invented number is not a decision code may take."
        ),
        responses={
            201: CashDemandReportSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            engagement = engagement_for_participant(user=actor, engagement_id=engagement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if engagement.customer_id != actor.id:
            raise NotFound()
        payload = CashDemandSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                report = workforce.report_cash_demand(
                    engagement=engagement,
                    actor=actor,
                    amount_claimed_paise=data["amount_claimed_paise"],
                    note=data["note"],
                    stage_id=data["stage_id"],
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], CashDemandReportSerializer(report).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.cash_demand.report",
            key=key,
            request_payload={"engagement_id": str(engagement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C5 (`M2-BE-541..549`): the A5 project surface.
#
# Eight paths, and the shape of the set is decided by who may act rather than by what a project
# management tool would offer:
#
# * the **read** is by participation — both parties look at the same plan;
# * the **delay claim** is raised by the vendor and decided by the Customer, because it changes
#   the Customer's dates;
# * the **handover** is submitted by the vendor and accepted by the Customer, and the acceptance
#   is what lets the project close;
# * the **transfer** is proposed by Operations and decided by the **Customer**, because their
#   remaining cost changes and §7 does not let Operations change somebody's agreement for them;
# * the **early termination** is Operations alone, and decides no remedy — it returns money nobody
#   earned, which is the absence of a remedy rather than one.
#
# Nothing here moves money except through the two rails that already exist: `refund_stage_amount`
# on the M1 refund lifecycle, and ordinary stage funding at the price the Customer accepted. There
# is deliberately **no transfer checkout and no new payment purpose**.
# ---------------------------------------------------------------------------


def _project_engagement_for_participant(request: Request, engagement_id: uuid.UUID) -> Engagement:
    """One A5 engagement, if the caller is either party. `404` otherwise, never `403`."""
    try:
        engagement = engagement_for_participant(
            user=cast(User, request.user), engagement_id=engagement_id
        )
        projects.assert_project_engagement(engagement)
    except RequirementDomainError as exc:
        _raise_api_error(exc)
    return engagement


def _project_payload_response(engagement: Engagement) -> Response:
    payload = projects.project_payload(engagement)
    return Response(ProjectPlanSerializer({**payload, "server_now": timezone.now()}).data)


class EngagementProjectView(APIView):
    """The whole A5 project as one read (`M2-BE-541`, `549`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_read",
        description=(
            "One A5 project, whole: its milestones, its money, its warranty retention, its "
            "handover and whatever recovery is in flight. Both parties read the same payload.\n\n"
            "**Every milestone carries two readings** (`M2-BE-549`): the `original_*` fields are "
            "what was agreed when the estimate was selected, and the plain fields are what stands "
            "now. `schedule_shift_days` is the difference in days, computed server-side. A "
            "project screen that can only say what is due now is useless in the argument it "
            "exists for.\n\n"
            "Read `kind` before rendering a milestone. A `MATERIAL_ADVANCE` is money spent on "
            "goods rather than a milestone somebody performs, and a cancelled one carrying "
            "`cancellation_reason_code: material_advance_left_with_vendor` is **not** going to be "
            "refunded — showing it as a pending refund would promise something no command will "
            "ever do.\n\n"
            "`retention_withheld_paise` climbs as milestones are approved and reaches "
            "`retention_paise` at the last one; `warranty_ends_at` appears with it. Reads only — "
            "nothing here creates a row."
        ),
        responses={
            200: ProjectPlanSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` on an A3 engagement: a workforce "
                "booking has shift-days, not milestones.",
            ),
        },
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        engagement = _project_engagement_for_participant(request, engagement_id)
        return _project_payload_response(engagement)


class EngagementStageDelayClaimView(APIView):
    """The vendor asks for days back on one milestone (`M2-BE-544`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_delay_claim_raise",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DelayClaimCreateSerializer,
        description=(
            "Claim that the Customer held this milestone up, and ask for a schedule extension.\n\n"
            "**No money moves and none can.** There is no amount on this request or on the record "
            "behind it. A delay that costs money is extra work, and extra work is a scope "
            "amendment the Customer accepts and pays for — `POST /engagements/{id}/amendments/`. "
            'One record that could do both would let "the site was locked" arrive as a bill.\n\n'
            "`evidence_ids` are rows already uploaded through this stage's ordinary evidence rail "
            "(`POST /engagement-stages/{id}/evidence/uploads/`), which now accepts uploads on a "
            "`PENDING` stage precisely so a claim about work that never started can carry a "
            "photograph. Ids that are not on this stage are refused.\n\n"
            "One live claim per milestone, held by a database constraint. The Customer has until "
            "`expires_at` to answer, and **silence expires the claim rather than granting it**."
        ),
        responses={
            201: ProjectDelayClaimSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when the milestone is finished or "
                "the engagement is A3; `m2_amendment_not_actionable` when a claim is already "
                "waiting; `m2_policy_unavailable` when the owner has set no response window.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_partner(partner=_partner_profile(request), stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = DelayClaimCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                claim = projects.raise_delay_claim(
                    stage_id=stage.id,
                    actor=actor,
                    reason_code=data["reason_code"],
                    description=data["description"],
                    extension_days=data["extension_days"],
                    evidence_ids=list(data["evidence_ids"]),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProjectDelayClaimSerializer(claim).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.delay_claim",
            key=key,
            request_payload={
                "stage_id": str(stage_id),
                "extension_days": data["extension_days"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class ProjectDelayClaimDecisionView(APIView):
    """The Customer answers a delay claim (`M2-BE-544`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_delay_claim_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DelayClaimDecisionSerializer,
        description=(
            "Accept or reject a delay claim. Customer only.\n\n"
            "**Accepting moves this milestone and every one after it** by `extension_days`, "
            "because a project is a sequence: a week lost on the first fix is a week lost on "
            "everything that follows. A milestone with no date is left without one rather than "
            "given one.\n\n"
            "Rejecting records the decision and changes nothing. Neither answer moves any money."
        ),
        responses={
            200: ProjectDelayClaimSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_not_actionable` when the claim is already decided or "
                "has expired.",
            ),
        },
    )
    def post(self, request: Request, delay_claim_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            claim = projects.delay_claim_for_participant(user=actor, delay_claim_id=delay_claim_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if claim.engagement.customer_id != actor.id:
            # The vendor may read their own claim through the project read; only the Customer may
            # decide it, and a `404` rather than a `403` keeps the two answers indistinguishable.
            _raise_api_error(RequirementNotFoundError())
        payload = DelayClaimDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                decided = projects.decide_delay_claim(
                    delay_claim_id=claim.id,
                    actor=actor,
                    accept=bool(data["accept"]),
                    note=data["note"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ProjectDelayClaimSerializer(decided).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.delay_claim_decide",
            key=key,
            request_payload={
                "delay_claim_id": str(delay_claim_id),
                "accept": bool(data["accept"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementHandoverView(APIView):
    """The vendor hands over the digital deliverables (`M2-BE-547`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_handover_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=HandoverSubmitSerializer,
        description=(
            "Hand over the project's digital deliverables so Event and Media delivery does not "
            "happen off-platform.\n\n"
            "**Files are not uploaded here.** Upload through the ordinary stage evidence rail "
            "first (`POST /engagement-stages/{id}/evidence/uploads/`, then the finalize call) and "
            "send the resulting evidence id as `evidence_id`. A second uploader for deliverables "
            "would be a second bucket, a second orphan sweep and a second set of media-type "
            "rules.\n\n"
            "A `LINK` — `external_url`, https only — is **recorded rather than hosted**, which is "
            "said out loud because a Customer clicking it leaves this platform. What the row buys "
            "is that this Customer accepted that location at that moment.\n\n"
            "Submitting again before acceptance **appends**; it does not replace. The mechanism "
            "that keeps delivery honest is not this endpoint but the next one: while a handover "
            "is submitted and unaccepted, `m2_engagement_completion_accept` refuses."
        ),
        responses={
            200: EngagementSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when the project is not active or "
                "completing, the Customer has already accepted, or a named file is not attached "
                "to this project.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        engagement = _project_engagement_for_participant(request, engagement_id)
        if engagement.partner.user_id != actor.id:
            _raise_api_error(RequirementNotFoundError())
        payload = HandoverSubmitSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                updated = projects.submit_project_handover(
                    engagement_id=engagement.id,
                    actor=actor,
                    note=data["note"],
                    items=[
                        projects.DeliverableInput(
                            title=item["title"],
                            evidence_id=item["evidence_id"],
                            external_url=item["external_url"],
                            stage_id=item["stage_id"],
                        )
                        for item in data["items"]
                    ],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(updated).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.handover_submit",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "items": len(data["items"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementHandoverAcceptanceView(APIView):
    """The Customer accepts the deliverables (`M2-BE-547`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_handover_accept",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Accept the handover. Customer only.\n\n"
            "Its own act rather than a side effect of closing the project, because the two can "
            "legitimately happen at different moments — a photographer delivers the gallery in "
            "week two of a four-week edit.\n\n"
            "**When the project is already `COMPLETING`, accepting the handover finishes it**: "
            "the response is the completed (or `WARRANTY`) engagement, and no second call to "
            "`m2_engagement_completion_accept` is needed. Read `status` from the response."
        ),
        responses={
            200: EngagementSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when nothing has been handed over "
                "yet, or when completion is blocked by an open stage.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        engagement = _project_engagement_for_participant(request, engagement_id)
        if engagement.customer_id != actor.id:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                accepted = projects.accept_project_handover(
                    engagement_id=engagement.id, actor=actor
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(accepted).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.handover_accept",
            key=key,
            request_payload={"engagement_id": str(engagement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementProjectTransferView(APIView):
    """Operations proposes a replacement vendor for the remaining milestones (`M2-BE-545`)."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_transfer_propose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectTransferProposeSerializer,
        description=(
            "Propose moving every unfinished milestone to a replacement vendor at the "
            "replacement's own prices. Operations only, and **nothing moves until the Customer "
            "accepts** — their remaining cost changes, and §7 does not let Operations change "
            "somebody's agreement for them.\n\n"
            "**Priced per milestone, never as a lump.** Every unfinished milestone must appear in "
            "`quotes` exactly once and no others may, so the two numbers the Customer decides on "
            "are sums over the same list of work. Read the current list from "
            "`GET /engagements/{id}/project/`: it is every milestone whose `status` is `PENDING`, "
            "`IN_PROGRESS`, `AWAITING_REVIEW` or `CORRECTION_REQUESTED`, **excluding** a "
            "`MATERIAL_ADVANCE` that has been funded.\n\n"
            "**A disputed milestone blocks the whole transfer** (`m2_stage_disputed`). Decide it "
            "at `POST /engagement-stages/{id}/dispute/decision/` first: transferring around a "
            "dispute would close the objection by moving it out of the agreement.\n\n"
            "A funded material advance is neither transferred nor refunded. It is reported on the "
            "proposal as `material_advance_outstanding_paise` and left with the abandoning vendor "
            "— that money bought goods, and a background job is not the thing that decides where "
            "they went."
        ),
        responses={
            201: ProjectTransferSerializer,
            400: ApiErrorSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_not_approved` or `m2_capability_suspended` when the "
                "replacement cannot serve this variant and area.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_disputed`, `m2_amendment_not_actionable` when a transfer "
                "is already waiting, or `m2_stage_transition_not_allowed` when the milestone "
                "list does not match.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = ProjectTransferProposeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                transfer = projects.propose_project_transfer(
                    engagement_id=engagement_id,
                    actor=actor,
                    to_partner_id=data["to_partner_id"],
                    quotes=[
                        projects.TransferQuote(
                            stage_id=quote["stage_id"],
                            amount_paise=quote["amount_paise"],
                        )
                        for quote in data["quotes"]
                    ],
                    reason_code=data["reason_code"],
                    note=data["note"],
                )
            except Engagement.DoesNotExist as exc:
                raise NotFound("That engagement does not exist.") from exc
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProjectTransferSerializer(transfer).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.transfer_propose",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "to_partner_id": str(data["to_partner_id"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class ProjectTransferDecisionView(APIView):
    """The Customer accepts or declines a proposed transfer (`M2-BE-545`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_transfer_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectTransferDecisionSerializer,
        description=(
            "Accept or decline a proposed vendor transfer. Customer only.\n\n"
            "**Accepting settles the delta structurally, and there is no checkout here.** Every "
            "unfinished milestone refunds what was funded and unearned through the ordinary M1 "
            "refund lifecycle, drops back to `REQUIRED`, and is then repriced to the "
            "replacement's number; the engagement's `amendment_delta_paise` moves by exactly the "
            "difference. The money asked for afterwards is the ordinary stage funding that was "
            "always going to be asked for, at the price just accepted. That is what stops anybody "
            "paying twice.\n\n"
            "**The engagement returns to `PENDING_START` and `work_may_start_at` is cleared.** "
            "The replacement has nothing funded and no clearance; fund the first milestone at "
            "`POST /engagement-stages/{id}/funding/` exactly as at the start of the project.\n\n"
            "`refunded_paise` on the response is what actually went back. "
            "`material_advance_outstanding_paise` is what did not and will not — render it as an "
            "open question for support, never as a pending refund."
        ),
        responses={
            200: ProjectTransferSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_not_actionable` when the transfer is decided, expired "
                "or the unfinished work changed after it was priced; `m2_stage_disputed` when a "
                "milestone was disputed in between.",
            ),
        },
    )
    def post(self, request: Request, project_transfer_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            transfer = projects.transfer_for_customer(
                customer=actor, project_transfer_id=project_transfer_id
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = ProjectTransferDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                decided = projects.decide_project_transfer(
                    project_transfer_id=transfer.id,
                    actor=actor,
                    accept=bool(data["accept"]),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ProjectTransferSerializer(decided).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.transfer_decide",
            key=key,
            request_payload={
                "project_transfer_id": str(project_transfer_id),
                "accept": bool(data["accept"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementTerminationView(APIView):
    """Operations ends a project early, with work outstanding (`M2-BE-543`, `545`)."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_terminate",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectTerminationSerializer,
        description=(
            "End an A5 project with milestones outstanding and no replacement. Operations only.\n\n"
            "**The two recovery rules that make `EngagementStage.kind` worth having** "
            "(`M2-BE-543`): a funded, unearned **work** milestone is refunded, because the "
            "platform is holding the Customer's money for work that is not going to happen; a "
            "funded **material advance** is **not** refunded and not clawed back, because the "
            "vendor spent it on goods. The advance is cancelled with "
            "`cancellation_reason_code: material_advance_left_with_vendor` and reaches Operations "
            "as an outstanding balance somebody resolves against the physical world.\n\n"
            "**This decides no remedy.** No penalty, no forfeit, no compensation. Who owes whom "
            "what when a project ends early is the cancellation policy engine in Wave C6 "
            "(`M2-BE-701`, `706`). Returning money nobody earned is the absence of a remedy "
            "rather than one.\n\n"
            "The engagement becomes `CANCELLED` and the requirement closes as `CLOSED_CANCELLED`. "
            "Cancelled milestones keep their amounts and their funding history — the agreement "
            "was that big and the money was collected, and shrinking the totals to make a "
            "cancelled project look tidy would erase what a dispute reads."
        ),
        responses={
            200: EngagementSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when the project is already closed "
                "or the engagement is A3.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = ProjectTerminationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                ended = projects.terminate_project_early(
                    engagement_id=engagement_id,
                    actor=actor,
                    reason_code=data["reason_code"],
                    note=data["note"],
                )
            except Engagement.DoesNotExist as exc:
                raise NotFound("That engagement does not exist.") from exc
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(ended).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.terminate",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "reason_code": data["reason_code"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# Wave C6 — cancellation, cases and the Operations workspace (`M2-BE-701..719`)
#
# The split below is 07 §7's permission table expressed as routes. A **party** may call off their
# own job, answer the other side, show evidence and appeal a decision about them. **Operations**
# may see everything, rematch, extend, reclassify, capture with consent, verify crew documents,
# work the queues and record a chargeback. There is no route that lets Operations accept an offer
# for a vendor, publish a vendor's price without the vendor, or move money by hand — and the
# absence of those three is deliberate rather than deferred.
# ---------------------------------------------------------------------------


def _requirement_for_party(*, user: User, requirement_id: uuid.UUID) -> CustomerRequirement:
    """The request, if the caller is its Customer or the engaged vendor.

    `404` rather than `403`, per 07 §7: existence itself is private, and a `403` on somebody
    else's request confirms that it exists.
    """
    requirement = (
        CustomerRequirement.objects.select_related("configuration", "service_area")
        .filter(pk=requirement_id)
        .first()
    )
    if requirement is None:
        raise NotFound("That request does not exist.")
    if requirement.customer_id == user.id:
        return requirement
    engaged = Engagement.objects.filter(requirement=requirement, partner__user_id=user.id).exists()
    if not engaged:
        raise NotFound("That request does not exist.")
    return requirement


def _actor_role_for(*, user: User, requirement: CustomerRequirement) -> str:
    if requirement.customer_id == user.id:
        return RequirementCancellation.ActorRole.CUSTOMER
    return RequirementCancellation.ActorRole.PARTNER


class RequirementCancellationView(APIView):
    """Call this job off, and read what happened (`M2-BE-701`, `702`, `706`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Cancellation"],
        operation_id="m2_cancellation_read",
        description=(
            "The cancellation currently open on this request, or `null`. Both parties see the "
            "same record and the same numbers — a remedy one side could read differently from "
            "the other is how a support call becomes an argument."
        ),
        responses={
            200: RequirementCancellationSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        requirement = _requirement_for_party(user=actor, requirement_id=requirement_id)
        live = cancellations.live_cancellation(requirement)
        if live is None:
            return Response({}, status=status.HTTP_200_OK)
        return Response(
            RequirementCancellationSerializer(cancellations.cancellation_payload(live)).data
        )

    @extend_schema(
        tags=["M2 - Cancellation"],
        operation_id="m2_cancellation_request",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CancellationRequestSerializer,
        description=(
            "Evaluate and start a cancellation. **Nothing is charged or refunded by this call "
            "on its own.**\n\n"
            "The response says which of two things happened. If contact has not been disclosed "
            "and nobody has reported work starting, the remedy executes immediately and the "
            "record comes back `EXECUTED`. If either is true, it comes back "
            "`AWAITING_CONFIRMATION` with a deadline: past that point one party may no longer "
            "end an agreement on their own account of it, and the other side confirms or "
            "disputes (`M2-BE-702`).\n\n"
            "The remedy is calculated **before** anything moves, because the lifecycle state it "
            "rests on stops being readable the moment it does. Wages are never part of it: an A3 "
            "service payment is peer-to-peer and this platform has never held it."
        ),
        responses={
            201: RequirementCancellationSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the request is already "
                "closed or already has a cancellation waiting on a decision. "
                "`m2_policy_unavailable` when the free-cancel window T is unset and a paid A3 "
                "booking would have to be settled against it — the fail-closed direction, "
                "because choosing between a refund and a forfeit by guessing is choosing whose "
                "money it is.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        requirement = _requirement_for_party(user=actor, requirement_id=requirement_id)
        payload = CancellationRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                cancellation = cancellations.evaluate_cancellation(
                    requirement_id=requirement.id,
                    actor=actor,
                    actor_role=_actor_role_for(user=actor, requirement=requirement),
                    reason_code=data["reason_code"],
                    reason=data["reason"],
                    evidence=list(data["evidence"]),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                RequirementCancellationSerializer(
                    cancellations.cancellation_payload(cancellation)
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.cancellation.request",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "reason_code": data["reason_code"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class CancellationDecisionView(APIView):
    """The counterparty confirms or disputes (`M2-BE-702`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Cancellation"],
        operation_id="m2_cancellation_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CancellationDecisionSerializer,
        description=(
            "Confirm the other side's cancellation, or dispute it.\n\n"
            "Confirming runs the remedy on the terms it was evaluated at. Disputing runs "
            "nothing: it opens a `CANCELLATION_CONFLICT` case, which **holds the vendor's unpaid "
            "earnings**, and Operations decides. `M2-AC-703` requires exactly that — a Customer "
            "who says work and cash payment happened while the Partner claims cancellation must "
            "not have the payout or the refund auto-resolve around them."
        ),
        responses={
            200: RequirementCancellationSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, cancellation_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        cancellation = cancellations.cancellation_for_participant(
            user=actor, cancellation_id=cancellation_id
        )
        payload = CancellationDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                decided = (
                    cancellations.confirm_cancellation(cancellation_id=cancellation.id, actor=actor)
                    if data["confirm"]
                    else cancellations.dispute_cancellation(
                        cancellation_id=cancellation.id,
                        actor=actor,
                        reason=data["reason"],
                    )
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object],
                RequirementCancellationSerializer(cancellations.cancellation_payload(decided)).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.cancellation.decide",
            key=key,
            request_payload={
                "cancellation_id": str(cancellation_id),
                "confirm": data["confirm"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementCaseListView(APIView):
    """Every case about this job, as one of its two parties may read it (`M2-BE-703`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Cases"],
        operation_id="m2_engagement_cases",
        description=(
            "The party view of every case opened on this request — a disputed stage, a disputed "
            "head count, a no-show, a safety report, an off-platform claim, a warranty claim or "
            "a chargeback.\n\n"
            "Deliberately narrower than the Operations projection: it carries what the case is, "
            "when this party has to answer, whether money is held and what was decided. It "
            "carries no internal notes, no owning team and no statement made by the other side."
        ),
        responses={200: PartyCaseListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        engagement = selectors.engagement_for_participant(user=actor, engagement_id=engagement_id)
        rows = [
            disputes.case_payload(case) for case in disputes.request_cases(engagement.requirement)
        ]
        return Response(PartyCaseListSerializer({"cases": rows, "server_now": timezone.now()}).data)


class EngagementWarrantyClaimView(APIView):
    """The Customer calls on a warranty the retention was held against."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Cases"],
        operation_id="m2_warranty_claim_raise",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=WarrantyClaimSerializer,
        description=(
            "Raise a warranty claim inside the warranty window.\n\n"
            "**This is the surface `M2-BE-546` was missing.** Retention is held back out of the "
            "vendor's payout against a warranty promise, and until 1.32.0 there was no published "
            "way to call on it: the stage-dispute command accepts only a stage in "
            "`AWAITING_REVIEW`, and by warranty time every stage is settled, so it refused by "
            "construction. Money was held for a promise the product could not accept a call "
            "against.\n\n"
            "Raising a claim opens a `QUALITY` case — which holds payout — and **stops the "
            "warranty sweep releasing the retention** while it is open. The window is the "
            "engagement's own `warranty_ends_at`; an engagement that advertised no warranty "
            "refuses, because there is nothing held to claim against."
        ),
        responses={
            201: PartyCaseSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the job carries no "
                "warranty, the warranty period has ended, or the work is not finished yet.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = WarrantyClaimSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                case = disputes.raise_warranty_claim(
                    engagement_id=engagement_id,
                    actor=actor,
                    summary=data["summary"],
                    detail=data["detail"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], PartyCaseSerializer(disputes.case_payload(case)).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.warranty.claim",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "summary": data["summary"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class CaseEvidenceView(APIView):
    """A party shows the decision something (`M2-BE-704`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Cases"],
        operation_id="m2_case_evidence_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CaseEvidenceSerializer,
        description=(
            "Attach a statement, a requirement attachment or a stage-evidence record to a case "
            "you are a party to.\n\n"
            "**There is no file upload here.** Evidence points at bytes that already came "
            "through one of the two verified rails — the requirement-attachment presign or the "
            "stage-evidence presign — so there is exactly one scan pipeline and one place a "
            "malware verdict can be forgotten. A file you have not uploaded yet is uploaded "
            "there first.\n\n"
            "Submitting evidence never moves the case. A case that advanced because somebody "
            "uploaded a photograph would be a case that could be closed by uploading "
            "photographs."
        ),
        responses={
            201: CaseEvidenceRecordSerializer,
            400: ApiErrorSerializer,
            404: OpenApiResponse(
                response=ApiErrorSerializer,
                description="Also returned when the artifact belongs to a different request — "
                "the object-level rule applied to the join, not only to the route.",
            ),
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, case_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = CaseEvidenceSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                evidence = disputes.submit_evidence(
                    case_id=case_id,
                    actor=actor,
                    statement=data["statement"],
                    requirement_attachment_id=data.get("requirement_attachment_id"),
                    stage_evidence_id=data.get("stage_evidence_id"),
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                CaseEvidenceRecordSerializer(
                    {
                        "id": evidence.id,
                        "party": evidence.party,
                        "statement": evidence.statement,
                        "requirement_attachment_id": evidence.requirement_attachment_id,
                        "stage_evidence_id": evidence.stage_evidence_id,
                        "created_at": evidence.created_at,
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.case.evidence",
            key=key,
            request_payload={"case_id": str(case_id), "statement": data["statement"]},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class CaseAppealView(APIView):
    """A party challenges a decision that went against them (`M2-BE-704`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Cases"],
        operation_id="m2_case_appeal_request",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CaseAppealRequestSerializer,
        description=(
            "Ask for a case to be looked at again. One appeal per case.\n\n"
            "An **open** case may be appealed at any time — nothing has been decided yet. A "
            "**resolved** one may be appealed only inside the variant's configured appeal "
            "window, and while that window is unset the appeal is refused with "
            "`m2_policy_unavailable` rather than allowed indefinitely: an appeal window with no "
            "bound is an open-ended claim to reverse a decision that already moved money."
        ),
        responses={
            200: PartyCaseSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, case_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = CaseAppealRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reason = payload.validated_data["reason"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                case = disputes.request_appeal(case_id=case_id, actor=actor, reason=reason)
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], PartyCaseSerializer(disputes.case_payload(case)).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.case.appeal",
            key=key,
            request_payload={"case_id": str(case_id), "reason": reason},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsRequestTimelineView(APIView):
    """`M2-BE-711`: one chronological history of one request."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_request_timeline",
        description=(
            "Everything that happened to one request, in order: transitions, snapshots, "
            "invitations and cascade offers **with the vendor named**, questions, proposals, "
            "site visits, the booking fee, the unlock, the visit plan and its shares, the "
            "engagement and its stages, every case, every cancellation and every Operations "
            "touch.\n\n"
            "Assembled from the aggregates rather than from a projection table, deliberately: a "
            "materialised timeline drifts the first time a command forgets to append to it, and "
            "the failure mode is the worst available — a timeline that looks complete and is "
            "not. This is the read a support agent makes a money decision from."
        ),
        responses={
            200: RequestTimelineSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = operations.find_requirement(requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(
            RequestTimelineSerializer(
                {
                    "requirement_id": requirement.id,
                    "archetype": requirement.archetype,
                    "status": requirement.status,
                    "events": operations.request_timeline(requirement),
                    "server_now": timezone.now(),
                }
            ).data
        )


class OperationsRematchView(APIView):
    """`M2-BE-712`: send the request round again, for free."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_rematch",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=OperationsReasonSerializer,
        description=(
            "Rematch one request. A rate-card A3 booking advances its **cascade**; everything "
            "else runs another **invitation wave**. Neither charges anything, and the Customer "
            "does not have to know which engine answered their question.\n\n"
            "The reason is required and lands on the timeline as an Operations touch."
        ),
        responses={
            200: RequestTimelineSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = OperationsReasonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reason = payload.validated_data["reason"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                requirement = operations.rematch_requirement(
                    requirement_id=requirement_id, actor=actor, reason=reason
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            except CustomerRequirement.DoesNotExist as exc:
                raise NotFound("That request does not exist.") from exc
            return status.HTTP_200_OK, cast(
                dict[str, object],
                RequestTimelineSerializer(
                    {
                        "requirement_id": requirement.id,
                        "archetype": requirement.archetype,
                        "status": requirement.status,
                        "events": operations.request_timeline(requirement),
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.rematch",
            key=key,
            request_payload={"requirement_id": str(requirement_id), "reason": reason},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsDeadlineView(APIView):
    """`M2-BE-712`: give a request more time. Forward only."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_extend_deadline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=OperationsDeadlineExtensionSerializer,
        description=(
            "Move a request's needed-by date forward by a number of hours.\n\n"
            "**Forward only.** A deadline extension that could pull a date in would be a way to "
            "close somebody's live request by moving its clock, which is the opposite of a "
            "recovery action."
        ),
        responses={
            200: RequestTimelineSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = OperationsDeadlineExtensionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                requirement = operations.extend_requirement_deadline(
                    requirement_id=requirement_id,
                    actor=actor,
                    extra_hours=data["extra_hours"],
                    reason=data["reason"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            except CustomerRequirement.DoesNotExist as exc:
                raise NotFound("That request does not exist.") from exc
            return status.HTTP_200_OK, cast(
                dict[str, object],
                RequestTimelineSerializer(
                    {
                        "requirement_id": requirement.id,
                        "archetype": requirement.archetype,
                        "status": requirement.status,
                        "events": operations.request_timeline(requirement),
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.extend_deadline",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "extra_hours": data["extra_hours"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsReclassificationView(APIView):
    """`M2-BE-712`: move an ambiguous request to the other lifecycle."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_reclassify",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=OperationsReclassificationSerializer,
        description=(
            "Reclassify a request between the workforce and project lifecycles. Every paid value "
            "is preserved — unfilled visit shares refund or convert, a charged unlock survives — "
            "and matching restarts with **no second charge** (`M2-AC-104`, `M2-AC-334`)."
        ),
        responses={
            200: RequestTimelineSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = OperationsReclassificationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                requirement = operations.reclassify(
                    requirement_id=requirement_id,
                    to_archetype=data["to_archetype"],
                    actor=actor,
                    reason=data["reason"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            except CustomerRequirement.DoesNotExist as exc:
                raise NotFound("That request does not exist.") from exc
            return status.HTTP_200_OK, cast(
                dict[str, object],
                RequestTimelineSerializer(
                    {
                        "requirement_id": requirement.id,
                        "archetype": requirement.archetype,
                        "status": requirement.status,
                        "events": operations.request_timeline(requirement),
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.reclassify",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "to_archetype": data["to_archetype"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsRefundReviewView(APIView):
    """`M2-BE-712`: record a human decision about a refund."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_refund_review",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=OperationsRefundReviewSerializer,
        description=(
            "Record that a refund was reviewed, and what was decided.\n\n"
            "**It records rather than moves money, and that is the design.** Each product "
            "refunds through the module that owns it — the booking fee, the unlock, the visit "
            "share — idempotently and on the M1 rail. An Operations endpoint that could move an "
            "arbitrary amount to an arbitrary payer would be a second refund path with none of "
            "the first's reconciliation, and `M2-AC-712` requires each product to reconcile "
            "independently."
        ),
        responses={
            200: OperationsTouchSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = OperationsRefundReviewSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                touch = operations.review_refund(
                    requirement_id=requirement_id,
                    actor=actor,
                    decision=data["decision"],
                    reason=data["reason"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object],
                OperationsTouchSerializer(
                    {
                        "id": touch.id,
                        "action": touch.action,
                        "reason": touch.reason,
                        "occurred_at": touch.occurred_at,
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.refund_review",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "decision": data["decision"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsAssistedClarificationView(APIView):
    """`M2-BE-713`: write down a clarification that happened on the phone."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_assisted_clarification",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=AssistedClarificationSerializer,
        description=(
            "Capture a question and its answer on behalf of the two named parties.\n\n"
            "**Consent is a refusal, not a checkbox.** Without `consent_recorded` the capture "
            "does not happen: `M2-AC-802` requires assisted capture to record consent and the "
            "named actor, and a flag that could be false while the row was still written would "
            "record the absence of consent next to the thing it was absent for.\n\n"
            "Attribution goes to the parties, not the operator: the question is the Partner's "
            "and the answer is the Customer's, with the operator recorded beside them."
        ),
        responses={
            201: RequirementQuestionSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, invitation_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = AssistedClarificationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                question = operations.capture_assisted_clarification(
                    invitation_id=invitation_id,
                    actor=actor,
                    question=data["question"],
                    answer=data["answer"],
                    consent_recorded=data["consent_recorded"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], RequirementQuestionSerializer(question).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.assisted_clarification",
            key=key,
            request_payload={
                "invitation_id": str(invitation_id),
                "question": data["question"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsAssistedProposalView(APIView):
    """`M2-BE-713`: write down a quote a vendor gave by phone. The vendor still confirms it."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_assisted_proposal",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposalCreateSerializer,
        description=(
            "Capture a quote a Partner gave over the phone, attributed to that Partner.\n\n"
            "Revision 4 makes this a **primary path** rather than a convenience: on the A3 "
            "fallback the vendors who answer fastest are often the ones who will not fill in a "
            "form. It is still not a way for staff to publish a price — the proposal is written "
            "with `vendor_confirmed_at` null, every Customer-facing read already filters on "
            "that, and the vendor's own confirmation is what makes it visible (`M2-AC-218`).\n\n"
            "Consent is recorded through the `Idempotency-Key`-scoped command and refused when "
            "absent, exactly as assisted clarification is. The wage floor is derived and "
            "enforced here identically to a vendor's own submission."
        ),
        responses={
            201: ProposalSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = ProposalCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        invitation_id = data.pop("invitation_id")

        def command() -> tuple[int, dict[str, object]]:
            try:
                proposal = operations.capture_assisted_proposal(
                    invitation_id=invitation_id,
                    actor=actor,
                    payload=data,
                    consent_recorded=True,
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProposalSerializer(proposal).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.assisted_proposal",
            key=key,
            request_payload={"invitation_id": str(invitation_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsCrewVerificationQueueView(APIView):
    """Crew waiting on a document check, and the command that clears them."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_crew_verification_queue",
        parameters=[
            OpenApiParameter(
                name="partner",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Narrow to one vendor's roster.",
            )
        ],
        description=(
            "Active crew memberships whose documents have never been verified, oldest first.\n\n"
            "This queue is why the A3 cascade can find anybody: `documents_verified_at` is what "
            "`verified_roster_size` counts when it sizes a lead's roster against the requested "
            "headcount, and a vendor with no verified crew is excluded from every crew offer."
        ),
        responses={200: CrewVerificationQueueSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        raw_partner = request.query_params.get("partner")
        partner_id: uuid.UUID | None = None
        if raw_partner:
            try:
                partner_id = uuid.UUID(raw_partner)
            except ValueError as exc:
                raise ValidationError(
                    {"partner": "Must be a UUID."}, code="invalid_partner"
                ) from exc
        rows = [
            {
                "membership_id": membership.id,
                "partner_id": membership.partner_id,
                "partner_name": membership.partner.display_name,
                "crew_member_name": membership.crew_member.display_name,
                "is_supervisor": membership.is_supervisor,
                "added_at": membership.added_at,
                "documents_verified_at": membership.documents_verified_at,
            }
            for membership in operations.crew_memberships_awaiting_verification(
                partner_id=partner_id
            )
        ]
        return Response(
            CrewVerificationQueueSerializer(
                {"memberships": rows, "server_now": timezone.now()}
            ).data
        )


class OperationsCrewVerificationView(APIView):
    """The writer `PartnerCrewMembership.documents_verified_at` did not have."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_crew_verify",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewVerificationSerializer,
        description=(
            "Verify — or un-verify — one worker's documents on one vendor's roster.\n\n"
            "**This column had four readers and no writer.** `verified_roster_size` counts only "
            "verified memberships when sizing a lead's roster against the requested headcount, "
            "`assign_crew` refuses an unverified worker outright, and both apps publish a badge "
            "from it; with nothing setting it, every vendor's verified roster was zero in every "
            "environment and every crew offer excluded every lead. The dev seed has stamped it "
            "since Wave C5 so the demo walks; this is the production writer.\n\n"
            "Verifying needs no reason — the documents were seen. **Removing** verification "
            "does, because it takes a named person off jobs they may already be assigned to. "
            "Verifying an already-verified membership is a no-op rather than a re-stamp, so the "
            "date keeps meaning when the documents were actually checked."
        ),
        responses={
            200: CrewMembershipVerificationRowSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_requirement_transition_not_allowed` when the membership is "
                "archived, or when verification is being removed with no reason given.",
            ),
        },
    )
    def post(self, request: Request, membership_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = CrewVerificationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                membership = operations.verify_crew_documents(
                    membership_id=membership_id,
                    actor=actor,
                    verified=data["verified"],
                    reason=data["reason"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object],
                CrewMembershipVerificationRowSerializer(
                    {
                        "membership_id": membership.id,
                        "partner_id": membership.partner_id,
                        "partner_name": membership.partner.display_name,
                        "crew_member_name": membership.crew_member.display_name,
                        "is_supervisor": membership.is_supervisor,
                        "added_at": membership.added_at,
                        "documents_verified_at": membership.documents_verified_at,
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.crew_verify",
            key=key,
            request_payload={
                "membership_id": str(membership_id),
                "verified": data["verified"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsQueueView(APIView):
    """`M2-BE-714`: every M2 record that has stopped moving."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_queues",
        description=(
            "Eight stuck-state queues with their depth, their oldest member and the recovery "
            "action that clears them: unmatched, under-quoted, SLA-breached, unconfirmed, "
            "inactive, unreconciled, plus a cancellation nobody answered and a case past its "
            "parties' response deadline.\n\n"
            "**No queue here invents a threshold.** Each is defined by a deadline that already "
            "exists on the record, so an unset owner value cannot silently change what counts as "
            "stuck; a queue whose deadline is null is simply empty, which is the honest reading "
            'of "we promised no clock here".'
        ),
        responses={200: StuckQueueListSerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        return Response(
            StuckQueueListSerializer(
                {
                    "queues": [asdict(queue) for queue in operations.stuck_queues()],
                    "server_now": timezone.now(),
                }
            ).data
        )


class OperationsTouchMetricView(APIView):
    """`M2-BE-715`: what one request cost Operations, against what it earned."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_touch_metric",
        description=(
            "Operations touches on one request, the configured budget, and the platform revenue "
            "the touches have to fit inside. For A3 that revenue is the booking fee's **platform "
            "share** — decision 10 as restated by ADR-0009 — because the booking fee is the "
            "platform's entire A3 revenue.\n\n"
            "`within_budget` is `null` while the owner has not set a budget. Not `false`, which "
            "would read as a breach, and not `true`, which would read as a pass: the count is "
            "real and the judgement is not available.\n\n"
            "Only **settled** money counts as revenue. An `ACTIVE` booking fee is money held "
            "against a crew that has not arrived, and counting it would make the unit economics "
            "look healthiest exactly when the most is at risk."
        ),
        responses={200: TouchMetricSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, _request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = operations.find_requirement(requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        metric = operations.touch_metric(requirement)
        return Response(
            TouchMetricSerializer(
                {
                    **asdict(metric),
                    "touches_detail": [
                        {
                            "id": touch.id,
                            "action": touch.action,
                            "reason": touch.reason,
                            "occurred_at": touch.occurred_at,
                        }
                        for touch in OperationsTouch.objects.filter(requirement=requirement)
                    ],
                    "server_now": timezone.now(),
                }
            ).data
        )


class OperationsTouchRollupView(APIView):
    """`M2-BE-715`: the whole book, for the unit-economics dashboard."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_touch_rollup",
        description=(
            "Operations touches across every request in the last thirty days, by action, with "
            "the mean per touched request. `M2-AC-810` measures against this."
        ),
        responses={200: TouchRollupSerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        return Response(TouchRollupSerializer(operations.touch_rollup()).data)


class OperationsChargebackView(APIView):
    """`M2-BE-708`: a chargeback on the booking, unlock or visit-plan fee itself."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_record_chargeback",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ChargebackSerializer,
        description=(
            "Record that the Customer's bank pulled back a platform fee, and open the standard "
            "dispute path.\n\n"
            "Opening the `CHARGEBACK` case **holds payout**: a visit share or a travel "
            "compensation funded by the charge being reversed stops being payable immediately, "
            'which is `M2-AC-711`\'s "freezes unsafe settlement". Money that has already left '
            "is not reversed — it is reported as an open financial exception, because a status "
            "flip that made the ledger disagree with the bank is the one failure reconciliation "
            "cannot repair.\n\n"
            "The fee row itself does **not** move. A chargeback is a claim in progress, not a "
            "settlement, and marking an earned fee refunded here would tell both parties a "
            "decision had been taken that has not been.\n\n"
            "The rate alarm fires from here when the variant's threshold is configured; while it "
            "is unset **no alarm fires** and every chargeback is still recorded."
        ),
        responses={
            201: OpenApiResponse(
                response=PartyCaseSerializer,
                description="The case that now owns it.",
            ),
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, payment_attempt_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = ChargebackSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                case = reconciliation.record_fee_chargeback(
                    payment_attempt_id=payment_attempt_id,
                    amount_paise=data["amount_paise"],
                    provider_reference=data["provider_reference"],
                    reason_code=data["reason_code"],
                    actor=actor,
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            except PaymentAttempt.DoesNotExist as exc:
                raise NotFound("That payment does not exist.") from exc
            return status.HTTP_201_CREATED, cast(
                dict[str, object], PartyCaseSerializer(disputes.case_payload(case)).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.chargeback",
            key=key,
            request_payload={
                "payment_attempt_id": str(payment_attempt_id),
                "provider_reference": data["provider_reference"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsReconciliationView(APIView):
    """`M2-BE-710`: what Finance is carrying right now."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_reconciliation_summary",
        description=(
            "Open financial exceptions by kind, plus the two refund states a Customer must never "
            "see presented as complete: refunds the provider has not settled, and refunds it "
            "explicitly refused (`M2-AC-709`).\n\n"
            "The sweep that produces these runs on the beat schedule and **never corrects what "
            "it finds**. A reconciliation job that could fix a mismatch would quietly rewrite "
            "history when its own arithmetic was wrong, and the first sign of trouble would be a "
            "ledger that always balanced."
        ),
        responses={200: ReconciliationSummarySerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request) -> Response:
        return Response(
            ReconciliationSummarySerializer(reconciliation.open_exception_summary()).data
        )
