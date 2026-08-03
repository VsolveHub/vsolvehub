import hashlib
import hmac
from http import HTTPStatus
from typing import Any

import pytest
import requests
from django.test import override_settings

from apps.commerce.providers import (
    PaymentProviderAmbiguousError,
    PaymentProviderError,
    PaymentProviderRejectedError,
    RazorpayPaymentProvider,
    get_payment_provider,
)


class _Response:
    def __init__(self, *, status_code: int, data: object) -> None:
        self.status_code = status_code
        self._data = data

    def json(self) -> object:
        return self._data


def _test_value(label: str) -> str:
    return hashlib.sha256(label.encode()).hexdigest()


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=_test_value("server"),
    PAYMENT_WEBHOOK_SECRET=_test_value("webhook"),
    RAZORPAY_API_BASE_URL="https://api.razorpay.com/v1",
    PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS=2.0,
    PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS=7.0,
)
def test_razorpay_order_uses_bounded_authenticated_server_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: dict[str, Any] = {}

    def request(method: str, url: str, **kwargs: object) -> _Response:
        observed.update({"method": method, "url": url, **kwargs})
        return _Response(
            status_code=200,
            data={
                "id": "order_BE08",
                "amount": 12500,
                "currency": "INR",
                "status": "created",
            },
        )

    monkeypatch.setattr(requests, "request", request)

    order = RazorpayPaymentProvider().create_order(
        amount_paise=12500,
        currency="INR",
        receipt="internal-attempt-id",
        idempotency_key="stable-command-key",
    )

    assert order.provider_order_id == "order_BE08"
    assert observed["method"] == "POST"
    assert observed["url"] == "https://api.razorpay.com/v1/orders"
    assert observed["auth"] == ("rzp_test_key", _test_value("server"))
    assert observed["timeout"] == (2.0, 7.0)
    assert observed["json"] == {
        "amount": 12500,
        "currency": "INR",
        "receipt": "internal-attempt-id",
        "notes": {"idempotency_key": "stable-command-key"},
    }


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=_test_value("server"),
    PAYMENT_WEBHOOK_SECRET=_test_value("webhook"),
)
def test_razorpay_timeout_is_ambiguous_not_a_false_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def timeout(*_args: object, **_kwargs: object) -> None:
        raise requests.Timeout

    monkeypatch.setattr(requests, "request", timeout)

    with pytest.raises(PaymentProviderAmbiguousError):
        RazorpayPaymentProvider().create_refund(
            provider_payment_id="pay_BE08",
            amount_paise=5000,
            receipt="refund-id",
            idempotency_key="refund-command",
        )


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=_test_value("server"),
    PAYMENT_WEBHOOK_SECRET=_test_value("webhook"),
)
def test_razorpay_webhook_signature_uses_exact_raw_body() -> None:
    body = b'{"event":"payment.captured","whitespace":"is-significant"}'
    signature = hmac.new(
        _test_value("webhook").encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    provider = RazorpayPaymentProvider()

    assert provider.verify_webhook(body=body, signature=signature) is True
    assert provider.verify_webhook(body=body + b" ", signature=signature) is False


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=_test_value("server"),
    PAYMENT_WEBHOOK_SECRET=_test_value("webhook"),
)
def test_razorpay_parses_order_payment_and_refund_recovery_responses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def request(method: str, url: str, **_kwargs: object) -> _Response:
        if method == "GET" and url.endswith("/orders"):
            return _Response(
                status_code=200,
                data={
                    "items": [
                        {
                            "id": "order_recovered",
                            "receipt": "attempt-receipt",
                            "amount": 12500,
                            "currency": "INR",
                            "status": "created",
                        },
                        {
                            "id": "order_other",
                            "receipt": "other-receipt",
                            "amount": 1,
                            "currency": "INR",
                            "status": "created",
                        },
                    ]
                },
            )
        if method == "GET" and url.endswith("/orders/order_recovered/payments"):
            return _Response(
                status_code=200,
                data={
                    "items": [
                        {
                            "id": "pay_recovered",
                            "order_id": "order_recovered",
                            "amount": 12500,
                            "currency": "INR",
                            "status": "captured",
                        }
                    ]
                },
            )
        if method == "GET" and url.endswith("/payments/pay_recovered"):
            return _Response(
                status_code=200,
                data={
                    "id": "pay_recovered",
                    "order_id": "order_recovered",
                    "amount": 12500,
                    "currency": "INR",
                    "status": "captured",
                },
            )
        if method == "POST" and url.endswith("/payments/pay_recovered/refund"):
            return _Response(
                status_code=200,
                data={
                    "id": "rfnd_recovered",
                    "payment_id": "pay_recovered",
                    "amount": 5000,
                    "currency": "INR",
                    "status": "processed",
                },
            )
        if method == "GET" and url.endswith("/refunds/rfnd_recovered"):
            return _Response(
                status_code=200,
                data={
                    "id": "rfnd_recovered",
                    "payment_id": "pay_recovered",
                    "amount": 5000,
                    "currency": "INR",
                    "status": "processed",
                },
            )
        raise AssertionError(f"Unexpected provider request: {method} {url}")

    monkeypatch.setattr(requests, "request", request)
    provider = RazorpayPaymentProvider()

    orders = provider.find_orders_by_receipt(receipt="attempt-receipt")
    payment = provider.fetch_payment(provider_payment_id="pay_recovered")
    payments = provider.fetch_order_payments(provider_order_id="order_recovered")
    refund = provider.create_refund(
        provider_payment_id="pay_recovered",
        amount_paise=5000,
        receipt="refund-receipt",
        idempotency_key="refund-key",
    )
    fetched_refund = provider.fetch_refund(provider_refund_id="rfnd_recovered")

    assert len(orders) == 1
    assert orders[0].provider_order_id == "order_recovered"
    assert payment == payments[0]
    assert refund == fetched_refund


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET=_test_value("server"),
    PAYMENT_WEBHOOK_SECRET=_test_value("webhook"),
)
@pytest.mark.parametrize(
    ("status_code", "error_type"),
    (
        (HTTPStatus.INTERNAL_SERVER_ERROR, PaymentProviderAmbiguousError),
        (HTTPStatus.BAD_REQUEST, PaymentProviderRejectedError),
    ),
)
def test_razorpay_classifies_provider_http_failures(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    error_type: type[PaymentProviderError],
) -> None:
    monkeypatch.setattr(
        requests,
        "request",
        lambda *_args, **_kwargs: _Response(status_code=status_code, data={}),
    )

    with pytest.raises(error_type):
        RazorpayPaymentProvider().fetch_payment(provider_payment_id="pay_failure")


@override_settings(PAYMENT_PROVIDER="unconfigured")
def test_unconfigured_provider_fails_closed() -> None:
    with pytest.raises(PaymentProviderError):
        get_payment_provider()
