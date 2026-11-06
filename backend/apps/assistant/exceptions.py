"""Stable API failures for the assistant endpoints."""

from rest_framework import status
from rest_framework.exceptions import APIException


class AssistantUnavailableApiError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "assistant_unavailable"
    error_code = "assistant_unavailable"
    safe_message = "The booking assistant is not available right now. Please book from the site."
    default_detail = safe_message


class AssistantConversationNotFoundApiError(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = "assistant_conversation_not_found"
    error_code = "assistant_conversation_not_found"
    safe_message = "This conversation was not found. Start a new one."
    default_detail = safe_message


class AssistantBusyApiError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "assistant_busy"
    error_code = "assistant_busy"
    safe_message = "The assistant is still answering your previous message."
    default_detail = safe_message


class AssistantLimitReachedApiError(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "assistant_limit_reached"
    error_code = "assistant_limit_reached"
    safe_message = "This conversation is too long. Start a new one, or book from the site."
    default_detail = safe_message
