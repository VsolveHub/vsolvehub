"""Partner and Operations API authorization."""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.identity.hashing import keyed_hash
from apps.identity.models import AccessAuditEvent, User, UserRole, UserSession
from apps.identity.services import record_access_event
from common.observability.context import get_request_id


def has_active_session_role(*, request: Request, role_code: str) -> bool:
    user = request.user
    if not isinstance(user, User):
        return False
    session_key = request.session.session_key
    if not session_key:
        return False
    if not UserRole.objects.filter(
        user=user,
        role__code=role_code,
        revoked_at__isnull=True,
    ).exists():
        return False
    return UserSession.objects.filter(
        user=user,
        session_key_hash=keyed_hash(session_key),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
        active_role__code=role_code,
    ).exists()


class IsOperationsUser(BasePermission):
    message = "Operations access is required."

    def has_permission(self, request: Request, _view: APIView) -> bool:
        user = request.user
        if not isinstance(user, User) or not user.is_authenticated or not user.is_active:
            return False
        allowed = has_active_session_role(request=request, role_code="operations")
        record_access_event(
            actor=user,
            subject_user=user,
            action="authorization.operations_api",
            object_type=_view.__class__.__name__,
            decision=(
                AccessAuditEvent.Decision.ALLOWED if allowed else AccessAuditEvent.Decision.DENIED
            ),
            request_id=get_request_id() or "",
            metadata={"method": request.method},
        )
        return allowed


class IsPartnerUser(BasePermission):
    message = "Partner access is required."

    def has_permission(self, request: Request, _view: APIView) -> bool:
        user = request.user
        return bool(
            isinstance(user, User)
            and user.is_authenticated
            and user.is_active
            and has_active_session_role(request=request, role_code="partner")
        )


class HasRecentFinanceStepUp(BasePermission):
    """Require a finance role and fresh OTP confirmation for money-moving commands."""

    message = "A recent finance step-up is required."

    def has_permission(self, request: Request, _view: APIView) -> bool:
        user = request.user
        if not isinstance(user, User) or not user.is_authenticated or not user.is_active:
            return False
        session_key = request.session.session_key
        if not session_key:
            return False
        return UserSession.objects.filter(
            user=user,
            session_key_hash=keyed_hash(session_key),
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
            active_role__code="finance",
            stepped_up_at__gte=timezone.now()
            - timedelta(seconds=settings.FINANCE_STEP_UP_TTL_SECONDS),
        ).exists()
