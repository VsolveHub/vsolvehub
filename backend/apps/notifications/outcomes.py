"""What one attempt to send a WhatsApp or SMS copy came to, and the value cleaning both share."""

import re
from typing import Final

__all__ = ["FAILED", "RETRY", "SENT", "SKIPPED", "clean_value"]

#: Accepted by the provider.
SENT: Final[str] = "sent"
#: Refused for now (rate limit, provider error, timeout); worth trying again.
RETRY: Final[str] = "retry"
#: Refused for good (a wrong template, a number that is not on WhatsApp, a bad token).
FAILED: Final[str] = "failed"
#: Never sent, by design: switched off, not opted in, not configured, a value missing.
SKIPPED: Final[str] = "skipped"

_WHITESPACE = re.compile(r"\s+")


def clean_value(value: object, *, max_length: int) -> str:
    """One template value as a provider accepts it: one line, trimmed, bounded.

    Meta refuses a parameter with a newline, a tab or more than four spaces in a row, and a DLT
    variable is one line of at most 30 characters. An empty result means "missing": the caller
    skips the message rather than send a template with a blank in it.
    """

    if value is None:
        return ""
    # Cut, not ellipsised: a "…" would turn a plain SMS into a Unicode one, at twice the cost.
    return _WHITESPACE.sub(" ", str(value)).strip()[:max_length].rstrip()
