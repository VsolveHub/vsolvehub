"""Wave C6 — cancellation, cases and the Operations workspace (`M2-BE-701..719`)

The split below is 07 §7's permission table expressed as routes. A **party** may call off their
own job, answer the other side, show evidence and appeal a decision about them. **Operations**
may see everything, rematch, extend, reclassify, capture with consent, verify crew documents,
work the queues and record a chargeback. There is no route that lets Operations accept an offer
for a vendor, publish a vendor's price without the vendor, or move money by hand — and the
absence of those three is deliberate rather than deferred.

This module is the first third of that section: calling the job off and answering it. The cases a
dispute opens are in `cases`; the Operations half is in `operations_requests` and
`operations_workspace`.
"""

import uuid
from typing import cast

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.requirements import cancellations
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import CustomerRequirement, Engagement, RequirementCancellation
from apps.requirements.serializers import (
    CancellationDecisionSerializer,
    CancellationRequestSerializer,
    RequirementCancellationSerializer,
)
from apps.requirements.views.base import _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


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
