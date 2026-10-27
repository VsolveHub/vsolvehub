"""Everything the Customer can do to a Booking they paid for — one visit, then the whole group.

Two banner sections of the old `views.py` merged, because they are one audience: `Customer`
(a single visit — read, cancel, reschedule, the start OTP, amendment decisions, completion
confirm/dispute and the 72-hour quality dispute) and `Customer — group-wide` (the post-payment
group cancel, reschedule and address change under `/booking-groups/{id}/`).

The boundary is the actor. Nothing here resolves a `PartnerProfile` or an Operations step-up;
every command in this module authorizes against `request.user` being the Booking's — or the
BookingGroup's — customer, and projects through `CustomerBookingSerializer`.
"""

from typing import cast
from uuid import UUID

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.carts.models import BookingGroup
from apps.carts.serializers import BookingWindowsSerializer
from apps.foundation.services import ResponseBody, execute_idempotent
from apps.fulfilment import completion as completion_services
from apps.fulfilment.amendments import approve_scope_amendment, decline_scope_amendment
from apps.fulfilment.cancellation import (
    cancel_booked_group,
    cancel_booking,
    change_booking_group_address,
    reschedule_booked_group,
    reschedule_booking,
    reschedule_windows,
)
from apps.fulfilment.models import ScopeAmendment
from apps.fulfilment.otp import OtpRateLimitError, live_start_code, request_start_otp
from apps.fulfilment.quality_dispute import open_quality_dispute
from apps.fulfilment.serializers import (
    AmendmentApprovalResultSerializer,
    BookingCancellationResultSerializer,
    CustomerBookingSerializer,
    DisputeCompletionRequestSerializer,
    GroupAddressChangeRequestSerializer,
    GroupCancellationResultSerializer,
    GroupCancelRequestSerializer,
    GroupRescheduleRequestSerializer,
    GroupRescheduleResultSerializer,
    ReasonedCommandSerializer,
    RescheduleBookingRequestSerializer,
    StartOtpSerializer,
    VersionedCommandSerializer,
)
from apps.identity.exceptions import OtpThrottled
from apps.identity.models import User
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER

from .base import (
    _ERRORS_4XX,
    FULFILMENT_TAG,
    _amendment_projection,
    _customer_booking,
    _customer_projection,
    _forbidden,
    _replayable,
    _required_key,
)


class CustomerBookingDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_retrieve",
        responses={200: CustomerBookingSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request, booking_id: UUID) -> Response:
        booking = _customer_booking(booking_id, cast(User, request.user))
        return Response(CustomerBookingSerializer(booking).data)


class CustomerBookingCancelView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ReasonedCommandSerializer,
        responses={200: BookingCancellationResultSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = ReasonedCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            _cancelled, refunds = cancel_booking(
                booking_id=booking.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["reason"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, cast(
                ResponseBody,
                {
                    "booking": _customer_projection(booking.id),
                    "refund_ids": [str(refund.id) for refund in refunds],
                },
            )

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.booking_cancel",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class CustomerBookingRescheduleWindowsView(APIView):
    """The slot grid for moving a visit — the same grid the Customer chose from at checkout.

    `GET`, and cart-free: everything it needs is on the Booking. The checkout equivalent is a
    `POST` because its answer is derived from the caller's session cart, which is not
    addressable in a URL; this one is genuinely a read of one identified visit.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_reschedule_windows",
        responses={200: BookingWindowsSerializer, **_ERRORS_4XX},
    )
    def get(self, request: Request, booking_id: UUID) -> Response:
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        windows = reschedule_windows(booking_id=booking.id, customer_id=user.id)
        return Response(BookingWindowsSerializer(windows).data)


class CustomerBookingRescheduleView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_reschedule",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RescheduleBookingRequestSerializer,
        responses={200: CustomerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = RescheduleBookingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            reschedule_booking(
                booking_id=booking.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
                new_requested_start=serializer.validated_data["new_requested_start"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _customer_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.booking_reschedule",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _customer_projection(booking.id))


class CustomerStartOtpView(APIView):
    """The Customer requests the code; the Partner types it in.

    Two different people, two different endpoints, which is what makes the OTP mean anything:
    it proves the Partner is standing in front of the Customer. Publishing the code to the
    Partner, or letting the Partner request it, would prove nothing at all.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_start_otp_request",
        request=VersionedCommandSerializer,
        responses={200: StartOtpSerializer, **_ERRORS_4XX, 429: ApiErrorSerializer},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = VersionedCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        try:
            issued = request_start_otp(
                booking_id=booking.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
            )
        except OtpRateLimitError as exc:
            # Inside the resend cooldown: hand back the code already issued, if it is still live.
            live = live_start_code(booking_id=booking.id, customer_id=user.id)
            if live is None:
                raise OtpThrottled(wait=exc.retry_after_seconds) from exc
            issued = live

        return Response(
            StartOtpSerializer(
                {
                    "booking_id": booking.id,
                    "expires_at": issued.otp.expires_at,
                    "code_length": settings.OTP_CODE_LENGTH,
                    "code": issued.code,
                    "development_code": issued.development_code,
                    "server_now": timezone.now(),
                }
            ).data
        )


class CustomerAmendmentDecisionView(APIView):
    """Approve or decline proposed extra work.

    Approval is not a state flag — it mints the `PriceRevision` and its `PaymentAttempt` in the
    same transaction, so a Customer cannot approve work that never gets billed. The response
    carries the attempt id because the client's next step is to pay it.
    """

    permission_classes = (IsAuthenticated,)
    approve = True

    @extend_schema(
        tags=[FULFILMENT_TAG],
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={200: AmendmentApprovalResultSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, amendment_id: UUID) -> Response:
        user = cast(User, request.user)
        amendment = ScopeAmendment.objects.select_related("booking").filter(id=amendment_id).first()
        # `booking` is nullable since M2 Wave C3 routed engagement amendments through the same
        # engine. A null one here is an M2 amendment reaching the M1 Booking route, and it gets
        # the same refusal a stranger's amendment gets — the existence of somebody else's
        # engagement is not this caller's business either.
        if amendment is None or amendment.booking is None:
            raise _forbidden()
        if amendment.booking.customer_id != user.id:
            raise _forbidden()
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            if self.approve:
                approved, attempt = approve_scope_amendment(
                    amendment_id=amendment.id, customer_id=user.id, idempotency_key=key
                )
                return status.HTTP_200_OK, cast(
                    ResponseBody,
                    {
                        "amendment": _amendment_projection(approved.id),
                        "payment_attempt_id": str(attempt.id),
                        "amount_paise": attempt.amount_paise,
                        "currency": attempt.currency,
                    },
                )
            declined = decline_scope_amendment(
                amendment_id=amendment.id, customer_id=user.id, idempotency_key=key
            )
            return status.HTTP_200_OK, _amendment_projection(declined.id)

        result = execute_idempotent(
            actor=user,
            operation=f"fulfilment.amendment_{'approve' if self.approve else 'decline'}",
            key=key,
            request_payload={"amendment_id": str(amendment.id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class CustomerAmendmentApproveView(CustomerAmendmentDecisionView):
    approve = True

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="scope_amendment_approve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={200: AmendmentApprovalResultSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, amendment_id: UUID) -> Response:
        return super().post(request, amendment_id)


class CustomerAmendmentDeclineView(CustomerAmendmentDecisionView):
    approve = False

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="scope_amendment_decline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={200: ApiErrorSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, amendment_id: UUID) -> Response:
        return super().post(request, amendment_id)


class CustomerCompletionConfirmView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_completion_confirm",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: CustomerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = VersionedCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            completion_services.confirm_completion(
                booking_id=booking.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _customer_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.completion_confirm",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _customer_projection(booking.id))


class CustomerCompletionDisputeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_completion_dispute",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DisputeCompletionRequestSerializer,
        responses={200: CustomerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = DisputeCompletionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            completion_services.dispute_completion(
                booking_id=booking.id,
                customer_id=user.id,
                dispute_reason=serializer.validated_data["dispute_reason"],
                disputed_outcome_ids=list(
                    serializer.validated_data.get("disputed_outcome_ids") or []
                ),
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _customer_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.completion_dispute",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _customer_projection(booking.id))


class CustomerQualityDisputeView(APIView):
    """72-hour quality dispute after auto-finalisation (spec §12).

    Distinct from `CustomerCompletionDisputeView`, which covers the 0-24h window while a
    completion response is still pending. This path only opens once the visit was
    auto-finalised, and it holds the Partner payout without touching `cancel_booking`.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booking_quality_dispute",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ReasonedCommandSerializer,
        responses={200: CustomerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = ReasonedCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        booking = _customer_booking(booking_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            open_quality_dispute(
                booking_id=booking.id,
                customer_id=user.id,
                reason=serializer.validated_data["reason"],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _customer_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.quality_dispute",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _customer_projection(booking.id))


# --------------------------------------------------------------------------------------------
# Customer — group-wide
# --------------------------------------------------------------------------------------------


def _owned_group(group_id: UUID, user: User) -> BookingGroup:
    group = BookingGroup.objects.filter(id=group_id, customer_id=user.id).first()
    if group is None:
        raise _forbidden()
    return group


class BookedGroupCancelView(APIView):
    """Post-payment group cancellation.

    Distinct from `POST /booking-groups/{id}/cancel/`, which is and remains the *pre-payment*
    command and still refuses a `BOOKED` group. Two different money paths — one collects
    nothing, one runs the fee ladder per unit — so they are two different operations rather
    than one endpoint that changes meaning depending on state.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booked_group_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=GroupCancelRequestSerializer,
        responses={200: GroupCancellationResultSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, group_id: UUID) -> Response:
        serializer = GroupCancelRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        group = _owned_group(group_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            outcome = cancel_booked_group(
                group_id=group.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
                reason=serializer.validated_data["reason"],
                idempotency_key=key,
            )
            outcome.group.refresh_from_db()
            return status.HTTP_200_OK, cast(
                ResponseBody,
                GroupCancellationResultSerializer(
                    {
                        "booking_group_id": outcome.group.id,
                        "group_status": outcome.group.status,
                        "group_version": outcome.group.version,
                        "units": [
                            {
                                "fulfilment_unit_id": unit.fulfilment_unit_id,
                                "booking_id": unit.booking_id,
                                "outcome": unit.outcome,
                                "booking_status": unit.booking_status,
                                "fee_paise": unit.fee_paise,
                                "refund_ids": list(unit.refund_ids),
                            }
                            for unit in outcome.units
                        ],
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.booked_group_cancel",
            key=key,
            request_payload={"group_id": str(group.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class BookedGroupRescheduleView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booked_group_reschedule",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=GroupRescheduleRequestSerializer,
        responses={200: GroupRescheduleResultSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, group_id: UUID) -> Response:
        serializer = GroupRescheduleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        group = _owned_group(group_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            outcome = reschedule_booked_group(
                group_id=group.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
                new_group_start=serializer.validated_data["new_group_start"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, cast(
                ResponseBody,
                GroupRescheduleResultSerializer(
                    {
                        "booking_group_id": outcome.group.id,
                        "group_version": outcome.group.version,
                        "shift_seconds": int(outcome.shift.total_seconds()),
                        "units": [
                            {
                                "fulfilment_unit_id": unit.fulfilment_unit_id,
                                "booking_id": unit.booking_id,
                                "old_requested_start": unit.old_requested_start,
                                "new_requested_start": unit.new_requested_start,
                            }
                            for unit in outcome.units
                        ],
                        "server_now": timezone.now(),
                    }
                ).data,
            )

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.booked_group_reschedule",
            key=key,
            request_payload={"group_id": str(group.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class BookedGroupAddressChangeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="booked_group_change_address",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=GroupAddressChangeRequestSerializer,
        responses={200: GroupRescheduleResultSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, group_id: UUID) -> Response:
        serializer = GroupAddressChangeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        group = _owned_group(group_id, user)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            changed = change_booking_group_address(
                group_id=group.id,
                customer_id=user.id,
                expected_version=serializer.validated_data["expected_version"],
                new_address_id=serializer.validated_data["new_address_id"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, cast(
                ResponseBody,
                {
                    "booking_group_id": str(changed.id),
                    "group_version": changed.version,
                    "shift_seconds": 0,
                    "units": [],
                    "server_now": timezone.now().isoformat(),
                },
            )

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.booked_group_change_address",
            key=key,
            request_payload={"group_id": str(group.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)
