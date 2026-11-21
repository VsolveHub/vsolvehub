"""MSG91 OTP delivery: the right DLT template per purpose, and a refusal is never "sent".

Regression for two defects found while wiring the approved login OTP template:
- MSG91 answers HTTP 200 with `{"type": "error"}` for a wrong template or a DLT mismatch, and the
  sender read only the HTTP status, so a refused OTP was recorded as delivered.
- The visit start code went out through the login template, whose approved text says "to log in".
"""

import json
from typing import Any
from urllib.error import URLError

import pytest
from django.test import override_settings

from apps.identity import delivery
from apps.identity.delivery import Msg91OtpSender, OtpDeliveryError
from apps.identity.models import OtpChallenge

MSG91 = override_settings(
    MSG91_AUTH_KEY="test-auth-key",
    MSG91_OTP_TEMPLATE_ID="login-template",
    MSG91_START_OTP_TEMPLATE_ID="",
    MSG91_API_BASE_URL="https://control.msg91.com/api/v5",
)


class _Response:
    def __init__(self, body: str) -> None:
        self._body = body.encode()

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


class _Urlopen:
    def __init__(self, answer: str | Exception) -> None:
        self.answer = answer
        self.requests: list[Any] = []

    def __call__(self, request: Any, timeout: int) -> _Response:  # noqa: ARG002
        self.requests.append(request)
        if isinstance(self.answer, Exception):
            raise self.answer
        return _Response(self.answer)


@MSG91
def test_a_login_code_goes_out_on_the_login_template(monkeypatch: pytest.MonkeyPatch) -> None:
    urlopen = _Urlopen('{"type": "success", "message": "3561676b6a3"}')
    monkeypatch.setattr(delivery, "urlopen", urlopen)

    Msg91OtpSender().send("+919876543210", "482916", OtpChallenge.Purpose.LOGIN)

    [request] = urlopen.requests
    assert request.full_url == "https://control.msg91.com/api/v5/flow/"
    body = json.loads(request.data)
    assert body["template_id"] == "login-template"
    assert body["recipients"] == [{"mobiles": "919876543210", "otp": "482916"}]


@MSG91
@pytest.mark.parametrize(
    "answer",
    [
        '{"type": "error", "message": "Template ID Missing or Invalid Template"}',
        "not json",
        "[]",
    ],
)
def test_a_refusal_with_http_200_is_not_treated_as_sent(
    monkeypatch: pytest.MonkeyPatch, answer: str
) -> None:
    monkeypatch.setattr(delivery, "urlopen", _Urlopen(answer))

    with pytest.raises(OtpDeliveryError):
        Msg91OtpSender().send("+919876543210", "482916", OtpChallenge.Purpose.LOGIN)


@MSG91
def test_an_unreachable_msg91_is_a_delivery_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(delivery, "urlopen", _Urlopen(URLError("timed out")))

    with pytest.raises(OtpDeliveryError):
        Msg91OtpSender().send("+919876543210", "482916", OtpChallenge.Purpose.LOGIN)


@MSG91
def test_the_start_code_is_never_sent_in_the_login_wording(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    urlopen = _Urlopen('{"type": "success"}')
    monkeypatch.setattr(delivery, "urlopen", urlopen)

    with pytest.raises(OtpDeliveryError):
        Msg91OtpSender().send("+919876543210", "482916", "booking_start")

    assert urlopen.requests == []


@MSG91
def test_the_start_code_uses_its_own_template_once_registered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    urlopen = _Urlopen('{"type": "success"}')
    monkeypatch.setattr(delivery, "urlopen", urlopen)

    with override_settings(MSG91_START_OTP_TEMPLATE_ID="start-template"):
        Msg91OtpSender().send("+919876543210", "482916", "booking_start")

    assert json.loads(urlopen.requests[0].data)["template_id"] == "start-template"


@MSG91
def test_an_international_number_is_never_sent_an_otp(monkeypatch: pytest.MonkeyPatch) -> None:
    """The DLT template reaches Indian numbers only, and international SMS is the toll-fraud
    route for OTP endpoints."""

    urlopen = _Urlopen('{"type": "success"}')
    monkeypatch.setattr(delivery, "urlopen", urlopen)

    with pytest.raises(OtpDeliveryError):
        Msg91OtpSender().send("+447911123456", "482916", OtpChallenge.Purpose.LOGIN)

    assert urlopen.requests == []
