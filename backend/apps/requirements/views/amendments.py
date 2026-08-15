"""Wave C3: scope amendments, through the M1 engine.

One change request per engagement: the vendor proposes, the Customer accepts or declines, and
money moves before scope does. `_amendment_payload` is re-used by the C4 shift-extra route, which
imports it from here.
"""

import uuid
from typing import Any, cast

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.requirements import amendments
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.selectors import (
    amendment_for_participant,
    engagement_amendments,
    engagement_for_participant,
)
from apps.requirements.serializers import (
    EngagementAmendmentCreateSerializer,
    EngagementAmendmentDecisionSerializer,
    EngagementAmendmentListSerializer,
    EngagementAmendmentSerializer,
)
from apps.requirements.views.base import _checkout_payload, _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


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
