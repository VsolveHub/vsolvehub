"""OTP delivery adapters.

The development adapter deliberately does not log the code. The API may return it only when the
environment-specific development flag is enabled.
"""

from typing import Protocol

from django.conf import settings

from apps.identity.models import OtpChallenge


class OtpDeliveryError(RuntimeError):
    """Raised when an OTP provider cannot accept a delivery request."""


class OtpSender(Protocol):
    def send(self, phone_number: str, code: str, purpose: str) -> None: ...


class DevelopmentOtpSender:
    def send(self, phone_number: str, code: str, purpose: str) -> None:
        del phone_number, code, purpose


class UnconfiguredOtpSender:
    def send(self, phone_number: str, code: str, purpose: str) -> None:
        del phone_number, code, purpose
        raise OtpDeliveryError("OTP delivery provider is not configured.")


def get_otp_sender() -> OtpSender:
    senders: dict[str, OtpSender] = {
        "development": DevelopmentOtpSender(),
        "unconfigured": UnconfiguredOtpSender(),
    }
    try:
        return senders[settings.OTP_PROVIDER]
    except KeyError as exc:
        raise OtpDeliveryError("Unknown OTP delivery provider.") from exc


def mark_delivery_failed(challenge: OtpChallenge, failure_code: str) -> None:
    challenge.delivery_status = OtpChallenge.DeliveryStatus.FAILED
    challenge.delivery_failure_code = failure_code[:64]
    challenge.save(update_fields=("delivery_status", "delivery_failure_code"))
