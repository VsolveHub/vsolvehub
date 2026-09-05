"""Wave C6, continued: the Operations workspace itself.

What Operations looks at rather than what it does to one request — the crew-verification queue and
the writer that clears it, the eight stuck-state queues, the unit-economics readings per request
and across the book, the chargeback record and the open financial exceptions Finance is carrying.
"""

import uuid
from dataclasses import asdict
from typing import cast

from django.db.models import Count
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
from apps.partners import crew_documents
from apps.partners.exceptions import PartnerDomainError
from apps.partners.models import CrewDocument, PartnerCrewMembership
from apps.partners.permissions import IsOperationsUser
from apps.requirements import disputes, operations, reconciliation
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import OperationsTouch
from apps.requirements.serializers import (
    ChargebackSerializer,
    CrewDocumentDecisionSerializer,
    CrewDocumentReviewListSerializer,
    CrewDocumentReviewRowSerializer,
    CrewGenderCorrectionSerializer,
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
            ),
            OpenApiParameter(
                name="state",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=["PENDING", "VERIFIED", "ALL"],
                description=(
                    "`PENDING` (default) is the worklist. `VERIFIED` is how a reviewer reaches "
                    "somebody already cleared, which is the only way to un-verify a worker whose "
                    "document turned out to be expired — the command supported it and no screen "
                    "could get to it."
                ),
            ),
        ],
        description=(
            "Active crew memberships and where their document check stands, oldest first.\n\n"
            "This queue is why the A3 cascade can find anybody: `documents_verified_at` is what "
            "`verified_roster_size` counts when it sizes a lead's roster against the requested "
            "headcount, and a vendor with no verified crew is excluded from every crew offer.\n\n"
            "`documents_pending` and `documents_approved` are on each row so the queue can tell "
            "the two waiting states apart: a row with nothing uploaded is the Partner's move, and "
            "a row with a file on it is the reviewer's."
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
        state = (request.query_params.get("state") or "PENDING").upper()
        if state not in {"PENDING", "VERIFIED", "ALL"}:
            raise ValidationError(
                {"state": "Must be PENDING, VERIFIED or ALL."}, code="invalid_state"
            )
        memberships = operations.crew_memberships_awaiting_verification(
            partner_id=partner_id, state=state
        )
        counts = _document_counts([membership.id for membership in memberships])
        rows = [
            {
                "membership_id": membership.id,
                "partner_id": membership.partner_id,
                "partner_name": membership.partner.display_name,
                "crew_member_name": membership.roster_name,
                "is_supervisor": membership.is_supervisor,
                "added_at": membership.added_at,
                "documents_verified_at": membership.documents_verified_at,
                "gender": membership.crew_member.gender,
                "documents_pending": counts.get((membership.id, CrewDocument.Status.PENDING), 0),
                "documents_approved": counts.get((membership.id, CrewDocument.Status.APPROVED), 0),
            }
            for membership in memberships
        ]
        return Response(
            CrewVerificationQueueSerializer(
                {"memberships": rows, "server_now": timezone.now()}
            ).data
        )


def _verification_row(membership: PartnerCrewMembership) -> dict[str, object]:
    """One queue row, shared by the queue and by every command that returns one.

    Shared rather than repeated: the queue and the two writers all publish this shape, and three
    inline copies is how a field added to one of them goes missing from the other two.
    """
    counts = _document_counts([membership.id])
    return cast(
        dict[str, object],
        CrewMembershipVerificationRowSerializer(
            {
                "membership_id": membership.id,
                "partner_id": membership.partner_id,
                "partner_name": membership.partner.display_name,
                "crew_member_name": membership.roster_name,
                "is_supervisor": membership.is_supervisor,
                "added_at": membership.added_at,
                "documents_verified_at": membership.documents_verified_at,
                "gender": membership.crew_member.gender,
                "documents_pending": counts.get((membership.id, CrewDocument.Status.PENDING), 0),
                "documents_approved": counts.get((membership.id, CrewDocument.Status.APPROVED), 0),
            }
        ).data,
    )


def _document_counts(
    membership_ids: list[uuid.UUID],
) -> dict[tuple[uuid.UUID, str], int]:
    """Pending and approved document counts for a whole page of the queue, in one query.

    Aggregated rather than counted per row: this queue is read on a polling screen and two hundred
    memberships would otherwise be four hundred round trips to render two badges.
    """
    if not membership_ids:
        return {}
    return {
        (row["membership_id"], row["status"]): row["total"]
        for row in CrewDocument.objects.filter(
            membership_id__in=membership_ids,
            status__in=(CrewDocument.Status.PENDING, CrewDocument.Status.APPROVED),
        )
        .values("membership_id", "status")
        .annotate(total=Count("id"))
    }


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
            return status.HTTP_200_OK, _verification_row(membership)

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


class OperationsCrewGenderCorrectionView(APIView):
    """The arbiter `set_crew_gender`'s refusal message promised and nobody had built."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_crew_gender_correct",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewGenderCorrectionSerializer,
        description=(
            "Correct what one worker is recorded as, across every agency that has them.\n\n"
            "`CrewMember.gender` is one row per person, so the Partner-facing rule is "
            "first-write-wins: a second agency writing a contradiction is refused with "
            "`m2_crew_gender_conflict` rather than silently flipping which gendered slots the "
            "first agency can fill. That rule is right and it had **no exit** — the refusal said "
            '"contact support if that is wrong" and support had no endpoint, so a worker recorded '
            "wrongly by whichever agency typed first lost gendered work permanently.\n\n"
            "**A reason is required.** Unlike a first recording, this overwrites a value another "
            "agency is already being dispatched against, and the previous value is written to the "
            "audit event so a reopened dispute can see what was overwritten. Clearing is not "
            "offered: it would re-open every gendered slot the worker had been filling. "
            "`UNDISCLOSED` is the value for a worker who declined to say."
        ),
        responses={
            200: CrewMembershipVerificationRowSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, membership_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = CrewGenderCorrectionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                membership = operations.correct_crew_gender(
                    membership_id=membership_id,
                    actor=actor,
                    gender=data["gender"],
                    reason=data["reason"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, _verification_row(membership)

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.crew_gender_correct",
            key=key,
            request_payload={"membership_id": str(membership_id), "gender": data["gender"]},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsCrewDocumentListView(APIView):
    """The documents behind one worker's verification, with signed links to the files."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_crew_documents",
        description=(
            "Every live identity document on one crew membership, newest version of each kind, "
            "each with a short-lived signed link to the stored file.\n\n"
            "`review_url` is **nullable** and null is not an error: a storage outage degrades this "
            "to a queue with one missing preview rather than to an error page that hides the "
            "other nine people waiting. Nothing stores the URL — a stored URL is a stored expiry."
        ),
        responses={
            200: CrewDocumentReviewListSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, _request: Request, membership_id: uuid.UUID) -> Response:
        membership = (
            PartnerCrewMembership.objects.select_related("partner", "crew_member")
            .filter(pk=membership_id)
            .first()
        )
        if membership is None:
            raise NotFound("Crew member was not found.")
        documents = crew_documents.current_crew_documents(membership=membership)
        return Response(
            CrewDocumentReviewListSerializer(
                {
                    "membership_id": membership.id,
                    "crew_member_name": membership.roster_name,
                    "partner_name": membership.partner.display_name,
                    "documents_verified_at": membership.documents_verified_at,
                    "missing_required_kinds": (
                        crew_documents.missing_required_crew_document_kinds(membership=membership)
                    ),
                    "documents": [
                        {
                            "document_id": document.id,
                            "kind": document.kind,
                            "kind_label": CrewDocument.Kind(document.kind).label,
                            "status": document.status,
                            "version": document.version,
                            "content_type": document.content_type,
                            "size_bytes": document.size_bytes,
                            "uploaded_at": document.created_at,
                            "reviewed_at": document.reviewed_at,
                            "review_reason": document.review_reason,
                            "expires_on": document.expires_on,
                            "review_url": crew_documents.crew_document_review_url(
                                document=document
                            ),
                        }
                        for document in documents
                    ],
                    "server_now": timezone.now(),
                }
            ).data
        )


class OperationsCrewDocumentDecisionView(APIView):
    """Approve or reject one document — and, through that, the membership's verification."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Operations"],
        operation_id="m2_operations_crew_document_review",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewDocumentDecisionSerializer,
        description=(
            "Record a decision on one crew identity document.\n\n"
            "**Approving the last required kind verifies the membership**, through the same "
            "`verify_crew_documents` command with the same actor and audit event. The alternative "
            "— approve every document, then separately remember to press *verified* — has a "
            "failure mode where a fully-approved worker is still excluded from every crew offer, "
            "which is exactly the silent state this whole surface exists to end.\n\n"
            "**Rejecting a required kind withdraws verification**, carrying the rejection's own "
            "reason, because the Partner is about to lose a worker off jobs they may already be "
            "assigned to. A rejection therefore requires a reason and the model enforces it too."
        ),
        responses={
            200: CrewDocumentReviewRowSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, document_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = CrewDocumentDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                document = crew_documents.review_crew_document(
                    document_id=document_id,
                    actor=actor,
                    approved=data["approved"],
                    reason=data["reason"],
                )
            except PartnerDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object],
                CrewDocumentReviewRowSerializer(
                    {
                        "document_id": document.id,
                        "kind": document.kind,
                        "kind_label": CrewDocument.Kind(document.kind).label,
                        "status": document.status,
                        "version": document.version,
                        "content_type": document.content_type,
                        "size_bytes": document.size_bytes,
                        "uploaded_at": document.created_at,
                        "reviewed_at": document.reviewed_at,
                        "review_reason": document.review_reason,
                        "expires_on": document.expires_on,
                        # Deliberately absent from a decision response. The reviewer has just
                        # finished looking at the file; re-signing it here would mint a link
                        # nobody asked for and put it in a mutation's audit payload.
                        "review_url": None,
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.operations.crew_document_review",
            key=key,
            request_payload={"document_id": str(document_id), "approved": data["approved"]},
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
