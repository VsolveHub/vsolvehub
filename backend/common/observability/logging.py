"""Small JSON formatter suitable for local and hosted log collectors.

## Structured fields are rendered, and that is new (`M2-BE-808`)

This formatter used to emit five keys — timestamp, level, logger, message and request id — and
**drop every `extra` field it was given**. That was not a cosmetic gap. `common.observability.
metrics.emit` writes the metric name, its value and all of its labels into `extra` and logs the
literal message `"metric"`; with the extras discarded, every counter the platform has ever emitted
reached the log as an indistinguishable line reading `"message": "metric"`. Nothing could be
alerted on and nothing could be counted, which is the same class of defect as a column with a
reader and no writer, one layer down: a writer with no reader.

So unknown record attributes are now rendered alongside the five, and Wave C7's M2 counters have
somewhere to land.

## Every rendered field is redacted first

`common.observability.redaction` holds the rule `AGENTS.md` states — never log OTPs, session
tokens, payment payloads or complete KYC data. Rendering extras without it would have turned a
missing feature into a leak: the easiest dictionary to attach to a log record is the request
payload. The redaction runs **here**, in the formatter, rather than only at call sites, because a
guarantee that depends on every future call site remembering is not a guarantee.

The `message` itself is deliberately **not** redacted. It is a format string a developer wrote, not
a payload; scrubbing it would mangle ordinary sentences, and a developer who interpolates a token
into a message string has made a different mistake than the one this file can catch.
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any

from common.observability.context import get_request_id
from common.observability.redaction import redact

#: Attributes the standard library puts on every `LogRecord`. Anything *not* in this set was put
#: there by a caller's `extra=` and is what this formatter now renders.
#:
#: Held as a frozen set built from a real record rather than hand-copied from the CPython source,
#: so a Python upgrade that adds an attribute cannot leave a stale hand-written list behind — the
#: same "derive it, never duplicate it" rule the check constraints in `catalog.models` follow.
_STANDARD_RECORD_ATTRIBUTES: frozenset[str] = frozenset(
    vars(logging.LogRecord(name="", level=0, pathname="", lineno=0, msg="", args=(), exc_info=None))
) | {"message", "asctime", "taskName"}

#: Keys the payload owns. A caller's `extra={"level": "…"}` must not be able to rewrite the record's
#: real level, which would let a log line lie about its own severity.
_RESERVED_PAYLOAD_KEYS: frozenset[str] = frozenset(
    {"timestamp", "level", "logger", "message", "request_id", "exception"}
)


class JsonFormatter(logging.Formatter):
    """Render one structured JSON object per log record."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None) or get_request_id()
        if request_id:
            payload["request_id"] = request_id
        for key, value in vars(record).items():
            if key in _STANDARD_RECORD_ATTRIBUTES or key in _RESERVED_PAYLOAD_KEYS:
                continue
            payload[key] = redact(value)
        if record.exc_info:
            # Last, and after the extras, so a caller cannot displace the traceback with a field of
            # their own — the traceback is the most useful thing on the line it appears on.
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)
