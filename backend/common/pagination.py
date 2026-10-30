"""Shared cursor pagination with a stable invalid-cursor refusal."""

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DataError
from drf_spectacular.utils import OpenApiParameter
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.pagination import CursorPagination
from rest_framework.request import Request
from rest_framework.response import Response


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
    """DRF cursor pagination that maps only cursor failures to `cursor_invalid`.

    ## Every subclass must name its own `ordering`

    DRF defaults `CursorPagination.ordering` to `"-created"`, and **no model in this project has
    a `created` column** — they all use `created_at`. A subclass that forgets one therefore looks
    completely fine at import, passes every check, and raises `FieldError` on the first request
    that reaches it. `EngagementCursorPagination` shipped that way and turned every read of
    `/api/v1/engagements/` into a 500.

    A default that is wrong for every caller is worse than no default, so this refuses one at
    class-definition time. It fails on `manage.py check`, which is where a missing ordering is
    cheap to notice rather than expensive.

    The ordering must also be **unique and stable** — cursor pagination pages by position, so a
    non-unique key silently skips or repeats rows. That is why the ones here all end in `id`.
    """

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if cls.ordering == CursorPagination.ordering:
            raise TypeError(
                f"{cls.__name__} must set its own `ordering`. DRF's default is '-created', "
                "which no model in this project has, so inheriting it raises FieldError at "
                "request time. Name the sort explicitly and end it with a unique tiebreak, "
                'for example ("-created_at", "id").'
            )

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


# ---------------------------------------------------------------------------------------------
# Newest-first pages for history and activity lists
# ---------------------------------------------------------------------------------------------

#: Customer and partner screens: a phone's worth of rows per page.
DEFAULT_PAGE_SIZE = 20
#: Operations screens work through queues, so a page holds more.
OPERATIONS_PAGE_SIZE = 50


class NewestFirstPagination(StrictCursorPagination):
    """Newest first, by creation time with `id` as the tiebreak. For any list that only grows."""

    page_size = DEFAULT_PAGE_SIZE
    ordering: tuple[str, ...] = ("-created_at", "-id")


class OperationsNewestFirstPagination(NewestFirstPagination):
    page_size = OPERATIONS_PAGE_SIZE


_PAGE_SERIALIZERS: dict[str, type[serializers.Serializer[dict[str, Any]]]] = {}


def page_serializer(
    item: type[serializers.BaseSerializer[Any]], name: str
) -> type[serializers.Serializer[dict[str, Any]]]:
    """The `{next, previous, results}` envelope as a named schema component.

    Named rather than generated from `item` because two lists can page the same item shape (a
    partner's and Operations' rental bookings) and the contract wants one component each.
    """

    if name not in _PAGE_SERIALIZERS:
        _PAGE_SERIALIZERS[name] = type(
            name,
            (serializers.Serializer,),
            {
                "next": serializers.URLField(allow_null=True),
                "previous": serializers.URLField(allow_null=True),
                "results": item(many=True),
                "__module__": __name__,
            },
        )
    return _PAGE_SERIALIZERS[name]


#: The query parameter every cursor-paged list publishes.
CURSOR_PARAMETER = OpenApiParameter(
    "cursor", str, OpenApiParameter.QUERY, description="Opaque page cursor from `next`."
)


def paginated(
    request: Request,
    view: Any,
    queryset: Any,
    serializer: type[serializers.BaseSerializer[Any]],
    *,
    pagination: type[NewestFirstPagination] = NewestFirstPagination,
    context: dict[str, Any] | None = None,
) -> Response:
    """Serialise one page of `queryset` in the shared envelope. Ordering comes from `pagination`."""

    paginator = pagination()
    page = paginator.paginate_queryset(queryset, request, view)
    data = serializer(page or [], many=True, context=context or {"request": request}).data
    return paginator.get_paginated_response(data)


# ---------------------------------------------------------------------------------------------
# Public browse: limit/offset, so user-chosen sorts (price, rating) still page correctly
# ---------------------------------------------------------------------------------------------

BROWSE_PAGE_SIZE = 24
BROWSE_MAX_PAGE_SIZE = 60

BROWSE_PARAMETERS = [
    OpenApiParameter(
        "limit",
        int,
        OpenApiParameter.QUERY,
        description=f"Rows to return. Default {BROWSE_PAGE_SIZE}, at most {BROWSE_MAX_PAGE_SIZE}.",
    ),
    OpenApiParameter("offset", int, OpenApiParameter.QUERY, description="Rows to skip. Default 0."),
]


def browse_window(request: Request) -> tuple[int, int]:
    """`(limit, offset)` from the query, clamped. Junk falls back to the defaults.

    A browse page is never unbounded: a missing limit means the default page, not every row.
    The client knows there is more when it receives a full page.
    """

    def _number(name: str) -> int | None:
        raw = (request.query_params.get(name) or "").strip()
        return int(raw) if raw.isdigit() else None

    limit = _number("limit") or BROWSE_PAGE_SIZE
    return min(limit, BROWSE_MAX_PAGE_SIZE), _number("offset") or 0


def filter_statuses(queryset: Any, request: Request, allowed: Any, field: str = "status") -> Any:
    """`?status=A` or `?status=A,B`: keep rows in any of the named states.

    A screen that splits a list into tabs filters on the server, because splitting one loaded page
    in the browser hides whatever is on the pages not yet loaded. An unknown state is refused
    rather than ignored, so a typo cannot read as "nothing here".
    """

    raw = (request.query_params.get("status") or "").strip()
    if not raw:
        return queryset
    wanted = [part.strip().upper() for part in raw.split(",") if part.strip()]
    unknown = sorted(set(wanted) - set(allowed))
    if unknown:
        raise serializers.ValidationError({"status": [f"Unknown status: {', '.join(unknown)}."]})
    return queryset.filter(**{f"{field}__in": wanted})


STATUS_PARAMETER = OpenApiParameter(
    "status",
    str,
    OpenApiParameter.QUERY,
    description="One state, or several separated by commas.",
)
