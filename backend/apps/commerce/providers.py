"""Payment-provider boundary; credentials never leave server configuration."""

import hashlib
import hmac
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any, ClassVar, Protocol, cast

import requests
from django.conf import settings


class PaymentProviderError(RuntimeError):
    """A provider operation failed definitively."""


class PaymentProviderAmbiguousError(PaymentProviderError):
    """The provider may have accepted the command; reconciliation is required."""


class PaymentProviderRejectedError(PaymentProviderError):
    """The provider rejected a validly delivered command."""


@dataclass(frozen=True, slots=True)
class ProviderOrder:
    provider_order_id: str
    amount_paise: int
    currency: str
    status: str


@dataclass(frozen=True, slots=True)
class ProviderPayment:
    provider_payment_id: str
    provider_order_id: str
    amount_paise: int
    currency: str
    status: str


@dataclass(frozen=True, slots=True)
class ProviderRefund:
    provider_refund_id: str
    provider_payment_id: str
    amount_paise: int
    currency: str
    status: str


class PaymentProvider(Protocol):
    code: str

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        idempotency_key: str,
    ) -> ProviderOrder: ...

    def find_orders_by_receipt(self, *, receipt: str) -> tuple[ProviderOrder, ...]: ...

    def fetch_payment(self, *, provider_payment_id: str) -> ProviderPayment: ...

    def fetch_order_payments(self, *, provider_order_id: str) -> tuple[ProviderPayment, ...]: ...

    def create_refund(
        self,
        *,
        provider_payment_id: str,
        amount_paise: int,
        receipt: str,
        idempotency_key: str,
    ) -> ProviderRefund: ...

    def fetch_refund(self, *, provider_refund_id: str) -> ProviderRefund: ...

    def verify_webhook(self, *, body: bytes, signature: str) -> bool: ...


class FakePaymentProvider:
    """Deterministic local/test adapter. It is never selected implicitly."""

    code = "fake"
    _orders: ClassVar[dict[str, ProviderOrder]] = {}
    _payments: ClassVar[dict[str, ProviderPayment]] = {}
    _refunds: ClassVar[dict[str, ProviderRefund]] = {}

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        idempotency_key: str,
    ) -> ProviderOrder:
        del idempotency_key
        provider_order_id = f"fake_order_{receipt.replace('-', '')}"
        order = ProviderOrder(provider_order_id, amount_paise, currency, "created")
        self._orders[provider_order_id] = order
        return order

    def find_orders_by_receipt(self, *, receipt: str) -> tuple[ProviderOrder, ...]:
        order = self._orders.get(f"fake_order_{receipt.replace('-', '')}")
        return () if order is None else (order,)

    def fetch_payment(self, *, provider_payment_id: str) -> ProviderPayment:
        try:
            return self._payments[provider_payment_id]
        except KeyError as exc:
            raise PaymentProviderRejectedError("The fake payment does not exist.") from exc

    def fetch_order_payments(self, *, provider_order_id: str) -> tuple[ProviderPayment, ...]:
        return tuple(
            payment
            for payment in self._payments.values()
            if payment.provider_order_id == provider_order_id
        )

    def create_refund(
        self,
        *,
        provider_payment_id: str,
        amount_paise: int,
        receipt: str,
        idempotency_key: str,
    ) -> ProviderRefund:
        del idempotency_key
        provider_refund_id = f"fake_refund_{receipt.replace('-', '')}"
        refund = ProviderRefund(
            provider_refund_id,
            provider_payment_id,
            amount_paise,
            "INR",
            "processed",
        )
        self._refunds[provider_refund_id] = refund
        return refund

    def fetch_refund(self, *, provider_refund_id: str) -> ProviderRefund:
        try:
            return self._refunds[provider_refund_id]
        except KeyError as exc:
            raise PaymentProviderRejectedError("The fake refund does not exist.") from exc

    def verify_webhook(self, *, body: bytes, signature: str) -> bool:
        secret = settings.PAYMENT_WEBHOOK_SECRET
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    @classmethod
    def record_payment(
        cls,
        *,
        provider_payment_id: str,
        provider_order_id: str,
        amount_paise: int,
        currency: str = "INR",
        status: str = "captured",
    ) -> ProviderPayment:
        payment = ProviderPayment(
            provider_payment_id,
            provider_order_id,
            amount_paise,
            currency,
            status,
        )
        cls._payments[provider_payment_id] = payment
        return payment


class RazorpayPaymentProvider:
    """Minimal Razorpay Orders/Payments/Refunds adapter with bounded I/O."""

    code = "razorpay"

    def __init__(self) -> None:
        self._base_url = settings.RAZORPAY_API_BASE_URL.rstrip("/")
        self._auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        self._timeout = (
            settings.PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS,
            settings.PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS,
        )

    @staticmethod
    def _integer(data: dict[str, object], key: str) -> int:
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, str)):
            raise PaymentProviderAmbiguousError(f"Razorpay omitted a valid {key} value.")
        return int(value)

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, object] | None = None,
        query: dict[str, object] | None = None,
    ) -> dict[str, object]:
        try:
            response = requests.request(
                method,
                f"{self._base_url}{path}",
                auth=self._auth,
                json=cast(Any, payload),
                params=cast(Any, query),
                timeout=self._timeout,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise PaymentProviderAmbiguousError(
                "Razorpay did not return a conclusive response."
            ) from exc
        if response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
            raise PaymentProviderAmbiguousError("Razorpay returned a temporary server error.")
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            raise PaymentProviderRejectedError("Razorpay rejected the payment command.")
        try:
            data = response.json()
        except requests.JSONDecodeError as exc:
            raise PaymentProviderAmbiguousError("Razorpay returned an invalid response.") from exc
        if not isinstance(data, dict):
            raise PaymentProviderAmbiguousError("Razorpay returned an invalid response shape.")
        return cast(dict[str, object], data)

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        idempotency_key: str,
    ) -> ProviderOrder:
        data = self._request(
            "POST",
            "/orders",
            payload={
                "amount": amount_paise,
                "currency": currency,
                "receipt": receipt,
                "notes": {"idempotency_key": idempotency_key},
            },
        )
        return ProviderOrder(
            provider_order_id=str(data["id"]),
            amount_paise=self._integer(data, "amount"),
            currency=str(data["currency"]),
            status=str(data["status"]),
        )

    def find_orders_by_receipt(self, *, receipt: str) -> tuple[ProviderOrder, ...]:
        data = self._request("GET", "/orders", query={"receipt": receipt, "count": 10})
        items = data.get("items", [])
        if not isinstance(items, list):
            raise PaymentProviderAmbiguousError("Razorpay returned an invalid order list.")
        orders: list[ProviderOrder] = []
        for item in items:
            if not isinstance(item, dict):
                raise PaymentProviderAmbiguousError("Razorpay returned an invalid order item.")
            typed_item = cast(dict[str, object], item)
            if str(typed_item.get("receipt", "")) != receipt:
                continue
            orders.append(
                ProviderOrder(
                    provider_order_id=str(typed_item["id"]),
                    amount_paise=self._integer(typed_item, "amount"),
                    currency=str(typed_item["currency"]),
                    status=str(typed_item["status"]),
                )
            )
        return tuple(orders)

    def fetch_payment(self, *, provider_payment_id: str) -> ProviderPayment:
        data = self._request("GET", f"/payments/{provider_payment_id}")
        return ProviderPayment(
            provider_payment_id=str(data["id"]),
            provider_order_id=str(data["order_id"]),
            amount_paise=self._integer(data, "amount"),
            currency=str(data["currency"]),
            status=str(data["status"]),
        )

    def fetch_order_payments(self, *, provider_order_id: str) -> tuple[ProviderPayment, ...]:
        data = self._request("GET", f"/orders/{provider_order_id}/payments")
        items = data.get("items", [])
        if not isinstance(items, list):
            raise PaymentProviderAmbiguousError("Razorpay returned an invalid payment list.")
        payments: list[ProviderPayment] = []
        for item in items:
            if not isinstance(item, dict):
                raise PaymentProviderAmbiguousError("Razorpay returned an invalid payment item.")
            payments.append(
                ProviderPayment(
                    provider_payment_id=str(item["id"]),
                    provider_order_id=str(item["order_id"]),
                    amount_paise=self._integer(cast(dict[str, object], item), "amount"),
                    currency=str(item["currency"]),
                    status=str(item["status"]),
                )
            )
        return tuple(payments)

    def create_refund(
        self,
        *,
        provider_payment_id: str,
        amount_paise: int,
        receipt: str,
        idempotency_key: str,
    ) -> ProviderRefund:
        data = self._request(
            "POST",
            f"/payments/{provider_payment_id}/refund",
            payload={
                "amount": amount_paise,
                "receipt": receipt,
                "notes": {"idempotency_key": idempotency_key},
            },
        )
        return ProviderRefund(
            provider_refund_id=str(data["id"]),
            provider_payment_id=str(data["payment_id"]),
            amount_paise=self._integer(data, "amount"),
            currency=str(data.get("currency") or "INR"),
            status=str(data["status"]),
        )

    def fetch_refund(self, *, provider_refund_id: str) -> ProviderRefund:
        data = self._request("GET", f"/refunds/{provider_refund_id}")
        return ProviderRefund(
            provider_refund_id=str(data["id"]),
            provider_payment_id=str(data["payment_id"]),
            amount_paise=self._integer(data, "amount"),
            currency=str(data.get("currency") or "INR"),
            status=str(data["status"]),
        )

    def verify_webhook(self, *, body: bytes, signature: str) -> bool:
        expected = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


def get_payment_provider(*, provider_code: str | None = None) -> PaymentProvider:
    code = provider_code or settings.PAYMENT_PROVIDER
    if code == FakePaymentProvider.code:
        return FakePaymentProvider()
    if code == RazorpayPaymentProvider.code:
        return RazorpayPaymentProvider()
    raise PaymentProviderError("No payment provider is configured for this environment.")
