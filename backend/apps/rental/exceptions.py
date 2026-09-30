"""Stable API failures for A7 rental commands."""

from rest_framework import status
from rest_framework.exceptions import APIException


class RentalStateApiError(APIException):
    """Domain refusal that should surface as a contract-shaped 400 to the client.

    Rental views historically returned bare ``{"detail": "..."}``, which the
    customer api-client treats as an unexpected contract failure. Raising this
    exception lets the shared exception handler wrap the reason in the stable
    ``{error: {code, message, ...}}`` envelope.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "rental_state_invalid"
    error_code = "rental_state_invalid"
    retryable = False

    def __init__(self, *, reason: str, code: str = "rental_state_invalid") -> None:
        self.error_code = code
        self.default_code = code
        self.safe_message = reason
        super().__init__(detail=reason, code=code)
