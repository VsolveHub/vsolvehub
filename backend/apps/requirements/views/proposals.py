"""Partner: proposals.

The vendor's own quotes — the list that closed the largest hole in the Partner surface, the
submission that supersedes rather than overwrites, the single read and the withdrawal.
"""

import uuid
from typing import cast

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.capabilities import assert_capability_active
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsPartnerUser
from apps.requirements import proposals
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import Proposal
from apps.requirements.selectors import invitation_for_partner, partner_proposals
from apps.requirements.serializers import (
    ProposalCreateSerializer,
    ProposalPageSerializer,
    ProposalSerializer,
)
from apps.requirements.views.base import (
    ProposalCursorPagination,
    _idempotency_key,
    _partner_profile,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import BoundedCursorQuerySerializer, reject_invalid_cursor_query
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


class PartnerProposalCollectionView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

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


class PartnerProposalWithdrawView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_partner_response"

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
