"""Escalation ladder: how many ways we try to reach somebody before a deadline passes.

Every M2 deadline — invitation response, vendor reconfirmation, quote delivery, stage review —
assumes the other party actually saw the message. An in-app notice nobody opened is the failure
mode that quietly turns "the vendor ignored us" into "we never really told them".

The ladder answers one question: given a purpose and how long is left, which channels should
carry it now. It does not send. Sending stays where M1 put it — an intent is recorded here, a
delivery attempt is recorded against it later — so a ladder change cannot alter delivery
accounting.

Provider integration is MSG91 and is not wired yet. Until it is, `send_via` raises through the
fail-closed transport in `apps.notifications.transport`, which is what keeps an unconfigured
environment from silently reporting success.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification

Channel = NotificationIntent.Channel


@dataclass(frozen=True, slots=True)
class Rung:
    """One step of the ladder: what to use, and how close the deadline has to be."""

    channels: tuple[str, ...]
    #: Fire this rung once the remaining time drops to or below this. `None` means immediately.
    within: timedelta | None


#: Ordered from first contact to last resort. A voice call is the loudest and the most intrusive,
#: so it sits behind the shortest fuse and is reserved for deadlines that cost the vendor money.
DEFAULT_LADDER: tuple[Rung, ...] = (
    Rung(channels=(Channel.PUSH,), within=None),
    Rung(channels=(Channel.SMS,), within=timedelta(hours=6)),
    Rung(channels=(Channel.WHATSAPP,), within=timedelta(hours=2)),
    Rung(channels=(Channel.VOICE,), within=timedelta(minutes=30)),
)

#: Purposes that never escalate past a quiet channel. Nobody should get a phone call because a
#: quote teaser appeared.
QUIET_LADDER: tuple[Rung, ...] = (
    Rung(channels=(Channel.PUSH,), within=None),
    Rung(channels=(Channel.SMS,), within=timedelta(hours=12)),
)

_LADDERS: dict[str, tuple[Rung, ...]] = {
    "m2.invitation.received": DEFAULT_LADDER,
    "m2.selection.reconfirm_required": DEFAULT_LADDER,
    "m2.stage.review_required": DEFAULT_LADDER,
    "m2.quotes.ready": QUIET_LADDER,
    "m2.requirement.closed": QUIET_LADDER,
}


def ladder_for(purpose: str) -> tuple[Rung, ...]:
    return _LADDERS.get(purpose, QUIET_LADDER)


def channels_due(*, purpose: str, time_remaining: timedelta) -> tuple[str, ...]:
    """Which channels this purpose should use with `time_remaining` left on the clock.

    Rungs accumulate rather than replace: at thirty minutes to go, a vendor gets the call *and*
    has already had the push, the SMS and the WhatsApp. Escalation that swaps channels instead of
    adding them loses the earlier attempts from the record.
    """
    due: list[str] = []
    for rung in ladder_for(purpose):
        if rung.within is None or time_remaining <= rung.within:
            due.extend(rung.channels)
    return tuple(due)


def escalate(
    *,
    recipient_id: UUID,
    purpose: str,
    template_code: str,
    time_remaining: timedelta,
    context: dict[str, object] | None = None,
    correlation_key: str = "",
) -> list[NotificationIntent]:
    """Record one intent per channel that is now due.

    Idempotent per channel through `correlation_key`, so a sweep that runs twice against the same
    deadline does not send the same vendor two identical calls.
    """
    intents: list[NotificationIntent] = []
    for channel in channels_due(purpose=purpose, time_remaining=time_remaining):
        key = f"{correlation_key}:{channel}" if correlation_key else ""
        intents.append(
            request_notification(
                recipient_id=recipient_id,
                purpose=purpose,
                channel=channel,
                template_code=template_code,
                context=dict(context or {}),
                idempotency_key=key,
            )
        )
    return intents


def unreachable_channels(available: Sequence[str]) -> tuple[str, ...]:
    """Channels the ladder wants but this deployment cannot yet send on.

    Surfaces the gap instead of letting a ladder quietly degrade to whatever happens to be wired.
    """
    configured = set(available)
    wanted: set[str] = set()
    for ladder in _LADDERS.values():
        for rung in ladder:
            wanted.update(rung.channels)
    return tuple(sorted(wanted - configured))
