"""Enterprise RBAC permission classes for Super App Admin APIs."""

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.identity.models import UserRole


class HasAdminPermission(BasePermission):
    """
    Granular permission check:
    1. Unauthenticated -> 401
    2. Superuser, or user with active 'super_admin' or 'admin' role -> Allow all
    3. If view defines `required_permission`, checks if user holds an active role with that permission code.
    4. If no `required_permission` defined, allows any user holding an active enterprise role.
    """

    message = "Access Denied: Your assigned administrative role does not have the required permission."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if getattr(user, "is_superuser", False):
            return True

        active_user_roles = (
            UserRole.objects.filter(user=user, revoked_at__isnull=True)
            .select_related("role")
            .prefetch_related("role__permissions")
        )

        if not active_user_roles.exists():
            # If user is staff without explicitly assigned role, treat as admin for backward compatibility
            return getattr(user, "is_staff", False)

        for ur in active_user_roles:
            if ur.role.code in ("super_admin", "admin"):
                return True

        required_perm = getattr(view, "required_permission", None)
        if not required_perm:
            return True

        for ur in active_user_roles:
            if ur.role.permissions.filter(code=required_perm).exists():
                return True

        return False
