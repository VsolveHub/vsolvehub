"""Transactional-outbox consumer for payout submission.

Submission is reached through the outbox rather than called inline for the same reason every
money-moving side effect in this codebase is: the request that approved a batch must not hold a
transaction open across two hundred provider round-trips, and a browser closing must not strand
half a batch mid-payment.
"""

from uuid import UUID

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.payouts.services import submit_payout_item


@register_outbox_handler(event_type="payout.submission_requested")
def handle_payout_submission_requested(event: OutboxEvent) -> None:
    value = event.payload.get("payout_item_id")
    if not isinstance(value, str):
        raise ValueError("payout.submission_requested requires payout_item_id.")
    item_id = UUID(value)
    if item_id != event.aggregate_id:
        raise ValueError("payout.submission_requested aggregate does not match its payload.")
    submit_payout_item(item_id=item_id)
