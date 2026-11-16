"""The MSG91 transport's request and its reading of MSG91's answer (regression tests).

Two bugs fixed with the notification SMS work:

1. The number went to MSG91 with its "+", which MSG91 does not accept. The OTP sender already
   stripped it; the generic transport did not.
2. MSG91 answers HTTP 200 with `{"type": "error"}` for some refusals (a wrong template id, an
   unapproved sender). The transport read only the HTTP status, so those were recorded as sent.
"""

import json
from typing import Any

import pytest
from django.test import override_settings

from apps.notifications import transport as transport_module
from apps.notifications.models import NotificationIntent
from apps.notifications.transport import MessageTransportError, Msg91MessageTransport


class _Answer:
    def __init__(self, body: dict[str, Any]) -> None:
        self._body = json.dumps(body).encode()

    def __enter__(self) -> "_Answer":
        return self

    def __exit__(self, *_exc: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


def _send(monkeypatch: pytest.MonkeyPatch, answer: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    sent: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: int) -> _Answer:
        del timeout
        sent.update(json.loads(request.data))
        return _Answer(answer)

    monkeypatch.setattr(transport_module, "urlopen", fake_urlopen)
    result = Msg91MessageTransport().send(
        channel=NotificationIntent.Channel.SMS,
        destination="+919876543210",
        template_code="msg91-tmpl-1",
        context={"partner_name": "Ravi"},
    )
    return result, sent


@override_settings(MSG91_AUTH_KEY="test-key")
def test_the_number_goes_without_its_plus_and_values_by_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result, sent = _send(monkeypatch, {"type": "success", "message": "req-123"})

    assert sent["template_id"] == "msg91-tmpl-1"
    assert sent["recipients"] == [{"mobiles": "919876543210", "partner_name": "Ravi"}]
    assert result.accepted
    assert result.provider_message_id == "req-123"


@override_settings(MSG91_AUTH_KEY="test-key")
def test_an_error_answer_with_http_200_is_a_refusal(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(MessageTransportError):
        _send(monkeypatch, {"type": "error", "message": "Invalid template"})
