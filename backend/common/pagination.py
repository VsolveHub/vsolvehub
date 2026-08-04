"""Shared cursor pagination with a stable invalid-cursor refusal."""

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DataError
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.pagination import CursorPagination
from rest_framework.request import Request


class CursorInvalidApiError(APIException):
    """A cursor was present but is not a usable page position.

    Blank, whitespace, malformed and poison-position values all answer with this one
    code so a client can reset to page one without distinguishing decoding branches.
    Unexpected application faults must not be remapped here.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "cursor_invalid"
    error_code = "cursor_invalid"
    safe_message = "That page link is no longer valid. Start again from the first page."
    retryable = False

    def __init__(self) -> None:
        super().__init__(detail=self.safe_message, code=self.default_code)


class BoundedCursorQuerySerializer(serializers.Serializer[dict[str, object]]):
    """Publish the optional `cursor` query parameter with a non-blank constraint.

    Validation alone would surface as top-level `validation_error`. Callers must raise
    `CursorInvalidApiError` when this serializer refuses the cursor field so the public
    code stays `cursor_invalid`.
    """

    cursor = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)


def reject_invalid_cursor_query(request: Request) -> None:
    """Refuse a present-but-unusable cursor before pagination runs."""

    serializer = BoundedCursorQuerySerializer(data=request.query_params)
    if serializer.is_valid():
        return
    if "cursor" in serializer.errors:
        raise CursorInvalidApiError
    raise serializers.ValidationError(serializer.errors)


class StrictCursorPagination(CursorPagination):
    """DRF cursor pagination that maps only cursor failures to `cursor_invalid`."""

    def paginate_queryset(
        self, queryset: Any, request: Request, view: Any = None
    ) -> list[Any] | None:
        raw = request.query_params.get(self.cursor_query_param)
        if raw is not None and not str(raw).strip():
            raise CursorInvalidApiError
        try:
            return super().paginate_queryset(queryset, request, view=view)
        except NotFound as exc:
            raise CursorInvalidApiError from exc
        except (DataError, DjangoValidationError, TypeError, ValueError) as exc:
            # A present cursor can decode into a position that fails field prep (for example
            # `p=garbage` against a DateTime ordering). Remap only when the client supplied
            # a cursor; otherwise let the unexpected fault surface.
            if raw is None:
                raise
            raise CursorInvalidApiError from exc
