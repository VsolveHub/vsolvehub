"""Retention sweeps for privacy, session and OTP records.

`08-security-quality-and-production.md` requires that data with a purpose has an end. Three
things expire on their own here; a fourth deliberately does not.

**OTP challenges** are deleted once well past use. They are hashed, single-use and short-lived,
and keeping a spent one serves nobody.

**Expired sessions** are deleted after a grace period. A revoked session is evidence for a while
— "was my account accessed after I revoked it" is a real question — but not forever.

**Access audit events** are pruned on a longer horizon than everything else, because they are the
record that answers questions about the other two.

**Consent receipts and privacy requests are never swept.** A consent receipt is the evidence that
somebody agreed to something, and deleting it destroys the platform's own defence. Verified KYC
retention is a *legal* schedule, still unapproved (R7), and it is deliberately not implemented
here rather than guessed at.
"""

from datetime import timedelta
from typing import Any

from django.utils import timezone

from apps.identity.models import AccessAuditEvent, OtpChallenge, UserSession

#: Long enough that a spent challenge is of no forensic use, short enough that a table of them
#: does not accumulate.
OTP_RETENTION_DAYS = 7
#: A revoked or expired session stays readable while "was my account used after I revoked it" is
#: still a question somebody might ask.
SESSION_RETENTION_DAYS = 90
#: The audit trail outlives what it audits, because it is what explains it.
ACCESS_AUDIT_RETENTION_DAYS = 365


def sweep_expired_otp_challenges() -> int:
    cutoff = timezone.now() - timedelta(days=OTP_RETENTION_DAYS)
    deleted, _ = OtpChallenge.objects.filter(created_at__lt=cutoff).delete()
    return int(deleted)


def sweep_expired_sessions() -> int:
    cutoff = timezone.now() - timedelta(days=SESSION_RETENTION_DAYS)
    deleted, _ = UserSession.objects.filter(expires_at__lt=cutoff).delete()
    return int(deleted)


def sweep_access_audit_events() -> int:
    cutoff = timezone.now() - timedelta(days=ACCESS_AUDIT_RETENTION_DAYS)
    deleted, _ = AccessAuditEvent.objects.filter(created_at__lt=cutoff).delete()
    return int(deleted)


def run_retention_sweep() -> dict[str, Any]:
    """One pass over everything that expires. Reports what it removed rather than logging alone,
    so a scheduled run has a result somebody can assert on."""

    return {
        "otp_challenges": sweep_expired_otp_challenges(),
        "sessions": sweep_expired_sessions(),
        "access_audit_events": sweep_access_audit_events(),
    }
