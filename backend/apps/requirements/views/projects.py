"""Wave C5 (`M2-BE-541..549`): the A5 project surface.

Eight paths, and the shape of the set is decided by who may act rather than by what a project
management tool would offer:

* the **read** is by participation — both parties look at the same plan;
* the **delay claim** is raised by the vendor and decided by the Customer, because it changes
  the Customer's dates;
* the **handover** is submitted by the vendor and accepted by the Customer, and the acceptance
  is what lets the project close;
* the **transfer** is proposed by Operations and decided by the **Customer**, because their
  remaining cost changes and §7 does not let Operations change somebody's agreement for them;
* the **early termination** is Operations alone, and decides no remedy — it returns money nobody
  earned, which is the absence of a remedy rather than one.

Nothing here moves money except through the two rails that already exist: `refund_stage_amount`
on the M1 refund lifecycle, and ordinary stage funding at the price the Customer accepted. There
is deliberately **no transfer checkout and no new payment purpose**.
"""

import uuid
from typing import cast

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.permissions import IsOperationsUser, IsPartnerUser
from apps.requirements import projects
from apps.requirements.exceptions import RequirementDomainError, RequirementNotFoundError
from apps.requirements.models import Engagement
from apps.requirements.selectors import engagement_for_participant, stage_for_partner
from apps.requirements.serializers import (
    DelayClaimCreateSerializer,
    DelayClaimDecisionSerializer,
    EngagementSerializer,
    HandoverSubmitSerializer,
    ProjectDelayClaimSerializer,
    ProjectPlanSerializer,
    ProjectTerminationSerializer,
    ProjectTransferDecisionSerializer,
    ProjectTransferProposeSerializer,
    ProjectTransferSerializer,
)
from apps.requirements.views.base import _idempotency_key, _partner_profile, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


def _project_engagement_for_participant(request: Request, engagement_id: uuid.UUID) -> Engagement:
    """One A5 engagement, if the caller is either party. `404` otherwise, never `403`."""
    try:
        engagement = engagement_for_participant(
            user=cast(User, request.user), engagement_id=engagement_id
        )
        projects.assert_project_engagement(engagement)
    except RequirementDomainError as exc:
        _raise_api_error(exc)
    return engagement


def _project_payload_response(engagement: Engagement) -> Response:
    payload = projects.project_payload(engagement)
    return Response(ProjectPlanSerializer({**payload, "server_now": timezone.now()}).data)


class EngagementProjectView(APIView):
    """The whole A5 project as one read (`M2-BE-541`, `549`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_read",
        description=(
            "One A5 project, whole: its milestones, its money, its warranty retention, its "
            "handover and whatever recovery is in flight. Both parties read the same payload.\n\n"
            "**Every milestone carries two readings** (`M2-BE-549`): the `original_*` fields are "
            "what was agreed when the estimate was selected, and the plain fields are what stands "
            "now. `schedule_shift_days` is the difference in days, computed server-side. A "
            "project screen that can only say what is due now is useless in the argument it "
            "exists for.\n\n"
            "Read `kind` before rendering a milestone. A `MATERIAL_ADVANCE` is money spent on "
            "goods rather than a milestone somebody performs, and a cancelled one carrying "
            "`cancellation_reason_code: material_advance_left_with_vendor` is **not** going to be "
            "refunded — showing it as a pending refund would promise something no command will "
            "ever do.\n\n"
            "`retention_withheld_paise` climbs as milestones are approved and reaches "
            "`retention_paise` at the last one; `warranty_ends_at` appears with it. Reads only — "
            "nothing here creates a row."
        ),
        responses={
            200: ProjectPlanSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` on an A3 engagement: a workforce "
                "booking has shift-days, not milestones.",
            ),
        },
    )
    def get(self, request: Request, engagement_id: uuid.UUID) -> Response:
        engagement = _project_engagement_for_participant(request, engagement_id)
        return _project_payload_response(engagement)


class EngagementStageDelayClaimView(APIView):
    """The vendor asks for days back on one milestone (`M2-BE-544`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_delay_claim_raise",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DelayClaimCreateSerializer,
        description=(
            "Claim that the Customer held this milestone up, and ask for a schedule extension.\n\n"
            "**No money moves and none can.** There is no amount on this request or on the record "
            "behind it. A delay that costs money is extra work, and extra work is a scope "
            "amendment the Customer accepts and pays for — `POST /engagements/{id}/amendments/`. "
            'One record that could do both would let "the site was locked" arrive as a bill.\n\n'
            "`evidence_ids` are rows already uploaded through this stage's ordinary evidence rail "
            "(`POST /engagement-stages/{id}/evidence/uploads/`), which now accepts uploads on a "
            "`PENDING` stage precisely so a claim about work that never started can carry a "
            "photograph. Ids that are not on this stage are refused.\n\n"
            "One live claim per milestone, held by a database constraint. The Customer has until "
            "`expires_at` to answer, and **silence expires the claim rather than granting it**."
        ),
        responses={
            201: ProjectDelayClaimSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when the milestone is finished or "
                "the engagement is A3; `m2_amendment_not_actionable` when a claim is already "
                "waiting; `m2_policy_unavailable` when the owner has set no response window.",
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
        payload = DelayClaimCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                claim = projects.raise_delay_claim(
                    stage_id=stage.id,
                    actor=actor,
                    reason_code=data["reason_code"],
                    description=data["description"],
                    extension_days=data["extension_days"],
                    evidence_ids=list(data["evidence_ids"]),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProjectDelayClaimSerializer(claim).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.delay_claim",
            key=key,
            request_payload={
                "stage_id": str(stage_id),
                "extension_days": data["extension_days"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class ProjectDelayClaimDecisionView(APIView):
    """The Customer answers a delay claim (`M2-BE-544`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_delay_claim_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DelayClaimDecisionSerializer,
        description=(
            "Accept or reject a delay claim. Customer only.\n\n"
            "**Accepting moves this milestone and every one after it** by `extension_days`, "
            "because a project is a sequence: a week lost on the first fix is a week lost on "
            "everything that follows. A milestone with no date is left without one rather than "
            "given one.\n\n"
            "Rejecting records the decision and changes nothing. Neither answer moves any money."
        ),
        responses={
            200: ProjectDelayClaimSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_not_actionable` when the claim is already decided or "
                "has expired.",
            ),
        },
    )
    def post(self, request: Request, delay_claim_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            claim = projects.delay_claim_for_participant(user=actor, delay_claim_id=delay_claim_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        if claim.engagement.customer_id != actor.id:
            # The vendor may read their own claim through the project read; only the Customer may
            # decide it, and a `404` rather than a `403` keeps the two answers indistinguishable.
            _raise_api_error(RequirementNotFoundError())
        payload = DelayClaimDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                decided = projects.decide_delay_claim(
                    delay_claim_id=claim.id,
                    actor=actor,
                    accept=bool(data["accept"]),
                    note=data["note"],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ProjectDelayClaimSerializer(decided).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.delay_claim_decide",
            key=key,
            request_payload={
                "delay_claim_id": str(delay_claim_id),
                "accept": bool(data["accept"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementHandoverView(APIView):
    """The vendor hands over the digital deliverables (`M2-BE-547`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_handover_submit",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=HandoverSubmitSerializer,
        description=(
            "Hand over the project's digital deliverables so Event and Media delivery does not "
            "happen off-platform.\n\n"
            "**Files are not uploaded here.** Upload through the ordinary stage evidence rail "
            "first (`POST /engagement-stages/{id}/evidence/uploads/`, then the finalize call) and "
            "send the resulting evidence id as `evidence_id`. A second uploader for deliverables "
            "would be a second bucket, a second orphan sweep and a second set of media-type "
            "rules.\n\n"
            "A `LINK` — `external_url`, https only — is **recorded rather than hosted**, which is "
            "said out loud because a Customer clicking it leaves this platform. What the row buys "
            "is that this Customer accepted that location at that moment.\n\n"
            "Submitting again before acceptance **appends**; it does not replace. The mechanism "
            "that keeps delivery honest is not this endpoint but the next one: while a handover "
            "is submitted and unaccepted, `m2_engagement_completion_accept` refuses."
        ),
        responses={
            200: EngagementSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when the project is not active or "
                "completing, the Customer has already accepted, or a named file is not attached "
                "to this project.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        engagement = _project_engagement_for_participant(request, engagement_id)
        if engagement.partner.user_id != actor.id:
            _raise_api_error(RequirementNotFoundError())
        payload = HandoverSubmitSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                updated = projects.submit_project_handover(
                    engagement_id=engagement.id,
                    actor=actor,
                    note=data["note"],
                    items=[
                        projects.DeliverableInput(
                            title=item["title"],
                            evidence_id=item["evidence_id"],
                            external_url=item["external_url"],
                            stage_id=item["stage_id"],
                        )
                        for item in data["items"]
                    ],
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(updated).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.handover_submit",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "items": len(data["items"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementHandoverAcceptanceView(APIView):
    """The Customer accepts the deliverables (`M2-BE-547`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_handover_accept",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Accept the handover. Customer only.\n\n"
            "Its own act rather than a side effect of closing the project, because the two can "
            "legitimately happen at different moments — a photographer delivers the gallery in "
            "week two of a four-week edit.\n\n"
            "**When the project is already `COMPLETING`, accepting the handover finishes it**: "
            "the response is the completed (or `WARRANTY`) engagement, and no second call to "
            "`m2_engagement_completion_accept` is needed. Read `status` from the response."
        ),
        responses={
            200: EngagementSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when nothing has been handed over "
                "yet, or when completion is blocked by an open stage.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        engagement = _project_engagement_for_participant(request, engagement_id)
        if engagement.customer_id != actor.id:
            _raise_api_error(RequirementNotFoundError())

        def command() -> tuple[int, dict[str, object]]:
            try:
                accepted = projects.accept_project_handover(
                    engagement_id=engagement.id, actor=actor
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(accepted).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.handover_accept",
            key=key,
            request_payload={"engagement_id": str(engagement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementProjectTransferView(APIView):
    """Operations proposes a replacement vendor for the remaining milestones (`M2-BE-545`)."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_transfer_propose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectTransferProposeSerializer,
        description=(
            "Propose moving every unfinished milestone to a replacement vendor at the "
            "replacement's own prices. Operations only, and **nothing moves until the Customer "
            "accepts** — their remaining cost changes, and §7 does not let Operations change "
            "somebody's agreement for them.\n\n"
            "**Priced per milestone, never as a lump.** Every unfinished milestone must appear in "
            "`quotes` exactly once and no others may, so the two numbers the Customer decides on "
            "are sums over the same list of work. Read the current list from "
            "`GET /engagements/{id}/project/`: it is every milestone whose `status` is `PENDING`, "
            "`IN_PROGRESS`, `AWAITING_REVIEW` or `CORRECTION_REQUESTED`, **excluding** a "
            "`MATERIAL_ADVANCE` that has been funded.\n\n"
            "**A disputed milestone blocks the whole transfer** (`m2_stage_disputed`). Decide it "
            "at `POST /engagement-stages/{id}/dispute/decision/` first: transferring around a "
            "dispute would close the objection by moving it out of the agreement.\n\n"
            "A funded material advance is neither transferred nor refunded. It is reported on the "
            "proposal as `material_advance_outstanding_paise` and left with the abandoning vendor "
            "— that money bought goods, and a background job is not the thing that decides where "
            "they went."
        ),
        responses={
            201: ProjectTransferSerializer,
            400: ApiErrorSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_capability_not_approved` or `m2_capability_suspended` when the "
                "replacement cannot serve this variant and area.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_disputed`, `m2_amendment_not_actionable` when a transfer "
                "is already waiting, or `m2_stage_transition_not_allowed` when the milestone "
                "list does not match.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = ProjectTransferProposeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                transfer = projects.propose_project_transfer(
                    engagement_id=engagement_id,
                    actor=actor,
                    to_partner_id=data["to_partner_id"],
                    quotes=[
                        projects.TransferQuote(
                            stage_id=quote["stage_id"],
                            amount_paise=quote["amount_paise"],
                        )
                        for quote in data["quotes"]
                    ],
                    reason_code=data["reason_code"],
                    note=data["note"],
                )
            except Engagement.DoesNotExist as exc:
                raise NotFound("That engagement does not exist.") from exc
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], ProjectTransferSerializer(transfer).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.transfer_propose",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "to_partner_id": str(data["to_partner_id"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class ProjectTransferDecisionView(APIView):
    """The Customer accepts or declines a proposed transfer (`M2-BE-545`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_transfer_decide",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectTransferDecisionSerializer,
        description=(
            "Accept or decline a proposed vendor transfer. Customer only.\n\n"
            "**Accepting settles the delta structurally, and there is no checkout here.** Every "
            "unfinished milestone refunds what was funded and unearned through the ordinary M1 "
            "refund lifecycle, drops back to `REQUIRED`, and is then repriced to the "
            "replacement's number; the engagement's `amendment_delta_paise` moves by exactly the "
            "difference. The money asked for afterwards is the ordinary stage funding that was "
            "always going to be asked for, at the price just accepted. That is what stops anybody "
            "paying twice.\n\n"
            "**The engagement returns to `PENDING_START` and `work_may_start_at` is cleared.** "
            "The replacement has nothing funded and no clearance; fund the first milestone at "
            "`POST /engagement-stages/{id}/funding/` exactly as at the start of the project.\n\n"
            "`refunded_paise` on the response is what actually went back. "
            "`material_advance_outstanding_paise` is what did not and will not — render it as an "
            "open question for support, never as a pending refund."
        ),
        responses={
            200: ProjectTransferSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_not_actionable` when the transfer is decided, expired "
                "or the unfinished work changed after it was priced; `m2_stage_disputed` when a "
                "milestone was disputed in between.",
            ),
        },
    )
    def post(self, request: Request, project_transfer_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            transfer = projects.transfer_for_customer(
                customer=actor, project_transfer_id=project_transfer_id
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = ProjectTransferDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                decided = projects.decide_project_transfer(
                    project_transfer_id=transfer.id,
                    actor=actor,
                    accept=bool(data["accept"]),
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ProjectTransferSerializer(decided).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.transfer_decide",
            key=key,
            request_payload={
                "project_transfer_id": str(project_transfer_id),
                "accept": bool(data["accept"]),
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementTerminationView(APIView):
    """Operations ends a project early, with work outstanding (`M2-BE-543`, `545`)."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["M2 - Projects"],
        operation_id="m2_project_terminate",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProjectTerminationSerializer,
        description=(
            "End an A5 project with milestones outstanding and no replacement. Operations only.\n\n"
            "**The two recovery rules that make `EngagementStage.kind` worth having** "
            "(`M2-BE-543`): a funded, unearned **work** milestone is refunded, because the "
            "platform is holding the Customer's money for work that is not going to happen; a "
            "funded **material advance** is **not** refunded and not clawed back, because the "
            "vendor spent it on goods. The advance is cancelled with "
            "`cancellation_reason_code: material_advance_left_with_vendor` and reaches Operations "
            "as an outstanding balance somebody resolves against the physical world.\n\n"
            "**This decides no remedy.** No penalty, no forfeit, no compensation. Who owes whom "
            "what when a project ends early is the cancellation policy engine in Wave C6 "
            "(`M2-BE-701`, `706`). Returning money nobody earned is the absence of a remedy "
            "rather than one.\n\n"
            "The engagement becomes `CANCELLED` and the requirement closes as `CLOSED_CANCELLED`. "
            "Cancelled milestones keep their amounts and their funding history — the agreement "
            "was that big and the money was collected, and shrinking the totals to make a "
            "cancelled project look tidy would erase what a dispute reads."
        ),
        responses={
            200: EngagementSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when the project is already closed "
                "or the engagement is A3.",
            ),
        },
    )
    def post(self, request: Request, engagement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        payload = ProjectTerminationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        def command() -> tuple[int, dict[str, object]]:
            try:
                ended = projects.terminate_project_early(
                    engagement_id=engagement_id,
                    actor=actor,
                    reason_code=data["reason_code"],
                    note=data["note"],
                )
            except Engagement.DoesNotExist as exc:
                raise NotFound("That engagement does not exist.") from exc
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], EngagementSerializer(ended).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.project.terminate",
            key=key,
            request_payload={
                "engagement_id": str(engagement_id),
                "reason_code": data["reason_code"],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)
