"""Wave C4 (`M2-BE-521..539`): the shift-day surface.

Nine paths, and none of them moves wage money. ADR-0009 is explicit that A3 wages are direct,
daily and peer-to-peer at day end; there is no checkout, no funding call and no payout release in
this section, and adding one would make the platform a party to a payment it has always said it
is not. The settlement path below records two taps against a published figure and returns a UPI
deep link into the Customer's own app — a convenience, not a rail.

The tail of the same section — safety incidents and the cash-demand report — is in `safety`.
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
from apps.partners.permissions import IsPartnerUser
from apps.requirements import crew_mix, workforce
from apps.requirements.exceptions import RequirementDomainError
from apps.requirements.models import EngagementStage
from apps.requirements.selectors import (
    shift_day_payload,
    stage_crew_rows,
    stage_for_customer,
    stage_for_participant,
    stage_for_partner,
)
from apps.requirements.serializers import (
    CrewAssignSerializer,
    DaySettlementSerializer,
    EngagementAmendmentSerializer,
    ShiftAttendanceRecordSerializer,
    ShiftAttendanceResponseSerializer,
    ShiftAttendanceSerializer,
    ShiftDaySerializer,
    ShiftExtraSerializer,
    StageCrewListSerializer,
)
from apps.requirements.views.amendments import _amendment_payload
from apps.requirements.views.base import _idempotency_key, _partner_profile, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER


def _shift_stage_for_participant(request: Request, stage_id: uuid.UUID) -> EngagementStage:
    """One shift-day, if the caller is either party. `404` otherwise, never `403`.

    Both sides operate the same day — the supervisor records the count, the Customer answers it —
    so the read is resolved by participation exactly as `stage_for_participant` is. A stranger
    gets `404` because the existence of a shift-day says a named crew is at a named Customer's
    site today.
    """
    try:
        return stage_for_participant(user=cast(User, request.user), stage_id=stage_id)
    except RequirementDomainError as exc:
        _raise_api_error(exc)


def _is_partner_side(request: Request, stage: EngagementStage) -> bool:
    return stage.engagement.partner.user_id == cast(User, request.user).id


class EngagementStageShiftView(APIView):
    """The whole shift-day as one read: the crew, the attendance and the settlement."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_day_read",
        description=(
            "One A3 shift-day, whole. Returns the day's crew at the disclosure the caller is "
            "entitled to, the supervisor's attendance record and the evening settlement.\n\n"
            "**The Customer never receives `crew_member_id`.** Crew identity is global — one "
            "person is one row however many agencies carry them — so `membership_id` is published "
            "to the Partner only and the global id to nobody. What a Customer gets is a name, four "
            "digits of phone and whether this platform has verified the person's documents.\n\n"
            "`attendance` and `settlement` are `null` until a command touches the day. That is a "
            "real state and not a missing one: nothing is created by reading."
        ),
        responses={
            200: ShiftDaySerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` on an A5 milestone: a project "
                "stage has no crew, no attendance and no daily settlement.",
            ),
        },
    )
    def get(self, request: Request, stage_id: uuid.UUID) -> Response:
        stage = _shift_stage_for_participant(request, stage_id)
        try:
            payload = shift_day_payload(
                stage=stage,
                include_membership_id=_is_partner_side(request, stage),
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return Response(ShiftDaySerializer({**payload, "server_now": timezone.now()}).data)


class EngagementStageCrewView(APIView):
    """Name the workers coming to one shift-day (`M2-BE-522`, `528`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_crew_assign",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewAssignSerializer,
        description=(
            "Assign crew to **one shift-day**, not to the engagement. Multi-day work rotates faces "
            "legitimately, and a roster hung off the engagement would either forbid that or record "
            "a lie about who was there.\n\n"
            "Send the **whole** intended crew every time. The server reconciles the day to it: "
            "names that are gone are released with `reason_code`, new names are assigned. A "
            "substitution is therefore one call rather than a delete-then-add a client can half "
            "perform, and re-sending the same set is a no-op.\n\n"
            "Four refusals, each a different failure: `m2_crew_roster_required` (the progressive "
            "gate, at the first assignment rather than at registration), `m2_crew_conflict` for an "
            "unverified worker, for a worker who is not on your roster or is marked unavailable, "
            "and — the cross-agency one — for the same **person** already promised on that date "
            "through any agency. The last is held by a database constraint as well as by this "
            "check, so two supervisors tapping at the same instant cannot both win."
        ),
        responses={
            200: StageCrewListSerializer,
            400: ApiErrorSerializer,
            403: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_crew_roster_required` — add a verified worker to your roster "
                "before assigning anybody to a shift.",
            ),
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_crew_conflict`, or `m2_stage_transition_not_allowed` when the "
                "shift-day has no date on it, is already settled, or is an A5 milestone.",
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
        payload = CrewAssignSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        membership_ids = list(payload.validated_data["membership_ids"])
        roles = {
            uuid.UUID(str(key)): str(value)
            for key, value in (payload.validated_data.get("roles") or {}).items()
        }
        reason_code = payload.validated_data["reason_code"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                assignments = workforce.assign_crew(
                    stage_id=stage.id,
                    actor=actor,
                    membership_ids=membership_ids,
                    roles=roles,
                    reason_code=reason_code,
                )
                attendance = workforce.ensure_attendance(stage=stage)
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            body = StageCrewListSerializer(
                {
                    "crew": stage_crew_rows(assignments, include_membership_id=True),
                    "role_fulfilment": [
                        {
                            "role_code": row.role_code,
                            "role_label": row.role_label,
                            "wanted_men": row.wanted_men,
                            "wanted_women": row.wanted_women,
                            "named_men": row.named_men,
                            "named_women": row.named_women,
                            "is_met": row.is_met,
                            "gap": row.describe_gap(),
                        }
                        for row in crew_mix.role_fulfilment(
                            stage.engagement.requirement,
                            [(a.role_code, a.crew_member.gender) for a in assignments],
                        )
                    ],
                    "expected_count": attendance.expected_count,
                    "shift_date": stage.scheduled_on,
                    "server_now": timezone.now(),
                }
            ).data
            return status.HTTP_200_OK, cast(dict[str, object], body)

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.crew_assign",
            key=key,
            request_payload={
                "stage_id": str(stage_id),
                "membership_ids": [str(value) for value in membership_ids],
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageArrivalView(APIView):
    """The crew is on site (`M2-BE-524`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_arrival_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Confirm the crew arrived for this shift-day. **Non-OTP, and that is the default path "
            "in M2** rather than a degraded one — the start OTP is M3. Either party may record it: "
            "both were at the site.\n\n"
            "Three things happen in one transaction, because a half-started day is a support "
            "ticket: the arrival is stamped, the stage starts on the shared spine, and **on day "
            "one the booking fee is earned**. Crew must be named first — confirming that people "
            "arrived before saying who they are records nothing anybody can act on."
        ),
        responses={
            200: ShiftAttendanceSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` when no crew is assigned yet, the "
                "engagement is closed, or the stage is an A5 milestone.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        stage = _shift_stage_for_participant(request, stage_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                attendance = workforce.confirm_shift_arrival(stage_id=stage.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ShiftAttendanceSerializer(attendance).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.arrival",
            key=key,
            request_payload={"stage_id": str(stage_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageAttendanceView(APIView):
    """The supervisor's one action for the day (`M2-BE-525`, `527`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_attendance_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ShiftAttendanceRecordSerializer,
        description=(
            "Record **n of m present** for this shift-day. One tap, from the supervisor.\n\n"
            "There is deliberately **no per-worker check-in or check-out**: the workers mostly do "
            "not carry smartphones, the supervisor does, and a per-worker attendance product would "
            "be a device dependency this market cannot meet wearing the clothes of rigour. "
            "Per-worker detail is captured in exactly one place — a Customer dispute.\n\n"
            "The count *is* the evidence, so this hands the stage to the Customer through the "
            "ordinary spine and starts the same review clock every other stage runs on.\n\n"
            "`shift_ended_at` is optional and its absence is the point: a **missing check-out** "
            "settles at the agreed shift length and is flagged for review, not disputed. A "
            "supervisor whose crew left at six and who closed the day at nine has done nothing "
            "wrong, and the amount never depended on the end time — only overtime does, and that "
            "needs the Customer's approval either way."
        ),
        responses={
            200: ShiftAttendanceSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` before arrival is confirmed, after "
                "the Customer has already answered, or for a count above the booked crew — an "
                "extra worker is a scope amendment at the published rate, not a bigger number in "
                "an attendance box.",
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
        payload = ShiftAttendanceRecordSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        present_count = payload.validated_data["present_count"]
        shift_ended_at = payload.validated_data["shift_ended_at"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                attendance = workforce.confirm_attendance(
                    stage_id=stage.id,
                    actor=actor,
                    present_count=present_count,
                    shift_ended_at=shift_ended_at,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ShiftAttendanceSerializer(attendance).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.attendance",
            key=key,
            request_payload={"stage_id": str(stage_id), "present_count": present_count},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageAttendanceResponseView(APIView):
    """The Customer's one tap on a recorded day (`M2-BE-525`, `526`, `537`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_attendance_respond",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ShiftAttendanceResponseSerializer,
        description=(
            "Confirm the supervisor's count or dispute it.\n\n"
            "**Confirm** approves the shift-day on the shared spine, which for a workforce "
            "engagement also releases it — there is no payout to hold because Vsolve collected "
            "nothing. On a shortfall `shortfall_choice` is **required**: continue short, ask for "
            "an extra day, or cancel the missing workers free. The day settles at the present "
            "workers' published rate whichever you choose — that is `M2-BE-537`, settlement per "
            "worker-day present and never per job — and the choice decides what happens to the "
            "missing worker-days rather than to the money for the ones who came.\n\n"
            "`ADD_DAY` records a request, and only that. The extra day is the lead's to offer "
            "through the amendment engine; appending a shift-day to somebody's week without their "
            "agreement would be the platform committing a vendor's labour.\n\n"
            "**Dispute** is the only place per-worker detail is ever captured. It stops the review "
            "clock and opens the Operations path; the settlement stays unconfirmed, because a "
            "count nobody agrees on is not an amount either. Nothing derives a third number from "
            "`worker_details` — it is the Customer's objection, and a case decides between them."
        ),
        responses={
            200: ShiftAttendanceSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` before the supervisor has recorded "
                "the day, or when a shortfall was left without a choice.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            stage = stage_for_customer(customer=actor, stage_id=stage_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        payload = ShiftAttendanceResponseSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        response_value = payload.validated_data["response"]
        shortfall_choice = payload.validated_data["shortfall_choice"]
        worker_details = list(payload.validated_data["worker_details"])
        note = payload.validated_data["note"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                attendance = workforce.respond_attendance(
                    stage_id=stage.id,
                    actor=actor,
                    response=response_value,
                    shortfall_choice=shortfall_choice,
                    worker_details=worker_details,
                    note=note,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(
                dict[str, object], ShiftAttendanceSerializer(attendance).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.attendance_response",
            key=key,
            request_payload={"stage_id": str(stage_id), "response": response_value},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageSettlementView(APIView):
    """The evening "Day settled?" tap (`M2-BE-536`)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_day_settled_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Record that this day was settled. Either party taps; the server records **who**, and "
            "nothing else.\n\n"
            "**No money moves here and none can.** A3 wages are direct, daily and peer-to-peer at "
            "day end — the platform never holds them. `amount_paise` is the exact published figure "
            "for the day (present workers at the day rate, plus any extras both sides accepted "
            "through the amendment engine) and `upi_payment_link` is a deep link into the "
            "Customer's own UPI app at that amount. A convenience, not a rail; `null` when the "
            "lead has published no VPA, which is an ordinary state.\n\n"
            "**A one-sided claim is left standing as `SUPERVISOR_CLAIMED` or `CUSTOMER_CLAIMED`.** "
            "That is what Operations reads as *unproven* — one person says they settled and the "
            'other has not answered, which is a different sentence from either "they were paid" '
            'or "they were not". Only both taps make `SETTLED`, and the amount freezes there.'
        ),
        responses={
            200: DaySettlementSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_stage_transition_not_allowed` before the day has been recorded — "
                "there is no amount to settle until somebody says who was there.",
            ),
        },
    )
    def post(self, request: Request, stage_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        stage = _shift_stage_for_participant(request, stage_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                settlement = workforce.confirm_day_settled(stage_id=stage.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            # The UPI link is computed by `DaySettlementSerializer` itself since 1.31.0. It used
            # to be injected here, which meant it existed in this one response and nowhere else —
            # absent before the tap and gone after a reload, because the shift-day read declared
            # the field and nothing populated it. Injecting it here as well would put the value
            # back in two places and invite them to disagree.
            return status.HTTP_200_OK, cast(
                dict[str, object], DaySettlementSerializer(settlement).data
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.day_settled",
            key=key,
            request_payload={"stage_id": str(stage_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class EngagementStageExtraView(APIView):
    """Overtime and published add-ons, through the amendment engine (`M2-BE-531`, `538`)."""

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=["M2 - Shift days"],
        operation_id="m2_shift_extra_propose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ShiftExtraSerializer,
        description=(
            "Ask the Customer to approve overtime or an add-on **at the card's published rate**. "
            "This is a caller into the one amendment engine this codebase has, not a second one: "
            "the status machine, the expiry and the acceptance are the M1 engine's, and what this "
            "adds is the *price*, read from the card frozen on the engagement at booking.\n\n"
            "**There is no amount field.** The vendor names what and how much of it; the server "
            "names the money. A vendor who could type a number could re-price a job the Customer "
            "booked at a published rate, which is exactly the on-site renegotiation the rate card "
            "exists to leave nowhere to live.\n\n"
            "**Unapproved overtime is unpaid.** Overtime proposed while the shift is still running "
            "needs no window. Overtime for a shift that has already ended must be approved inside "
            "the configured retroactive window, and the amendment's deadline is shortened to it — "
            "past the window the request is refused outright, and while the owner has not set the "
            "window a retroactive request is refused with `m2_policy_unavailable` rather than "
            "granted on a guess.\n\n"
            "An add-on code that is not on the frozen card has no published price and is refused."
        ),
        responses={
            201: EngagementAmendmentSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_amendment_required` when this booking publishes no overtime or "
                "add-on rate, or the retroactive window has closed; `m2_policy_unavailable` when "
                "the owner has set no window; `m2_stage_transition_not_allowed` otherwise.",
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
        payload = ShiftExtraSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        extra = workforce.ShiftExtra(
            kind=payload.validated_data["kind"],
            hours=payload.validated_data["hours"],
            add_on_code=payload.validated_data["add_on_code"],
            worker_days=payload.validated_data["worker_days"],
        )
        reason = payload.validated_data["reason"]

        def command() -> tuple[int, dict[str, object]]:
            try:
                amendment = workforce.propose_shift_extra(
                    stage_id=stage.id,
                    actor=actor,
                    extra=extra,
                    reason=reason,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                EngagementAmendmentSerializer(_amendment_payload(amendment)).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="m2.shift.extra",
            key=key,
            request_payload={
                "stage_id": str(stage_id),
                "kind": extra.kind,
                "hours": extra.hours,
                "add_on_code": extra.add_on_code,
                "worker_days": extra.worker_days,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)
