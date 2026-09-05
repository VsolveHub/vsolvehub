"""Customer: requirement capture — attachments and two-way clarification.

The second half of the capture section. Presigned attachment uploads and their finalization, the
Customer's question about one quote, and the two mirrored answer routes: the Customer answers a
vendor's question, the vendor answers the Customer's.
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
from apps.partners.permissions import IsPartnerUser
from apps.requirements import attachments, proposals
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import RequirementAttachment, RequirementQuestion
from apps.requirements.selectors import question_asker_role, requirement_for_customer
from apps.requirements.serializers import (
    AttachmentFinalizeSerializer,
    AttachmentUploadGrantSerializer,
    AttachmentUploadRequestSerializer,
    QuestionAnswerSerializer,
    QuestionCreateSerializer,
    RequirementAttachmentSerializer,
    RequirementQuestionListSerializer,
    RequirementQuestionSerializer,
)
from apps.requirements.views.base import (
    _idempotency_key,
    _partner_profile,
    _proposal_for_customer,
    _raise_api_error,
)
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


class RequirementQuoteQuestionView(ThrottledWriteMixin, APIView):
    """The Customer's half of clarification (`M2-FE-409`)."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_clarification"

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


class RequirementAttachmentCollectionView(ThrottledWriteMixin, APIView):
    """Presign an attachment upload. Bytes go straight to storage, never through Django."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_attachment_upload"

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


class RequirementAttachmentFinalizeView(ThrottledWriteMixin, APIView):
    """Turn a completed upload into an attachment, after verifying what actually arrived."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_attachment_upload"

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


class RequirementAttachmentDetailView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_attachment_upload"

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


class RequirementQuestionListView(APIView):
    """Every question on one request, so the Customer can answer the ones waiting on them."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Requirements"],
        operation_id="m2_requirement_question_list",
        description=(
            "Every clarification question on this request, both directions, oldest first. A "
            "professional's question arrives before any estimate — often before the visit — so "
            "this is readable at every status and is not gated on the paywall. The vendor's "
            "identity is not on a question; `invitation` links it to the estimate it belongs to "
            "once one exists."
        ),
        responses={200: RequirementQuestionListSerializer, 404: ApiErrorSerializer},
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user), requirement_id=requirement_id
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        questions = (
            RequirementQuestion.objects.filter(requirement=requirement)
            .select_related("requirement", "invitation__partner")
            .order_by("asked_at", "id")
        )
        return Response(
            RequirementQuestionListSerializer(
                {"questions": list(questions), "server_now": timezone.now()}
            ).data
        )


class RequirementQuestionAnswerView(ThrottledWriteMixin, APIView):
    """The Customer answers a vendor's question."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_clarification"

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


class PartnerQuestionAnswerView(ThrottledWriteMixin, APIView):
    """The vendor answers a Customer's question.

    The mirror of `RequirementQuestionAnswerView`, and it exists because the Customer-asks command
    would otherwise create a question nobody could answer — which is not clarification, it is a
    suggestion box.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "m2_clarification"

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
