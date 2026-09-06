"""Partner and Operations API authorization."""

from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.identity.hashing import keyed_hash
from apps.identity.models import AccessAuditEvent, User, UserRole, UserSession
from apps.identity.services import record_access_event
from apps.partners.models import PartnerCapability
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


class HasApprovedPartnerCapability(BasePermission):
    """Require an unexpired approved capability for the view's archetype."""

    archetype = ""
    message = "An approved capability for this workspace is required."

    def has_permission(self, request: Request, _view: APIView) -> bool:
        partner = getattr(request.user, "partner_profile", None)
        if partner is None or not self.archetype:
            return False
        now = timezone.now()
        return (
            PartnerCapability.objects.filter(
                partner=partner,
                archetype=self.archetype,
                status=PartnerCapability.Status.APPROVED,
            )
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .exists()
        )


class HasRecentOperationsStepUp(BasePermission):
    """Require an operations role and fresh OTP confirmation for outage-assisted commands.

    Gates `apps.fulfilment`'s Operations-assisted outage start and assisted work start —
    the one deliberate, audited channel-outage workaround, never a general-purpose bypass.
    """

    message = "A recent Operations step-up is required."

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
            active_role__code="operations",
            stepped_up_at__gte=timezone.now()
            - timedelta(seconds=settings.OPERATIONS_STEP_UP_TTL_SECONDS),
        ).exists()
