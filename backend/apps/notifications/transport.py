"""Outbound message transport boundary, selected fail-closed.

Follows ADR-0004: an unconfigured environment raises rather than guessing a provider. A
transport that quietly no-ops is worse than one that refuses, because a silent no-op reports
success to the escalation ladder and the deadline still passes unheard.

MSG91 is the intended provider for SMS, WhatsApp and voice and is **not implemented yet**. The
class below is the seam it lands in; until then only the deterministic fake is selectable, and
only outside production.
"""

from dataclasses import dataclass
from typing import Protocol

from django.conf import settings

from apps.notifications.models import NotificationIntent


class MessageTransportError(RuntimeError):
    """Raised when no transport can safely carry a message."""


@dataclass(frozen=True, slots=True)
class TransportResult:
    provider: str
    provider_message_id: str
    accepted: bool
    failure_code: str = ""


class MessageTransport(Protocol):
    code: str

    def supported_channels(self) -> tuple[str, ...]: ...

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult: ...


class FakeMessageTransport:
    """Deterministic transport for development and tests. Never selectable in production."""

    code = "fake"

    def supported_channels(self) -> tuple[str, ...]:
        return (
            NotificationIntent.Channel.SMS,
            NotificationIntent.Channel.EMAIL,
            NotificationIntent.Channel.PUSH,
            NotificationIntent.Channel.WHATSAPP,
            NotificationIntent.Channel.VOICE,
        )

    def send(
        self,
        *,
        channel: str,
        destination: str,
        template_code: str,
        context: dict[str, object],
    ) -> TransportResult:
        del destination, context
        if channel not in self.supported_channels():
            raise MessageTransportError(f"The fake transport cannot carry {channel}.")
        return TransportResult(
            provider=self.code,
            provider_message_id=f"fake-{channel.lower()}-{template_code}",
            accepted=True,
        )


def get_message_transport(*, provider_code: str | None = None) -> MessageTransport:
    """Select the transport, refusing rather than defaulting.

    MSG91 will register here alongside the fake. Until it does, every non-fake environment raises,
    which is the intended behaviour: the ladder must not believe a message was carried.
    """
    code = provider_code or getattr(settings, "MESSAGE_TRANSPORT", "unconfigured")
    if code == FakeMessageTransport.code:
        allow_fake = getattr(settings, "NOTIFICATIONS_ALLOW_FAKE_TRANSPORT", False)
        if not settings.DEBUG and not allow_fake:
            raise MessageTransportError(
                "The fake message transport is not permitted in this environment.",
            )
        return FakeMessageTransport()
    raise MessageTransportError("No message transport is configured for this environment.")


def configured_channels() -> tuple[str, ...]:
    """Channels this deployment can actually send on, or none when nothing is wired."""
    try:
        return get_message_transport().supported_channels()
    except MessageTransportError:
        return ()
