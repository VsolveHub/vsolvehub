"""Stable API failures for Partner offer commands."""

from rest_framework import status
from rest_framework.exceptions import APIException


class OfferCommandInvalidApiError(APIException):
    """The offer genuinely moved on: expired, revoked, already declined or committed.

    The reason is Partner-safe copy authored by the domain command, so it is published
    as the message rather than replaced by a generic fallback.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "offer_invalid"
    error_code = "offer_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class OfferReservationConflictApiError(APIException):
    """A concurrent reservation took the capacity this accept needed.

    Losing an appointment to another booking is not the same event as an offer
    expiring or being revoked, and telling a Partner "this offer expired" when
    someone else took the slot is a wrong explanation of a real loss. It is
    published as its own 409 so the Partner surface can say what happened.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "offer_reservation_conflict"
    error_code = "offer_reservation_conflict"
    safe_message = "That appointment was just reserved by another Customer."
    retryable = False


class DispatchCommandInvalidApiError(APIException):
    """The Operations command cannot apply to the dispatch state it found.

    Revoking an offer that already lapsed, releasing a reservation already released, or
    recovering a Booking Group that has reached a terminal state are all refusals of the
    same shape: the state moved before the command arrived, and re-reading is the recovery.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "dispatch_command_invalid"
    error_code = "dispatch_command_invalid"
    retryable = False

    def __init__(self, *, reason: str) -> None:
        super().__init__(detail=reason, code=self.default_code)


class DispatchVersionConflictApiError(APIException):
    """The Operations console acted on a Fulfilment Unit that had already moved.

    Unlike the other refusals this one is retryable, because the operator's intent may
    still be valid against the current state. `current_version` is published so the
    console can refetch and re-decide rather than guess.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "dispatch_version_conflict"
    error_code = "dispatch_version_conflict"
    safe_message = "This Fulfilment Unit changed since it was read. Refresh and try again."
    retryable = True

    def __init__(self, *, current_version: int) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)
        self.api_details: dict[str, object] = {"current_version": current_version}
