import json
import logging

from common.observability.context import get_request_id, reset_request_id, set_request_id
from common.observability.logging import JsonFormatter


def test_json_formatter_includes_request_context() -> None:
    token = set_request_id("request-456")
    try:
        record = logging.LogRecord(
            name="vsolve.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="booking confirmed",
            args=(),
            exc_info=None,
        )

        payload = json.loads(JsonFormatter().format(record))

        assert payload["level"] == "INFO"
        assert payload["logger"] == "vsolve.test"
        assert payload["message"] == "booking confirmed"
        assert payload["request_id"] == "request-456"
    finally:
        reset_request_id(token)

    assert get_request_id() is None
