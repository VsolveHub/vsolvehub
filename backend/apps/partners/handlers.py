"""Transactional-outbox consumers for `apps.partners`.

One entry, and it consumes nothing. `partner.tax_profile.verified` records that a Partner's GST
registration was checked and their registered state settled; the verdict lives on
`PartnerBusinessProfile` with its own `gstin_verified_at`, and every reader takes it from there.
The event exists so the check is replayable and auditable, not so that something happens next.

Without this registration `dispatch_outbox_event` treats the event as an undeployed consumer —
it spends the attempt, marks the event `FAILED` and raises — so a fact nobody was waiting for
dead-lettered on every emission. See `apps.requirements.handlers._RECORDED_ONLY`, which makes the
same distinction for the M2 events and explains why the raise itself is right.
"""

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler


@register_outbox_handler(event_type="partner.tax_profile.verified")
def handle_tax_profile_verified(_event: OutboxEvent) -> None:
    """Settle the record. Nothing consumes it; see the module docstring."""
    return None
