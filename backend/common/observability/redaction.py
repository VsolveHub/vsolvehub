"""What may never reach a log line, and the one function that enforces it.

`AGENTS.md` states the rule: **never log OTPs, session tokens, payment payloads or complete KYC
data.** `M2-BE-808` asks for "structured **safe** logs", and the word doing the work is *safe* —
structured logging makes it easy to attach a dictionary to a record, and the easiest dictionary to
attach is the request payload.

## A deny-list of key *names*, not of values

Scanning values for things that look like a card number produces false positives on every free-text
field a Customer ever writes and misses everything that does not match a pattern. Key names are what
the code controls: a payload arrives as `{"otp": …}` or `{"upi_vpa": …}` because somebody named it
that, and the name is stable across every value it will ever carry.

The match is a **substring, case-folded**, so one entry catches `otp`, `otp_code`, `challenge_otp`
and `OTP` alike. Substring matching does over-redact: `token` also catches `tokenizer_version`, and
`card` also catches `discard_reason`. Both of those are accepted deliberately, and the short entries
are written out in full (`session_key`, `pan_number`, `account_number`) rather than shortened,
precisely so the collateral stays this narrow.

Over-redacting is the direction to err in. A log line that says `"[redacted]"` where it did not have
to costs one debugging session. A log line carrying a live session token costs an account.

## Nothing here raises

`redact` is called from a log formatter. A formatter that can raise turns every subsequent log call
into a logging error, which is how a system loses its logs at the exact moment it needs them.
"""

from collections.abc import Mapping, Sequence
from typing import Any

#: Substrings that mark a key as unsafe to log, case-folded. Ordered by what they protect.
#:
#: Deliberately one tuple rather than a set per subsystem: this is the list `AGENTS.md`'s rule turns
#: into code, and splitting it would let one half be extended without the other. It is checked by
#: `common.observability.logging.JsonFormatter` on every record and is available to call sites
#: directly through `safe`.
SENSITIVE_KEY_FRAGMENTS: tuple[str, ...] = (
    # Authentication and session
    "otp",
    "password",
    "secret",
    "token",
    "session_key",
    "authorization",
    "api_key",
    "signature",
    "credential",
    # Payment instruments and provider payloads
    "card",
    "cvv",
    "upi",
    "vpa",
    "account_number",
    "ifsc",
    "bank_account",
    "payment_payload",
    "provider_payload",
    "webhook_payload",
    # Identity documents — KYC in full is what the rule names
    "aadhaar",
    "aadhar",
    "pan_number",
    "kyc",
    "document_number",
    "id_number",
    # Direct contact details. Not secret, but personal, and a log aggregator is not the place a
    # Customer's phone number should be searchable from.
    "phone",
    "email",
    "address_line",
)

#: What a redacted value is replaced with. A constant rather than an empty string, so a reader can
#: tell "we removed this" from "this was blank", which are different facts about a request.
REDACTED = "[redacted]"

#: How deep `redact` will walk before it stops recursing. A provider webhook can nest, and a log
#: formatter is not the place to discover a cyclic structure the hard way.
MAXIMUM_DEPTH = 6


def _is_sensitive(key: str) -> bool:
    folded = key.casefold()
    return any(fragment in folded for fragment in SENSITIVE_KEY_FRAGMENTS)


def redact(value: Any, *, _depth: int = 0) -> Any:
    """Return `value` with every sensitive key's value replaced. Never raises.

    Walks mappings and sequences. A string, a number and anything else is returned unchanged — the
    decision is made on the *key*, so a bare value arriving with no key attached cannot be judged
    and is not guessed at.
    """
    try:
        if _depth >= MAXIMUM_DEPTH:
            return REDACTED
        if isinstance(value, Mapping):
            return {
                str(key): (REDACTED if _is_sensitive(str(key)) else redact(item, _depth=_depth + 1))
                for key, item in value.items()
            }
        if isinstance(value, str | bytes):
            # Before the `Sequence` branch: a string is a sequence of characters and walking it
            # would return a list of one-character strings.
            return value
        if isinstance(value, Sequence):
            return [redact(item, _depth=_depth + 1) for item in value]
    except Exception:
        # A formatter that can raise turns every later log call into a logging error. There is
        # nowhere to report this to — the logger is the thing that would report it — so the safe
        # answer is the redacted one.
        return REDACTED
    return value


def safe(**fields: Any) -> dict[str, Any]:
    """Build a redacted `extra` dictionary for a log call.

    The call-site half of the same rule the formatter enforces. Both exist on purpose: the
    formatter is the guarantee (it cannot be forgotten), and this is the intent (it makes a reader
    of the call site see that somebody thought about it).
    """
    return {str(key): value for key, value in redact(fields).items()}
