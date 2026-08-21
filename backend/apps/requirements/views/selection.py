"""Wave C2: selection, reconfirmation and the engagement.

The Customer chooses one vendor, the vendor reconfirms or declines, and the agreement that opens
out of it — plus the A5 stage-funding checkout, which is the only money this slice moves.
"""

import uuid
from typing import cast

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsPartnerUser
from apps.requirements import engagements
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.selectors import (
    engagement_for_participant,
    requirement_for_customer,
    selection_for_partner,
    stage_for_customer,
)
from apps.requirements.serializers import (
    AccessCheckoutSerializer,
    EngagementSerializer,
    ProposalSelectionSerializer,
    SelectionCreateSerializer,
    SelectionDeclineSerializer,
)
from apps.requirements.views.base import (
    _checkout_payload,
    _idempotency_key,
    _partner_profile,
    _proposal_for_customer,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


class RequirementSelectionView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_quote_action"

    @extend_schema(
        tags=["M2 - Selection"],
        operation_id="m2_selection_read",
        description=(
            "The live selection for this request. Selection opens the engagement in the same "
            "transaction, so `engagement_id` is available immediately on a confirmed selection."
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
            "Choose one vendor and open the engagement atomically after capability, availability "
            "and quote-validity checks. The response includes `engagement_id`; multiple "
            "simultaneous selections are not supported."
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


class SelectionReconfirmView(ThrottledWriteMixin, APIView):
    """The vendor commits, and the engagement opens."""

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

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


class SelectionDeclineView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

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


class EngagementStageFundingView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_money"

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
