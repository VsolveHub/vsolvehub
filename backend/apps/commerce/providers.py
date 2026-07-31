"""Payment-provider boundary; production credentials stay in deployment configuration."""

import hashlib
import hmac
from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True, slots=True)
class ProviderOrder:
    provider_order_id: str
    amount_paise: int
    currency: str


class FakePaymentProvider:
    code = "fake"

    def create_order(self, *, amount_paise: int, currency: str, _receipt: str) -> ProviderOrder:
        return ProviderOrder(f"fake_order_{uuid4().hex}", amount_paise, currency)

    @staticmethod
    def verify_webhook(*, body: bytes, signature: str, secret: str) -> bool:
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
