"""Stable API failures for booking fulfilment commands."""

from datetime import datetime

from rest_framework import status
from rest_framework.exceptions import APIException


class BookingCommandInvalidApiError(APIException):
    """The command cannot apply to the Booking state it found.

    The state moved before the command arrived (already en route, already cancelled, an
    amendment already answered) — the reason is domain-authored, safe copy, so it is
    published directly rather than replaced with a generic fallback.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "booking_command_invalid"
    error_code = "booking_command_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class BookingVersionConflictApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "booking_version_conflict"
    error_code = "booking_version_conflict"
    safe_message = "This Booking changed since it was read. Refresh and try again."
    retryable = True

    def __init__(self, *, current_version: int) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {"current_version": current_version}


class _BookingActionWindowApiError(APIException):
    """A Partner command arrived outside the server-clock window it is allowed in.

    Both directions publish the whole window and the server's own instant, so the app can
    say "opens at 9:00" or "closed at 13:30" without trusting the device clock. Retrying
    the identical request later is legitimate for the not-yet case — the refusal rolls the
    idempotency record back, so the same key runs fresh once the gate opens.
    """

    status_code = status.HTTP_409_CONFLICT
    safe_message: str

    def __init__(
        self, *, action: str, opens_at: datetime, closes_at: datetime, server_now: datetime
    ) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {
            "action": action,
            "opens_at": opens_at.isoformat(),
            "closes_at": closes_at.isoformat(),
            "server_now": server_now.isoformat(),
        }


class BookingActionNotYetAllowedApiError(_BookingActionWindowApiError):
    default_code = "booking_action_not_yet_allowed"
    error_code = "booking_action_not_yet_allowed"
    safe_message = "It is too early for this step. It opens closer to the visit."
    retryable = True


class BookingActionWindowClosedApiError(_BookingActionWindowApiError):
    default_code = "booking_action_window_closed"
    error_code = "booking_action_window_closed"
    safe_message = "The window for this step has closed. Contact support to continue."
    retryable = False


class OutsideServiceableAreaApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "outside_serviceable_area"
    error_code = "outside_serviceable_area"
    safe_message = "That address is outside the serviceable area for this booking."
    retryable = False


class PartnerUnavailableApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "partner_unavailable_for_window"
    error_code = "partner_unavailable_for_window"
    safe_message = "Your Partner is not available for that time. Choose a different time."
    retryable = False


class StepUpRequiredApiError(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "step_up_required"
    error_code = "step_up_required"
    safe_message = "Re-verify your identity before using this Operations-assisted action."
    retryable = True


class OtpInvalidApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "otp_invalid"
    error_code = "otp_invalid"
    safe_message = "That code is incorrect, expired or locked."
    retryable = False
