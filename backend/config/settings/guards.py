"""Deployment guards that are worth failing start-up over.

Separate from `production.py` so each one can be tested without executing an entire settings
module — importing that module runs every other guard in it, so a test for one of them would
need a full production environment to reach the line it cares about.
"""

from django.core.exceptions import ImproperlyConfigured


def guard_per_host_sessions(session_domain: str | None, csrf_domain: str | None) -> None:
    """Sessions stay scoped to the host that issued them.

    The three apps are deployed on separate hosts — `vsolvehub.com`, `partner.vsolvehub.com`
    and `consolve.vsolvehub.com`. A cookie scoped to a parent domain is sent to every subdomain
    under it, so `.vsolvehub.com` would make a stolen Customer session cookie a valid credential
    against the console that approves payouts. The hosts are separate precisely so a compromise
    of one is not a compromise of the others, and a shared cookie quietly undoes that.

    Refused rather than warned about. This is a one-line change somebody makes in a hurry to
    give staff a single sign-in; it breaks nothing visibly and would not look wrong in review.
    Staff signing in to the console separately costs one OTP.
    """

    if session_domain or csrf_domain:
        raise ImproperlyConfigured(
            "SESSION_COOKIE_DOMAIN and CSRF_COOKIE_DOMAIN must stay unset. Sessions are scoped "
            "per host so that a compromised Customer session is not also a credential for the "
            "Operations console. Staff sign in to the console separately."
        )
