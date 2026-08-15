"""Wave C6, continued: the Operations workspace itself.

What Operations looks at rather than what it does to one request — the crew-verification queue and
the writer that clears it, the eight stuck-state queues, the unit-economics readings per request
and across the book, the chargeback record and the open financial exceptions Finance is carrying.
"""

import uuid
from dataclasses import asdict
from typing import cast

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.models import PaymentAttempt
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsOperationsUser
from apps.requirements import disputes, operations, reconciliation
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import OperationsTouch
from apps.requirements.serializers import (
    ChargebackSerializer,
    CrewMembershipVerificationRowSerializer,
    CrewVerificationQueueSerializer,
    CrewVerificationSerializer,
    PartyCaseSerializer,
    ReconciliationSummarySerializer,
    StuckQueueListSerializer,
    TouchMetricSerializer,
    TouchRollupSerializer,
)
from apps.requirements.views.base import _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


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
