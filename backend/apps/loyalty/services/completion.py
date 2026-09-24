"""Customer completion recording service (Wave C2, ADR-0010)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from django.db import transaction
from django.utils.dateparse import parse_datetime

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.loyalty.models import CoinGrantRule, CustomerCompletion
from apps.loyalty.services.coins import grant_coins, unlock_coins_for_customer


@dataclass(frozen=True, slots=True)
class RecordCompletionResult:
    created: bool


@transaction.atomic
def record_completion_for_customer(
    event: OutboxEvent,
    *,
    customer_id: UUID | None = None,
    source_type: str = "BOOKING",
    source_id: UUID | None = None,
    completed_at: datetime | None = None,
    outbox_event_id: UUID | None = None,
) -> RecordCompletionResult:
    """Record customer completion fact with natural key idempotency and trigger unlocks."""
    cid = customer_id or UUID(str(event.payload.get("customer_id")))
    sid = source_id or UUID(
        str(event.payload.get("booking_id") or event.payload.get("engagement_id"))
    )
    raw_completed_at = (
        completed_at
        if completed_at is not None
        else parse_datetime(str(event.payload.get("completed_at")))
    )
    eid = outbox_event_id or event.id

    customer = User.objects.get(id=cid)

    _completion, created = CustomerCompletion.objects.get_or_create(
        customer=customer,
        source_type=source_type,
        source_id=sid,
        defaults={
            "completed_at": raw_completed_at,
            "outbox_event_id": eid,
        },
    )

    if created:
        count = CustomerCompletion.objects.filter(customer=customer).count()
        unlock_coins_for_customer(customer=customer, completion_count=count)
        grant_coins(
            customer=customer,
            trigger=CoinGrantRule.GrantTrigger.BOOKING_COMPLETED,
            sequence_n=count,
        )

    return RecordCompletionResult(created=created)
