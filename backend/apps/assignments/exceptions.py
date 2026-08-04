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
