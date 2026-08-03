"""Stable public payment-domain failures."""

from rest_framework import status
from rest_framework.exceptions import APIException


class PaymentConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "payment_conflict"
    default_detail = "Payment state changed. Refresh before trying again."
    safe_message = "Payment state changed. Refresh before trying again."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.default_detail, code=self.default_code)


class PaymentProviderUnavailableError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "payment_provider_unavailable"
    default_detail = "Payment status is temporarily unavailable. Try again shortly."
    safe_message = "Payment status is temporarily unavailable. Try again shortly."
    retryable = True
