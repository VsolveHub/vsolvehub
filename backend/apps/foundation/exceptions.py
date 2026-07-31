"""Stable domain errors for retryable command infrastructure."""

from rest_framework.exceptions import APIException


class IdempotencyKeyReuseError(APIException):
    status_code = 409
    default_code = "idempotency_key_reused"
    default_detail = "This idempotency key was already used with a different request."


class IdempotencyInProgressError(APIException):
    status_code = 409
    default_code = "idempotency_in_progress"
    default_detail = "This request is still being processed."
    retryable = True
