"""API authentication backed by a revocable server-side session record."""

from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from apps.identity.hashing import keyed_hash
from apps.identity.models import UserSession


class RevocableSessionAuthentication(SessionAuthentication):
    """Require both Django's session and an active Vsolve session record."""

    def authenticate(self, request: Request) -> tuple[object, object] | None:
        authenticated = super().authenticate(request)
        if authenticated is None:
            return None

        user, auth = authenticated
        session_key = request.session.session_key
        if not session_key:
            raise AuthenticationFailed("Session is no longer active.", code="session_expired")

        now = timezone.now()
        session = (
            UserSession.objects.filter(
                user=user,
                session_key_hash=keyed_hash(session_key),
                revoked_at__isnull=True,
                expires_at__gt=now,
            )
            .only("id", "last_seen_at")
            .first()
        )
        if session is None:
            raise AuthenticationFailed("Session is no longer active.", code="session_expired")

        if session.last_seen_at <= now - timedelta(minutes=5):
            UserSession.objects.filter(pk=session.pk).update(last_seen_at=now)

        return user, auth
