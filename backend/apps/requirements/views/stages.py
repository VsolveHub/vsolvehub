"""Wave C3: the engagement stage spine.

One set of routes for both archetypes, because there is one spine. The only thing that varies
with the archetype is what the commands underneath refuse — an A5 stage cannot start unfunded,
an A3 stage releases with no ledger entry — and none of that is a routing decision.

Authorization is by participation everywhere a record is shared, and by role where a command
belongs to one side: the vendor starts and submits, the Customer approves, corrects and
disputes, Operations decides a dispute. A foreign caller gets `404` rather than `403`, because
the existence of a stage says a named vendor is doing named work at a named address.
"""

import uuid
from collections.abc import Callable
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
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.partners.selectors import partner_profile_for_user
from apps.requirements import stages
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import EngagementStage
from apps.requirements.selectors import (
    customer_engagements,
    engagement_events,
    engagement_for_participant,
    partner_engagements,
    stage_for_customer,
    stage_for_participant,
    stage_for_partner,
)
from apps.requirements.serializers import (
    EngagementEventListSerializer,
    EngagementPageSerializer,
    EngagementSerializer,
    EngagementStageSerializer,
    StageCorrectionSerializer,
    StageDisputeDecisionSerializer,
    StageDisputeSerializer,
    StageEvidenceFinalizeSerializer,
    StageEvidenceSerializer,
    StageEvidenceSubmitSerializer,
    StageEvidenceUploadGrantSerializer,
    StageEvidenceUploadRequestSerializer,
)
from apps.requirements.views.base import (
    EngagementCursorPagination,
    _idempotency_key,
    _partner_profile,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import BoundedCursorQuerySerializer, reject_invalid_cursor_query
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


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


class EngagementStageEvidenceUploadView(ThrottledWriteMixin, APIView):
    """Presign one evidence file. Bytes never pass through Django."""

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_attachment_upload"

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
