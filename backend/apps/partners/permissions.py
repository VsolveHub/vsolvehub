"""Partner and Operations API authorization."""

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.identity.models import User


class IsOperationsUser(BasePermission):
    message = "Operations access is required."

    def has_permission(self, request: Request, _view: APIView) -> bool:
        user = request.user
        if not isinstance(user, User) or not user.is_authenticated or not user.is_active:
            return False
        if user.is_staff or user.is_superuser:
            return True
        return user.userrole_set.filter(
            role__code="operations",
            revoked_at__isnull=True,
        ).exists()
