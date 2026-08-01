"""Shared authenticated test-client helpers."""

from rest_framework.test import APIClient

from apps.identity.hashing import keyed_hash
from apps.identity.models import Role, User, UserRole, UserSession


def force_role_client(*, user: User, role_code: str) -> APIClient:
    """Create a force-authenticated client with a real selected session role."""

    role = Role.objects.get(code=role_code)
    if not UserRole.objects.filter(
        user=user,
        role=role,
        revoked_at__isnull=True,
    ).exists():
        raise AssertionError(f"{user.id} does not hold the {role_code!r} role")

    client = APIClient()
    session = client.session
    session.save()
    if session.session_key is None:
        raise AssertionError("The test client did not create a session key")
    UserSession.objects.create(
        user=user,
        active_role=role,
        session_key_hash=keyed_hash(session.session_key),
        expires_at=session.get_expiry_date(),
    )
    client.force_authenticate(user=user)
    return client
