"""API authentication backed by a revocable server-side session record."""

from datetime import timedelta

from django.contrib.auth import logout
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from apps.identity.auth_cookies import mark_auth_cookies_for_clearing
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
            _drop_browser_session(request)
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
            # The cookie still names a Django session, but the revocable record
            # is gone. Leaving the cookie in place makes every later call,
            # including sign-out and a new OTP, fail as session_expired.
            _drop_browser_session(request)
            raise AuthenticationFailed("Session is no longer active.", code="session_expired")

        if session.last_seen_at <= now - timedelta(minutes=5):
            UserSession.objects.filter(pk=session.pk).update(last_seen_at=now)

        return user, auth


def _drop_browser_session(request: Request) -> None:
    mark_auth_cookies_for_clearing(request._request)
    logout(request._request)
