"""Stable API failures for Rides commands, rendered through the shared error envelope."""

from rest_framework import status
from rest_framework.exceptions import APIException


class RidesApiError(APIException):
    """A domain refusal with a stable ``code`` the apps can branch on."""

    default_code = "rides_error"
    error_code = "rides_error"
    retryable = False

    def __init__(self, *, code: str, message: str) -> None:
        self.error_code = code
        self.default_code = code
        self.safe_message = message
        super().__init__(detail=message, code=code)


class CaptainNotApprovedError(RidesApiError):
    status_code = status.HTTP_403_FORBIDDEN

    def __init__(self) -> None:
        super().__init__(
            code="captain_not_approved",
            message="Your captain application can't be changed right now.",
        )


class RegistrationAlreadyUsedError(RidesApiError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            code="registration_already_used",
            message="This registration number is already registered to another captain.",
        )
