"""The HTTP surface for booking fulfilment: arrival through completion, per Fulfilment Unit.

`apps/fulfilment` was a complete, tested domain layer behind no door for one release. This module
is the door, and it is deliberately thin: every view validates, authorizes, delegates to the
service that already owns the rule, and projects. No business logic lives here.

## Four properties every state-changing view has

**An `expected_version`.** Required, never defaulted. The domain layer raises
`BookingVersionConflictApiError` and the client refetches — it never retries blindly.

**A required `Idempotency-Key`,** routed through `execute_idempotent`, the same helper proposal
0009 proved for Partner offer commands and 1.15.0 reused for dispatch recovery. There is one way
to do this in the repo and this is it. A replay answers with *current* truth rather than the
frozen body, because every projection here carries `server_now` and live deadlines; republishing
a stored body would hand a device a stale clock.

**An actor check that is part of the command, not the view.** `mark_en_route` takes a
`partner_id` and refuses another Partner's Booking itself. The view supplies identity; it does
not decide access. That way a future caller — a management command, a Celery task, a second
view — cannot accidentally bypass a check that only existed in a serializer.

**A projection scoped to the actor.** Three serializers over one `Booking`, so a Partner cannot
be handed a sibling unit or a Customer's address by a conditional that was got wrong.

## Why `PermissionError` is translated here

The domain layer raises plain `PermissionError` for "this Booking belongs to someone else",
because it is not an HTTP layer and should not import DRF exceptions. `_forbidden` turns that
into a `403` with safe copy at the boundary. The alternative — letting it escape as a 500 —
would leak the difference between "not yours" and "does not exist" through the error type.
"""

from collections.abc import Callable
from datetime import datetime, time, timedelta
from typing import Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.carts.models import BookingGroup
from apps.commerce.models import Booking
from apps.foundation.services import CommandResult, ResponseBody, execute_idempotent
from apps.fulfilment import completion as completion_services
from apps.fulfilment import recovery_services
from apps.fulfilment.quality_dispute import open_quality_dispute
from apps.fulfilment.amendments import (
    approve_scope_amendment,
    decline_scope_amendment,
    propose_scope_amendment,
)
from apps.fulfilment.cancellation import (
    cancel_booked_group,
    cancel_booking,
    change_booking_group_address,
    reschedule_booked_group,
    reschedule_booking,
)
from apps.fulfilment.evidence import record_work_evidence, request_work_evidence_upload
from apps.fulfilment.models import ScopeAmendment
from apps.fulfilment.otp import operations_assisted_start, request_start_otp, verify_start_otp
from apps.fulfilment.serializers import (
    AmendmentApprovalResultSerializer,
    AssistedStartRequestSerializer,
    BookingCancellationResultSerializer,
    CustomerBookingSerializer,
    CustomerContactAttemptRequestSerializer,
    DisputeCompletionRequestSerializer,
    EvidenceFinalizeRequestSerializer,
    EvidenceUploadGrantSerializer,
    EvidenceUploadRequestSerializer,
    GroupAddressChangeRequestSerializer,
    GroupCancellationResultSerializer,
    GroupCancelRequestSerializer,
    GroupRescheduleRequestSerializer,
    GroupRescheduleResultSerializer,
    OperationsBookingSerializer,
    PartnerBookingListQuerySerializer,
    PartnerBookingPageSerializer,
    PartnerBookingSerializer,
    ProposeAmendmentRequestSerializer,
    ReasonedCommandSerializer,
    RecoverBookingRequestSerializer,
    RescheduleBookingRequestSerializer,
    ScopeAmendmentSerializer,
    StartOtpSerializer,
    StartOtpVerifyRequestSerializer,
    SubmitCompletionRequestSerializer,
    VersionedCommandSerializer,
    WorkEvidenceSerializer,
)
from apps.fulfilment.services import (
    mark_arrived,
    mark_customer_unavailable_wait_started,
    mark_en_route,
    record_customer_contact_attempt,
)
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.partners.permissions import (
    HasRecentOperationsStepUp,
    IsOperationsUser,
    IsPartnerUser,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import (
    BoundedCursorQuerySerializer,
    StrictCursorPagination,
    reject_invalid_cursor_query,
)
from common.schema import IDEMPOTENCY_KEY_HEADER

FULFILMENT_TAG = "Fulfilment"

_ERRORS_4XX = {
    400: ApiErrorSerializer,
    403: ApiErrorSerializer,
    404: ApiErrorSerializer,
    409: ApiErrorSerializer,
}


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _forbidden() -> PermissionDenied:
    """One message for "not yours", regardless of whether the row exists.

    A distinct 404 for an unknown id and a 403 for someone else's id would make this an
    existence oracle: a caller could enumerate Booking ids by the status code alone. The cart
    removal command settled the same question the same way in 1.13.0.
    """

    return PermissionDenied("This booking is not available to you.")


def _replayable(result: CommandResult, projection: Callable[[], ResponseBody]) -> Response:
    if not result.replayed:
        return Response(result.body, status=result.status_code)
    response = Response(projection(), status=result.status_code)
    response["Idempotent-Replay"] = "true"
    return response


def _booking_queryset() -> QuerySet[Booking]:
    return Booking.objects.select_related(
        "partner", "fulfilment_unit", "fulfilment_unit__booking_group"
    ).prefetch_related("work_tasks", "evidence")


def _customer_booking(booking_id: UUID, customer: User) -> Booking:
    booking = _booking_queryset().filter(id=booking_id).first()
    if booking is None or booking.customer_id != customer.id:
        raise _forbidden()
    return booking


def _partner_profile(user: User) -> PartnerProfile:
    profile = PartnerProfile.objects.filter(user=user).first()
    if profile is None:
        raise _forbidden()
    return profile


def _partner_booking(booking_id: UUID, profile: PartnerProfile) -> Booking:
    booking = _booking_queryset().filter(id=booking_id).first()
    if booking is None or booking.partner_id != profile.id:
        raise _forbidden()
    return booking


def _customer_projection(booking_id: UUID) -> ResponseBody:
    booking = _booking_queryset().get(id=booking_id)
    return cast(ResponseBody, CustomerBookingSerializer(booking).data)


def _partner_projection(booking_id: UUID) -> ResponseBody:
    booking = _booking_queryset().get(id=booking_id)
    return cast(ResponseBody, PartnerBookingSerializer(booking).data)


def _operations_projection(booking_id: UUID) -> ResponseBody:
    booking = _booking_queryset().prefetch_related("status_history").get(id=booking_id)
    return cast(ResponseBody, OperationsBookingSerializer(booking).data)


class _PartnerCommandView(APIView):
    """Shared plumbing for the Partner's physical-work commands.

    They differ only in which service they call and what they read from the body, so the
    version guard, idempotency key, actor resolution and projection live here once. A command
    that needed to opt out of any of those would be a command that should not be on this base
    class.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    operation: str = ""
    request_serializer: type[VersionedCommandSerializer] = VersionedCommandSerializer

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        raise NotImplementedError

    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = self.request_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            self.run(
                booking=booking,
                profile=profile,
                data=serializer.validated_data,
                key=key,
            )
            return status.HTTP_200_OK, _partner_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation=self.operation,
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _partner_projection(booking.id))


# --------------------------------------------------------------------------------------------
# Customer
# --------------------------------------------------------------------------------------------


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
        issued = request_start_otp(
            booking_id=booking.id,
            customer_id=user.id,
            expected_version=serializer.validated_data["expected_version"],
        )
        return Response(
            StartOtpSerializer(
                {
                    "booking_id": booking.id,
                    "expires_at": issued.otp.expires_at,
                    "code_length": settings.OTP_CODE_LENGTH,
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
        if amendment is None or amendment.booking.customer_id != user.id:
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


def _amendment_projection(amendment_id: UUID) -> ResponseBody:
    amendment = ScopeAmendment.objects.prefetch_related("lines").get(id=amendment_id)
    return cast(ResponseBody, ScopeAmendmentSerializer(amendment).data)


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

    Distinct from `CustomerCompletionDisputeView`, which covers the 0–24h window while a
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


# --------------------------------------------------------------------------------------------
# Partner — physical work
# --------------------------------------------------------------------------------------------


# Buckets the Partner actually thinks in. `active` is everything still owed work,
# so a status added to the lifecycle shows up there by default rather than silently
# vanishing from every shelf.
_PARTNER_TERMINAL_STATUSES = (
    Booking.Status.COMPLETED,
    Booking.Status.PARTIALLY_COMPLETED,
    Booking.Status.CANCELLED,
    Booking.Status.ABORTED,
)
_PARTNER_BUCKETS: dict[str, tuple[str, ...]] = {
    "completed": (Booking.Status.COMPLETED, Booking.Status.PARTIALLY_COMPLETED),
    "cancelled": (Booking.Status.CANCELLED, Booking.Status.ABORTED),
}


class PartnerBookingCursorPagination(StrictCursorPagination):
    page_size = 25
    #: History reads newest-first; the `active` shelf overrides this to soonest-first.
    ordering = ("-scheduled_start", "-id")


class PartnerActiveBookingCursorPagination(PartnerBookingCursorPagination):
    """Soonest first.

    The work shelf is a running order, not an archive: the next thing to do
    belongs at the top. Newest-first is right for what has already happened and
    exactly wrong for what has not.
    """

    ordering = ("scheduled_start", "id")


#: How far ahead the work shelf looks.
#:
#: Today and tomorrow only. A Partner uses this list to decide what to do now and
#: what to plan for tonight; a booking three weeks out is real but it is not a
#: task, and mixing the two buries the ones that are.
_ACTIVE_HORIZON_DAYS = 2


class PartnerBookingCollectionView(APIView):
    """The Partner's own work, as a list.

    Published because the app previously had no way to ask "what jobs do I have?"
    — only `GET /partner/bookings/{id}/`, which needs an id the Partner had no
    screen to get one from.

    Scoped to the caller's own profile and takes no `partner_id`: the safest
    filter is the one a caller cannot supply, which is the same reasoning that
    keeps `booking_group_id` off the Partner booking projection.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_list",
        parameters=[PartnerBookingListQuerySerializer, BoundedCursorQuerySerializer],
        responses={200: PartnerBookingPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        reject_invalid_cursor_query(request)
        query = PartnerBookingListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        profile = _partner_profile(cast(User, request.user))

        queryset = _booking_queryset().filter(partner=profile)
        bucket = query.validated_data.get("bucket")
        paginator: PartnerBookingCursorPagination = PartnerBookingCursorPagination()

        if bucket == "active":
            zone = ZoneInfo(settings.TIME_ZONE)
            today = timezone.now().astimezone(zone).date()
            window_start = datetime.combine(today, time.min, tzinfo=zone)
            window_end = window_start + timedelta(days=_ACTIVE_HORIZON_DAYS)
            queryset = (
                queryset.exclude(status__in=_PARTNER_TERMINAL_STATUSES)
                .filter(scheduled_start__gte=window_start, scheduled_start__lt=window_end)
                # Stale work: the sweep already flagged it overdue and it never
                # left CONFIRMED, so nothing was ever started on it. Leaving those
                # on the shelf buries the jobs a Partner can still act on under
                # ones nobody is going to do. They stay readable by id, and they
                # are still counted wherever totals are counted — only the
                # "what now?" list drops them.
                .exclude(
                    status=Booking.Status.CONFIRMED,
                    late_declared_at__isnull=False,
                )
            )
            paginator = PartnerActiveBookingCursorPagination()
        elif bucket is not None:
            queryset = queryset.filter(status__in=_PARTNER_BUCKETS[bucket])

        page = paginator.paginate_queryset(queryset, request, view=self)
        response = paginator.get_paginated_response(PartnerBookingSerializer(page, many=True).data)
        # An empty shelf carries no row to calibrate a countdown from, so the page
        # publishes the server instant too — the same reason the offer inbox does.
        response.data["server_now"] = timezone.now()
        return response


class PartnerBookingDetailView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_retrieve",
        responses={200: PartnerBookingSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request, booking_id: UUID) -> Response:
        profile = _partner_profile(cast(User, request.user))
        booking = _partner_booking(booking_id, profile)
        return Response(PartnerBookingSerializer(booking).data)


class PartnerEnRouteView(_PartnerCommandView):
    operation = "fulfilment.mark_en_route"

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_en_route",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        mark_en_route(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerArrivedView(_PartnerCommandView):
    operation = "fulfilment.mark_arrived"

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_arrived",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        mark_arrived(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerCustomerUnavailableView(_PartnerCommandView):
    operation = "fulfilment.customer_unavailable"

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_customer_unavailable",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        mark_customer_unavailable_wait_started(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerAbortView(_PartnerCommandView):
    operation = "fulfilment.abort_work"
    request_serializer = ReasonedCommandSerializer

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_abort",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ReasonedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        completion_services.abort_work(
            booking_id=booking.id,
            partner_id=profile.id,
            reason=data["reason"],
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerReleaseView(_PartnerCommandView):
    """Give the job back, with a reason and no penalty attached.

    `01-scope-and-flow.md` is explicit that M1 records a late release for manual Operations
    review only — there is no automatic score, no threat and nothing the Partner can see that
    implies one. The reason is required because recovery needs to know what happened, not to
    justify the Partner to the platform.
    """

    operation = "fulfilment.partner_release"
    request_serializer = ReasonedCommandSerializer

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_release",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ReasonedCommandSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        recovery_services.release_booking_partner(
            booking_id=booking.id,
            partner_id=profile.id,
            reason=data["reason"],
            expected_version=data["expected_version"],
            idempotency_key=key,
        )


class PartnerStartOtpVerifyView(_PartnerCommandView):
    operation = "fulfilment.start_otp_verify"
    request_serializer = StartOtpVerifyRequestSerializer

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_start_otp_verify",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=StartOtpVerifyRequestSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        return super().post(request, booking_id)

    def run(
        self, *, booking: Booking, profile: PartnerProfile, data: dict[str, Any], key: str
    ) -> None:
        verify_start_otp(
            booking_id=booking.id,
            partner_id=profile.id,
            expected_version=data["expected_version"],
            code=data["code"],
            idempotency_key=key,
        )


class PartnerProposeAmendmentView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_propose_amendment",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposeAmendmentRequestSerializer,
        responses={201: ApiErrorSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = ProposeAmendmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            amendment = propose_scope_amendment(
                booking_id=booking.id,
                partner_id=profile.id,
                reason=serializer.validated_data["reason"],
                task_quantity=serializer.validated_data["task_quantity"],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_201_CREATED, _amendment_projection(amendment.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.propose_amendment",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PartnerSubmitCompletionView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_submit_completion",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=SubmitCompletionRequestSerializer,
        responses={200: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = SubmitCompletionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            completion_services.submit_completion(
                booking_id=booking.id,
                partner_id=profile.id,
                notes=serializer.validated_data["notes"],
                safety_damage_declared=serializer.validated_data["safety_damage_declared"],
                outcomes=[
                    completion_services.OutcomeInput(
                        work_task_id=item["work_task_id"],
                        outcome=item["outcome"],
                        quantity=item.get("quantity", 0),
                        reason=item.get("reason", ""),
                    )
                    for item in serializer.validated_data["outcomes"]
                ],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _partner_projection(booking.id)

        result = execute_idempotent(
            actor=user,
            operation="fulfilment.submit_completion",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _partner_projection(booking.id))


class PartnerContactAttemptView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_contact_attempt",
        request=CustomerContactAttemptRequestSerializer,
        responses={201: PartnerBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = CustomerContactAttemptRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = _partner_profile(cast(User, request.user))
        booking = _partner_booking(booking_id, profile)
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=profile.id,
            outcome=serializer.validated_data["outcome"],
        )
        return Response(_partner_projection(booking.id), status=status.HTTP_201_CREATED)


class PartnerEvidenceUploadView(APIView):
    """Mint a signed grant; the bytes never pass through Django on the way in.

    The same three-step shape FE-07 established for KYC — request a grant, PUT to the bucket,
    finalize by object key — for the same reason: streaming megabytes of site photographs
    through the API server buys nothing and costs availability.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_evidence_upload",
        request=EvidenceUploadRequestSerializer,
        responses={201: EvidenceUploadGrantSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = EvidenceUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        grant = request_work_evidence_upload(
            booking_id=booking.id,
            requested_by=user,
            kind=serializer.validated_data["kind"],
            content_type=serializer.validated_data["content_type"],
            size_bytes=serializer.validated_data["size_bytes"],
        )
        return Response(
            EvidenceUploadGrantSerializer(
                {
                    "object_key": grant.object_key,
                    "upload_url": grant.signed.upload_url,
                    "upload_token": grant.signed.upload_token,
                    "resumable_url": grant.signed.resumable_url,
                    "method": grant.signed.method,
                    "expires_at": grant.signed.expires_at,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class PartnerEvidenceFinalizeView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[FULFILMENT_TAG],
        operation_id="partner_booking_evidence_finalize",
        request=EvidenceFinalizeRequestSerializer,
        responses={201: WorkEvidenceSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = EvidenceFinalizeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        profile = _partner_profile(user)
        booking = _partner_booking(booking_id, profile)
        with transaction.atomic():
            evidence = record_work_evidence(
                booking_id=booking.id,
                uploaded_by=user,
                kind=serializer.validated_data["kind"],
                object_key=serializer.validated_data["object_key"],
                content_type=serializer.validated_data["content_type"],
                size_bytes=serializer.validated_data["size_bytes"],
                sha256=serializer.validated_data["sha256"],
                work_task_id=serializer.validated_data.get("work_task_id"),
            )
        return Response(WorkEvidenceSerializer(evidence).data, status=status.HTTP_201_CREATED)


# --------------------------------------------------------------------------------------------
# Operations
# --------------------------------------------------------------------------------------------


class OperationsBookingDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_retrieve",
        responses={200: OperationsBookingSerializer, 403: ApiErrorSerializer},
    )
    def get(self, _request: Request, booking_id: UUID) -> Response:
        booking = get_object_or_404(
            _booking_queryset().prefetch_related("status_history"), id=booking_id
        )
        return Response(OperationsBookingSerializer(booking).data)


class OperationsAssistedStartView(APIView):
    """The audited channel-outage workaround, and the one place step-up is mandatory.

    `operations_assisted_start` refuses a blank outage reason on its own, but the
    re-verification it describes has never been enforced anywhere, because until this release
    there was no view to enforce it in. `HasRecentOperationsStepUp` — already written, already
    documented as gating exactly this — is that enforcement. It is not a general-purpose OTP
    bypass: it starts work without the Customer's code and says so, loudly, in the audit trail.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_assisted_start",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=AssistedStartRequestSerializer,
        responses={200: OperationsBookingSerializer, 401: ApiErrorSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = AssistedStartRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = cast(User, request.user)
        booking = get_object_or_404(Booking, id=booking_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            operations_assisted_start(
                booking_id=booking.id,
                operator=operator,
                outage_reason=serializer.validated_data["outage_reason"],
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _operations_projection(booking.id)

        result = execute_idempotent(
            actor=operator,
            operation="fulfilment.operations_assisted_start",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _operations_projection(booking.id))


class OperationsRecoverBookingView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=["Operations"],
        operation_id="operations_booking_recover_partner",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=RecoverBookingRequestSerializer,
        responses={200: OperationsBookingSerializer, **_ERRORS_4XX},
    )
    def post(self, request: Request, booking_id: UUID) -> Response:
        serializer = RecoverBookingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operator = cast(User, request.user)
        booking = get_object_or_404(Booking, id=booking_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            recovery_services.recover_booking_partner(
                booking_id=booking.id,
                offer_id=serializer.validated_data["offer_id"],
                operator=operator,
                expected_version=serializer.validated_data["expected_version"],
                idempotency_key=key,
            )
            return status.HTTP_200_OK, _operations_projection(booking.id)

        result = execute_idempotent(
            actor=operator,
            operation="fulfilment.operations_recover_partner",
            key=key,
            request_payload={"booking_id": str(booking.id), **serializer.validated_data},
            command=command,
        )
        return _replayable(result, lambda: _operations_projection(booking.id))
