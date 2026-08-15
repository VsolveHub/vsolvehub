"""Wave C6, continued: cases, as one of the two parties may read and answer them.

The party view of every case on a request, the warranty claim that calls on held retention, the
evidence a party attaches to a case they are in, and the one appeal each case allows. Deliberately
narrower than the Operations projection next door.
"""

import uuid
from typing import cast

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.requirements import disputes, selectors
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.serializers import (
    CaseAppealRequestSerializer,
    CaseEvidenceRecordSerializer,
    CaseEvidenceSerializer,
    PartyCaseListSerializer,
    PartyCaseSerializer,
    WarrantyClaimSerializer,
)
from apps.requirements.views.base import _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


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
