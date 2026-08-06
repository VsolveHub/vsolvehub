"""Sessions are scoped per host, and production refuses to run otherwise.

The three apps are deployed on separate hosts — `vsolvehub.com`, `partner.vsolvehub.com` and
`consolve.vsolvehub.com`. A cookie domain of `.vsolvehub.com` would be shared by all of them,
which means a stolen Customer session cookie becomes a valid credential against the console that
approves payouts.

That is a one-line change somebody could make in a hurry to give staff a single sign-in, and it
would not fail anything or look wrong in review. So it is a startup error rather than a comment.
"""

import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from config.settings.guards import guard_per_host_sessions


def test_session_cookies_are_scoped_to_the_host_that_set_them() -> None:
    """`None` means the browser scopes the cookie to the exact host that set it, which is the
    isolation the three-domain deployment depends on."""

    assert settings.SESSION_COOKIE_DOMAIN is None
    assert settings.CSRF_COOKIE_DOMAIN is None


def test_the_session_cookie_is_not_readable_by_javascript() -> None:
    assert settings.SESSION_COOKIE_HTTPONLY is True
    assert settings.CSRF_COOKIE_HTTPONLY is True


@pytest.mark.parametrize(
    ("session_domain", "csrf_domain"),
    [
        (".vsolvehub.com", None),
        (None, ".vsolvehub.com"),
        (".vsolvehub.com", ".vsolvehub.com"),
    ],
)
def test_production_refuses_a_shared_cookie_domain(
    session_domain: str | None, csrf_domain: str | None
) -> None:
    """Either cookie alone is enough to break the isolation, so both are checked.

    Refused rather than warned about: a deployment that reaches for this has almost certainly
    done so to make staff sign-in convenient, without realising it also hands every Customer
    session the console's authority.
    """

    with pytest.raises(ImproperlyConfigured, match="per host"):
        guard_per_host_sessions(session_domain, csrf_domain)


def test_production_accepts_unset_cookie_domains() -> None:
    guard_per_host_sessions(None, None)
    guard_per_host_sessions("", "")
