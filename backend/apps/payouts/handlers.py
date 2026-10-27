"""Transactional-outbox consumer for payout submission.

Submission is reached through the outbox rather than called inline for the same reason every
money-moving side effect in this codebase is: the request that approved a batch must not hold a
transaction open across two hundred provider round-trips, and a browser closing must not strand
half a batch mid-payment.

The handler itself does not call the provider. The outbox runs every handler inside its own
transaction, and a RazorpayX call made there would hold that transaction — and the outbox row
lock — open for as long as RazorpayX takes. It queues `send_payout_item` for after its commit
instead, and that job makes the call with no transaction open. A lost job is re-queued by
`resume_payout_submissions`.
"""

from uuid import UUID

from django.db import transaction

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.payouts.models import PayoutBatchItem
from apps.payouts.tasks import send_payout_item


@register_outbox_handler(event_type="payout.submission_requested")
def handle_payout_submission_requested(event: OutboxEvent) -> None:
    value = event.payload.get("payout_item_id")
    if not isinstance(value, str):
        raise ValueError("payout.submission_requested requires payout_item_id.")
    item_id = UUID(value)
    if item_id != event.aggregate_id:
        raise ValueError("payout.submission_requested aggregate does not match its payload.")
    if not PayoutBatchItem.objects.filter(id=item_id).exists():
        raise ValueError("payout.submission_requested names no payout item.")
    transaction.on_commit(lambda: send_payout_item.delay(str(item_id)))
