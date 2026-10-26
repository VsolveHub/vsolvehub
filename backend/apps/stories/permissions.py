"""Permissions for Safety Stories admin APIs."""

from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.identity.models import AccessAuditEvent, User
from apps.identity.services import record_access_event
from apps.partners.permissions import has_active_session_role
from common.observability.context import get_request_id


class IsStoryAdminUser(BasePermission):
    """Allows staff/superusers and authenticated operations users."""

    message = "Operations or administrator access is required."

    def has_permission(self, request: Request, _view: APIView) -> bool:
        user = request.user
        if not isinstance(user, User) or not user.is_authenticated or not user.is_active:
            return False

        if user.is_superuser or user.is_staff:
            return True

        allowed = has_active_session_role(request=request, role_code="operations")
        record_access_event(
            actor=user,
            subject_user=user,
            action="authorization.stories_api",
            object_type=_view.__class__.__name__,
            decision=(
                AccessAuditEvent.Decision.ALLOWED if allowed else AccessAuditEvent.Decision.DENIED
            ),
            request_id=get_request_id() or "",
            metadata={"method": request.method},
        )
        return allowed
