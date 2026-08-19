"""Wave C2R / revision 4 (ADR-0009): the rate-card A3 front door.

Thin, like everything else in this file. The one thing worth noticing is that the read below
publishes *unavailability as a state on a `200`*, not as an error. An A3 Customer whose city has
no published card can still submit their request — it simply collects quotes — so refusing the
whole screen because instant booking is not offered here would hide a path that works. The
**commands** still fail closed, with the published code, because a command that guessed would
book a crew at a price nobody approved.
"""

import uuid
from collections.abc import Callable
from typing import cast

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.exceptions import PartnerDomainError
from apps.partners.selectors import partner_profile_for_user
from apps.requirements import booking_fees, crew_dispatch
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RateCardUnavailableError,
    RequirementDomainError,
    RequirementNotFoundError,
)
from apps.requirements.models import CustomerRequirement, RateCardBooking
from apps.requirements.selectors import requirement_for_customer
from apps.requirements.serializers import (
    AccessCheckoutSerializer,
    BookingFeeSerializer,
    CrewNoShowSerializer,
    RateCardBookingSerializer,
    RateCardBookSerializer,
    RateCardStateSerializer,
)
from apps.requirements.views.base import _checkout_payload, _idempotency_key, _raise_api_error
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER
from common.throttling import ThrottledWriteMixin


def _requested_size(request: Request) -> tuple[int | None, int | None]:
    """The size the booking screen is asking about, or `(None, None)` for the saved draft.

    Both or neither. A headcount without days is not a job, and pairing one supplied number with
    one stored one would price something the Customer never described — so a request carrying only
    half of a size is answered as though it carried none.

    A value that is not a positive integer is discarded rather than refused. This is a *preview*
    on a read: the screen it feeds recovers by showing the saved draft's price, where a `400` would
    blank a rail over a stray character in a query string. The write path validates for real.
    """

    def _positive_int(name: str) -> int | None:
        raw = request.query_params.get(name)
        if raw is None:
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None

    headcount = _positive_int("headcount")
    days = _positive_int("days")
    if headcount is None or days is None:
        return None, None
    return headcount, days


def _rate_card_preview_payload(
    requirement: CustomerRequirement,
    *,
    headcount: int | None = None,
    days: int | None = None,
) -> dict[str, object]:
    """The published rate, or an honest reason there is none.

    Catches exactly the two fail-closed refusals and no others. A `m2_rate_card_unavailable` or a
    `m2_policy_unavailable` here means "we do not offer instant booking for this request"; anything
    else is a genuine failure and must not be flattened into a screen that says the same thing.
    """
    try:
        preview = crew_dispatch.preview_published_rate(requirement, headcount=headcount, days=days)
    except (RateCardUnavailableError, PolicyUnavailableError) as exc:
        return {
            "is_available": False,
            "rate_card_id": None,
            "headcount": None,
            "days": None,
            "day_rate_paise": None,
            "total_customer_paise": None,
            "lead_receipt_paise": None,
            "lead_day_receipt_paise": None,
            "booking_fee_paise": None,
            "standard_day_hours": None,
            "overtime_hourly_paise": None,
            "add_on_rates": None,
            "inclusions": None,
            "unavailable_code": exc.code,
            "unavailable_reason": exc.message,
            "server_now": timezone.now(),
        }
    except RequirementDomainError as exc:
        # A preset with no headcount or no days is the Customer's own unfinished draft, not an
        # unpriced city. Reported with its own code so the screen can say "tell us how many
        # people" rather than "we do not cover this area".
        return {
            "is_available": False,
            "rate_card_id": None,
            "headcount": None,
            "days": None,
            "day_rate_paise": None,
            "total_customer_paise": None,
            "lead_receipt_paise": None,
            "lead_day_receipt_paise": None,
            "booking_fee_paise": None,
            "standard_day_hours": None,
            "overtime_hourly_paise": None,
            "add_on_rates": None,
            "inclusions": None,
            "unavailable_code": exc.code,
            "unavailable_reason": exc.message,
            "server_now": timezone.now(),
        }
    return {
        "is_available": True,
        "rate_card_id": preview.card.id,
        "headcount": preview.quote.headcount,
        "days": preview.quote.days,
        "day_rate_paise": preview.quote.day_rate_paise,
        "total_customer_paise": preview.quote.total_customer_paise,
        "lead_receipt_paise": preview.quote.lead_receipt_paise,
        "lead_day_receipt_paise": preview.quote.lead_day_receipt_paise,
        "booking_fee_paise": preview.quote.booking_fee_paise,
        "standard_day_hours": preview.standard_day_hours,
        "overtime_hourly_paise": preview.overtime_hourly_paise,
        "add_on_rates": preview.add_on_rates,
        "inclusions": preview.inclusions,
        "unavailable_code": None,
        "unavailable_reason": None,
        "server_now": timezone.now(),
    }


def _rate_card_state_payload(
    requirement: CustomerRequirement,
    *,
    headcount: int | None = None,
    days: int | None = None,
) -> dict[str, object]:
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    fee = booking_fees.latest_booking_fee(requirement)
    holder = booking_fees.crew_offer_holder(requirement)
    # Identity is released by the confirmation, never by the hold. A Customer watching a held
    # booking sees that *a* crew took it; they learn who once the fee is verified.
    confirmed = (
        holder
        if booking is not None and booking.status == RateCardBooking.Status.CONFIRMED
        else None
    )
    # Resolved through the reverse one-to-one rather than assumed from the booking status: an
    # engagement exists only once a verified fee created one, and reading it is how this stays
    # true rather than inferred.
    engagement = getattr(requirement, "engagement", None)
    return {
        # The size only ever reaches the **preview**. Everything below it is a record of what
        # actually happened, and a booking must not re-describe itself at whatever size a query
        # string asked about.
        "preview": _rate_card_preview_payload(requirement, headcount=headcount, days=days),
        "booking": booking,
        "booking_fee": fee,
        "cascade": None if booking is None else crew_dispatch.cascade_progress(booking),
        "checkout_available": booking_fees.booking_fee_checkout_availability(requirement),
        "confirmed_partner_id": confirmed.partner_id if confirmed is not None else None,
        "confirmed_partner_name": (
            confirmed.partner.display_name if confirmed is not None else None
        ),
        "engagement_id": engagement.id if engagement is not None else None,
        "server_now": timezone.now(),
    }


class RequirementRateCardView(APIView):
    """The A3 instant path as one read: the price before, the crew and the fee after."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_read",
        description=(
            "The published day rate for this request and everything that has happened to it "
            "since. **`preview.is_available: false` is not an error** — it means this city and "
            "skill have no published card, or instant dispatch is not configured for this "
            "service, and the request will collect quotes instead. `unavailable_code` says "
            "which.\n\n"
            "The money split published here is the Customer's: `total_customer_paise` divides "
            "into `lead_receipt_paise`, **paid directly to the crew at day end and never held by "
            "Vsolve**, and `booking_fee_paise`, the one online charge. The lead's own wage and "
            "supervision split is deliberately absent.\n\n"
            "`headcount` and `days` price a size the draft has not been saved at, so the booking "
            "screen can put the price beside the form and keep it correct while the Customer "
            "changes their mind. They affect `preview` **only** — never `booking`, which is a "
            "record of what happened — and they book nothing: `m2_rate_card_book` still prices "
            "the stored draft, so a size previewed here and never saved cannot become a "
            "purchase. Supply both or neither; anything else is ignored and the saved preset "
            "answers."
        ),
        parameters=[
            OpenApiParameter(
                name="headcount",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description=(
                    "How many workers to price, instead of the saved draft's answer. Ignored "
                    "unless `days` is supplied too."
                ),
            ),
            OpenApiParameter(
                name="days",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description=(
                    "How many days to price, instead of the saved draft's answer. Ignored unless "
                    "`headcount` is supplied too."
                ),
            ),
        ],
        responses={
            200: RateCardStateSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request, requirement_id: uuid.UUID) -> Response:
        try:
            requirement = requirement_for_customer(
                customer=cast(User, request.user), requirement_id=requirement_id
            )
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        headcount, days = _requested_size(request)
        return Response(
            RateCardStateSerializer(
                _rate_card_state_payload(requirement, headcount=headcount, days=days)
            ).data
        )


class RequirementRateCardBookView(ThrottledWriteMixin, APIView):
    """Submit an A3 preset at the published rate and start the crew cascade, in one step."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_money"

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_book",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RateCardBookSerializer,
        description=(
            "Book a crew at the published day rate. The rate and its inclusion list are shown by "
            "`m2_rate_card_read` **before** this runs and are frozen onto the booking here, so a "
            "rate loaded between the screen and the tap cannot become what the Customer agreed "
            "to.\n\n"
            "**Nothing is charged by this call.** It submits the requirement and sends the first "
            "wave of crew offers on the M1 dispatch clock — minutes, not business hours. The "
            "booking fee is charged only once a lead has accepted, through "
            "`m2_booking_fee_checkout_create`."
        ),
        responses={
            201: RateCardStateSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_rate_card_unavailable` when no card is published for this city "
                "and skill — the Customer is routed to the quote flow, which is the honest "
                "degradation rather than a guessed price. `m2_policy_unavailable` when instant "
                "dispatch is not configured for this service. `m2_requirement_duplicate` unless "
                "`allow_duplicate` is set.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        serializer = RateCardBookSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allow_duplicate = bool(serializer.validated_data["allow_duplicate"])
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                result = crew_dispatch.book_at_published_rate(
                    requirement_id=requirement.id,
                    actor=customer,
                    allow_duplicate=allow_duplicate,
                )
            except (RequirementDomainError, PartnerDomainError) as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object],
                RateCardStateSerializer(_rate_card_state_payload(result.requirement)).data,
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.rate_card.book",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "allow_duplicate": allow_duplicate,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementBookingFeeCheckoutView(ThrottledWriteMixin, APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_money"

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_booking_fee_checkout_create",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Pay the booking fee against a lead who is holding this job right now. The hold is "
            "checked under the booking's own row lock in the same transaction that creates the "
            "attempt, so paying for a crew nobody is holding is unreachable rather than merely "
            "unlikely.\n\n"
            "**The crew is not confirmed by this response.** Only a verified provider callback "
            "moves the fee to `ACTIVE`, and that same callback creates the engagement; until it "
            "lands the fee reads `PENDING` and `m2_booking_fee_payment_pending` is the refusal "
            "anything gated on confirmation returns. If the Customer never pays, the hold lapses "
            "harmlessly and the next offer or wave proceeds."
        ),
        responses={
            201: AccessCheckoutSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_booking_fee_not_chargeable` when no lead is holding the job, "
                "when the hold has expired, or when the fee is already settled; "
                "`m2_lifecycle_not_supported` on a request that is on the quote flow.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                _fee, attempt = booking_fees.create_booking_fee_checkout(
                    requirement_id=requirement.id,
                    actor=customer,
                    idempotency_key=key,
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_201_CREATED, cast(
                dict[str, object], AccessCheckoutSerializer(_checkout_payload(attempt)).data
            )

        result = execute_idempotent(
            actor=customer,
            operation="m2.booking_fee.checkout",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementBookingFeeCancelView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_booking_fee_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Cancel a booked crew. **The free-cancellation window decides the money**, server-side "
            "and never from the client: at or beyond T hours before the requested start the "
            "booking fee refunds in full; inside T it forfeits and splits, because the lead has "
            "already turned other work down for that day.\n\n"
            "T is an open owner decision and is read fail-closed: while it is unset this refuses "
            "with `m2_policy_unavailable` rather than guessing which way a real Customer's money "
            "should go."
        ),
        responses={
            200: BookingFeeSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_policy_unavailable` while the free-cancellation window is unset; "
                "`m2_booking_fee_not_chargeable` when there is no fee on this request; "
                "`m2_requirement_transition_not_allowed` once the fee is settled.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        customer = cast(User, request.user)
        key = _idempotency_key(request)
        try:
            requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
        except RequirementDomainError as exc:
            _raise_api_error(exc)

        def command() -> tuple[int, dict[str, object]]:
            try:
                fee = booking_fees.cancel_booking(requirement_id=requirement.id, actor=customer)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], BookingFeeSerializer(fee).data)

        result = execute_idempotent(
            actor=customer,
            operation="m2.booking_fee.cancel",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


def _rate_card_participant(request: Request, requirement_id: uuid.UUID) -> CustomerRequirement:
    """The requirement, resolved by **participation** — either the Customer or the booked lead.

    Day-one arrival and a no-show are facts about what happened at a site, and both parties were
    there. Resolving by participation rather than by role is the same choice
    `site_visit_for_participant` made, and it answers `404` to anybody else because existence is
    private.
    """
    user = cast(User, request.user)
    requirement = CustomerRequirement.objects.filter(pk=requirement_id).first()
    if requirement is None:
        _raise_api_error(RequirementNotFoundError())
    if requirement.customer_id == user.id:
        return requirement
    profile = partner_profile_for_user(user)
    booking = RateCardBooking.objects.filter(requirement=requirement).first()
    if (
        profile is not None
        and booking is not None
        and booking.accepted_invitation is not None
        and booking.accepted_invitation.partner_id == profile.id
    ):
        return requirement
    _raise_api_error(RequirementNotFoundError())


class RequirementCrewArrivalView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_arrival_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Confirm the crew arrived on day one, which is the moment the booking fee is earned. "
            "Either party may record it. **Non-OTP** — the start OTP is deferred to M3, so this "
            "is the default path in M2 rather than a degraded one.\n\n"
            "Nothing is paid out here: the fee is Vsolve's revenue once the crew arrived, and the "
            "wages are peer-to-peer and settle at day end."
        ),
        responses={
            200: BookingFeeSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: ApiErrorSerializer,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        requirement = _rate_card_participant(request, requirement_id)

        def command() -> tuple[int, dict[str, object]]:
            try:
                fee = booking_fees.earn_booking_fee(requirement_id=requirement.id, actor=actor)
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], BookingFeeSerializer(fee).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.crew.arrival",
            key=key,
            request_payload={"requirement_id": str(requirement_id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RequirementCrewNoShowView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_crew_no_show_report",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=CrewNoShowSerializer,
        description=(
            "Report that day one did not happen. **`party` decides the money and the reason code "
            "cannot move it.**\n\n"
            "`VENDOR`: the booking fee refunds in full, no travel compensation is paid — neither "
            "party earns from an undelivered crew — the request returns to matching for a **free "
            "re-dispatch**, and the vendor's standing carries the record.\n\n"
            "`CUSTOMER`: the fee forfeits and splits. A configured share pays the lead as travel "
            "compensation through the payout rails, and the remainder is the platform share; the "
            "two reconcile to the fee in integer paise."
        ),
        responses={
            200: BookingFeeSerializer,
            400: ApiErrorSerializer,
            404: ApiErrorSerializer,
            409: OpenApiResponse(
                response=ApiErrorSerializer,
                description="`m2_policy_unavailable` while the forfeit split is unset — the fee "
                "stays `ACTIVE` and visible rather than being split on an invented ratio.",
            ),
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        actor = cast(User, request.user)
        key = _idempotency_key(request)
        requirement = _rate_card_participant(request, requirement_id)
        serializer = CrewNoShowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        party = str(serializer.validated_data["party"])
        reason_code = str(serializer.validated_data["reason_code"])

        def command() -> tuple[int, dict[str, object]]:
            try:
                fee = booking_fees.report_crew_no_show(
                    requirement_id=requirement.id, party=party, reason_code=reason_code
                )
            except RequirementDomainError as exc:
                _raise_api_error(exc)
            return status.HTTP_200_OK, cast(dict[str, object], BookingFeeSerializer(fee).data)

        result = execute_idempotent(
            actor=actor,
            operation="m2.crew.no_show",
            key=key,
            request_payload={
                "requirement_id": str(requirement_id),
                "party": party,
                "reason_code": reason_code,
            },
            command=command,
        )
        return Response(result.body, status=result.status_code)


# ---------------------------------------------------------------------------
# `EXHAUSTED`: the three ways out, and why they are three endpoints
# ---------------------------------------------------------------------------
#
# When no lead takes a rate-card job the cascade parks it and the Customer decides what happens
# next. It used to decide for them by handing the request to the quote flow, which quietly changed
# what they had asked for.
#
# One endpoint taking an `action` string would be shorter and worse: "cancel" and "keep looking"
# would differ by a typo, and each of these has a different refusal surface and a different thing
# to say in its schema. They share `_recovery_command`, so the shape stays in one place.


def _recovery_command(
    request: Request,
    requirement_id: uuid.UUID,
    *,
    operation: str,
    run: Callable[[CustomerRequirement, User], RateCardBooking],
) -> Response:
    """The shape all three recovery commands share: own the requirement, then act idempotently."""
    customer = cast(User, request.user)
    key = _idempotency_key(request)
    try:
        requirement = requirement_for_customer(customer=customer, requirement_id=requirement_id)
    except RequirementDomainError as exc:
        _raise_api_error(exc)

    def command() -> tuple[int, dict[str, object]]:
        try:
            booking = run(requirement, customer)
        except RequirementDomainError as exc:
            _raise_api_error(exc)
        return status.HTTP_200_OK, cast(dict[str, object], RateCardBookingSerializer(booking).data)

    result = execute_idempotent(
        actor=customer,
        operation=operation,
        key=key,
        request_payload={"requirement_id": str(requirement_id)},
        command=command,
    )
    return Response(result.body, status=result.status_code)


_RECOVERY_CONFLICT = OpenApiResponse(
    response=ApiErrorSerializer,
    description="`m2_requirement_transition_not_allowed` unless the booking is `EXHAUSTED`. A "
    "cascade that is still running has not asked the Customer anything yet, and a job a crew "
    "already took is not theirs to redirect.",
)


class RequirementRateCardRetryView(ThrottledWriteMixin, APIView):
    """Search wider, at the same published rate."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "m2_rate_card_book"

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_retry",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Send another, wider wave of crew offers after nobody accepted.\n\n"
            "**The price does not change and cannot be changed here.** The A3 day rate is an "
            "Operations-published card sitting above a statutory wage floor, and its wage half is "
            "paid to the crew directly in cash at day end — money this platform never holds. A "
            "customer-set premium would advertise a rate nobody could enforce, on top of the rule "
            "that a partner may never charge above the card. Thin supply is answered by reaching "
            "further, which is what it usually needs.\n\n"
            "The wave counter is not reset, so this reaches leads the earlier waves did not. Each "
            "retry buys another `max_waves` of reach; when that is spent the booking parks again."
        ),
        responses={
            200: RateCardBookingSerializer,
            404: ApiErrorSerializer,
            409: _RECOVERY_CONFLICT,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        return _recovery_command(
            request,
            requirement_id,
            operation="m2.rate_card.retry",
            run=lambda requirement, customer: crew_dispatch.retry_cascade(
                requirement_id=requirement.id, actor=customer
            ),
        )


class RequirementRateCardQuotesView(APIView):
    """Stop waiting for a crew and collect quotes instead."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_choose_quotes",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Move the request onto the quote flow after nobody accepted at the published rate. "
            "Nothing has been charged and nothing is charged here.\n\n"
            "This is the transition that used to happen automatically. It is the same transition "
            "— vendors now send quotes on the ordinary business-hours clock — but it happens "
            "because the Customer chose it, and the booking records which."
        ),
        responses={
            200: RateCardBookingSerializer,
            404: ApiErrorSerializer,
            409: _RECOVERY_CONFLICT,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        return _recovery_command(
            request,
            requirement_id,
            operation="m2.rate_card.choose_quotes",
            run=lambda requirement, customer: crew_dispatch.choose_quote_flow(
                requirement_id=requirement.id, actor=customer
            ),
        )


class RequirementRateCardCancelView(APIView):
    """Stop looking altogether and close the request."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["M2 - Rate card"],
        operation_id="m2_rate_card_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        description=(
            "Close a request that no crew accepted. **Free, and provably so**: a booking fee only "
            "exists once a lead accepts, and this refuses any state but `EXHAUSTED` — where, by "
            "definition, none did.\n\n"
            "Cancelling a crew that *was* booked is a different command with real money behind it "
            "(`m2_booking_fee_cancel`), and is deliberately not reachable from here."
        ),
        responses={
            200: RateCardBookingSerializer,
            404: ApiErrorSerializer,
            409: _RECOVERY_CONFLICT,
        },
    )
    def post(self, request: Request, requirement_id: uuid.UUID) -> Response:
        return _recovery_command(
            request,
            requirement_id,
            operation="m2.rate_card.cancel",
            run=lambda requirement, customer: crew_dispatch.cancel_rate_card_booking(
                requirement_id=requirement.id, actor=customer
            ),
        )
