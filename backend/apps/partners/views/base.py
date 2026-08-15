"""Shared spine for the Partner and Operations API surface.

The pieces more than one slice reaches for: the app's `APIException` subclass and the domain-error
translator, the self-review audit hook, the caller-IP and application-response readers, the two
profile-resolution helpers, the idempotency-key reader, and the `CursorPagination` subclasses the
Operations lists page with.

Imports nothing from its sibling view modules, so the dependency arrows run one way.
"""

from typing import cast

from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.request import Request
from rest_framework.response import Response

from apps.identity.models import AccessAuditEvent, User
from apps.identity.services import record_access_event
from apps.partners.exceptions import PartnerDomainError, PartnerSelfReviewError
from apps.partners.models import PartnerProfile
from apps.partners.selectors import partner_application_for_user, partner_profile_for_user
from apps.partners.serializers import PartnerApplicationSerializer
from common.observability.context import get_request_id


class PartnerApiException(APIException):
    def __init__(self, error: PartnerDomainError) -> None:
        self.status_code = error.status_code
        self.default_code = error.code
        self.retryable = error.retryable
        super().__init__(detail=error.message, code=error.code)


def _raise_api_error(error: PartnerDomainError) -> None:
    raise PartnerApiException(error)


def _audit_self_review_denial(*, actor: User, error: PartnerSelfReviewError) -> None:
    record_access_event(
        actor=actor,
        subject_user=actor,
        action="operations.partner_self_review",
        object_type=error.object_type,
        object_id=error.object_id,
        decision=AccessAuditEvent.Decision.DENIED,
        request_id=get_request_id() or "",
    )


def _request_ip(request: Request) -> str:
    return str(request.META.get("REMOTE_ADDR") or "unknown")


def _application_response(user: User) -> Response:
    application = partner_application_for_user(user)
    if application is None:
        raise NotFound("Partner application was not found.")
    return Response(PartnerApplicationSerializer(application).data)


class OperationsApplicationCursorPagination(CursorPagination):
    page_size = 25
    ordering = ("submitted_at", "id")


class OperationsPartnerDirectoryCursorPagination(CursorPagination):
    """Ordered by name, matching the directory's own ordering.

    `CursorPagination` reads its ordering from itself, not from the queryset — a paginator whose
    ordering disagreed with the queryset's would page inconsistently.
    """

    page_size = 25
    ordering = ("display_name", "id")


def _partner_profile_or_404(request: Request) -> PartnerProfile:
    """For per-record reads and every write. A caller with no profile owns no records."""
    profile = partner_profile_for_user(cast(User, request.user))
    if profile is None:
        raise NotFound("Partner profile was not found.")
    return profile


def _partner_profile_or_none(request: Request) -> PartnerProfile | None:
    """For list reads, which answer an account that has only just begun registering.

    The split matters more than it looks. A Partner-role session with no `PartnerProfile` is a real
    state — the thirty seconds between holding the role and being set up — and the reads a Partner
    needs *during* registration must answer it with an empty list rather than a `404` the client
    renders as an error. Proposal 0013's first constraint is that no gate stands before browsing
    demand, and a `404` on the options list is a gate.

    Per-*record* reads still use `_partner_profile_or_404`: an account with no profile genuinely has
    no business profile, no insurance declaration and no capability to read.
    """
    return partner_profile_for_user(cast(User, request.user))


def _idempotency_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key
