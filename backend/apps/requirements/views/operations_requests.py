"""Wave C6, continued: Operations acting on one request.

The recovery actions that take a request id — the whole chronological history, a free rematch, a
forward-only deadline extension, a reclassification between the two lifecycles, a recorded refund
review — and the two assisted-capture routes, where consent is a refusal rather than a checkbox.
"""

import uuid
from typing import cast

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsOperationsUser
from apps.requirements import operations
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import CustomerRequirement, Engagement
from apps.requirements.serializers import (
    AssistedClarificationSerializer,
    AssistedProposalSerializer,
    OperationsDeadlineExtensionSerializer,
    OperationsReasonSerializer,
    OperationsReclassificationSerializer,
    OperationsRefundReviewSerializer,
    OperationsTouchSerializer,
    ProposalSerializer,
    RequestTimelineSerializer,
    RequirementQuestionSerializer,
)
from apps.requirements.views.base import _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


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
                    "engagement_id": Engagement.objects.filter(requirement=requirement)
                    .values_list("id", flat=True)
                    .first(),
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
        request=AssistedProposalSerializer,
        description=(
            "Capture a quote a Partner gave over the phone, attributed to that Partner.\n\n"
            "Revision 4 makes this a **primary path** rather than a convenience: on the A3 "
            "fallback the vendors who answer fastest are often the ones who will not fill in a "
            "form. It is still not a way for staff to publish a price — the proposal is written "
            "with `vendor_confirmed_at` null, every Customer-facing read already filters on "
            "that, and the vendor's own confirmation is what makes it visible (`M2-AC-218`).\n\n"
            "**Consent is a refusal, not a checkbox**, exactly as on assisted clarification: "
            "without `consent_recorded` the capture does not happen. It is optional on the "
            "wire and defaults to `false`, so a client that does not send it is refused with "
            "`m2_requirement_transition_not_allowed` rather than having a consent it never "
            "collected written into the record. Until 1.33.0 this view passed `true` "
            "unconditionally and the documented refusal could not fire.\n\n"
            "The wage floor is derived and enforced here identically to a vendor's own "
            "submission."
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
        payload = AssistedProposalSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        invitation_id = data.pop("invitation_id")
        # Popped, not passed through. `submit_proposal` takes the quote's own fields and consent is
        # not one of them: it belongs to the *capture*, not to the price. Until 1.33.0 this line
        # was `consent_recorded=True` — the command's refusal, this endpoint's published
        # description and `M2-AC-802` all said consent was required, and none of them could fire.
        consent_recorded = bool(data.pop("consent_recorded", False))

        def command() -> tuple[int, dict[str, object]]:
            try:
                proposal = operations.capture_assisted_proposal(
                    invitation_id=invitation_id,
                    actor=actor,
                    payload=data,
                    consent_recorded=consent_recorded,
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
