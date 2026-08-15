"""Wave C4, continued: safety incidents and the cash-demand report.

The tail of the shift-day section, split out because it is what gets reported *about* a day
rather than what moves one. A safety report is never a cancellation reason and never moves money;
a cash-demand report is one tap and is never proof on its own.
"""

import uuid
from typing import cast

from django.shortcuts import get_object_or_404
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
from apps.requirements import workforce
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import SafetyIncident
from apps.requirements.selectors import engagement_for_participant
from apps.requirements.serializers import (
    CashDemandReportSerializer,
    CashDemandSerializer,
    SafetyIncidentDecisionSerializer,
    SafetyIncidentListSerializer,
    SafetyIncidentReportSerializer,
    SafetyIncidentSerializer,
)
from apps.requirements.views.base import _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


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
