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
    event: OutboxEvent | None = None,
    *,
    customer_id: UUID | None = None,
    source_type: str = "BOOKING",
    source_id: UUID | None = None,
    completed_at: datetime | None = None,
    outbox_event_id: UUID | None = None,
) -> RecordCompletionResult:
    cid = customer_id
    if cid is None and event is not None:
        cid = UUID(str(event.payload.get("customer_id")))

    stype = source_type
    if event is not None and "source_type" in event.payload:
        stype = event.payload["source_type"]

    sid = source_id
    if sid is None and event is not None:
        sid = UUID(
            str(
                event.payload.get("booking_id")
                or event.payload.get("engagement_id")
                or event.payload.get("source_id")
            )
        )

    raw_completed_at = completed_at
    if raw_completed_at is None and event is not None:
        raw_completed_at = parse_datetime(str(event.payload.get("completed_at")))
    if raw_completed_at is None:
        raw_completed_at = datetime.now()

    eid = outbox_event_id
    if eid is None and event is not None:
        eid = event.id

    if cid is None or sid is None:
        raise ValueError("customer_id and source_id must be provided or derivable from event")

    customer = User.objects.get(id=cid)

    _completion, created = CustomerCompletion.objects.get_or_create(
        customer=customer,
        source_type=stype,
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
            order_payable_paise=_order_payable_paise(event, stype, sid),
            sequence_n=count,
        )

    return RecordCompletionResult(created=created)


def _order_payable_paise(
    event: OutboxEvent | None, source_type: str, source_id: UUID
) -> int | None:
    """Order total for earn-tier lookup. Missing bookings leave tiered rules idle."""
    if source_type == "BOOKING":
        from apps.commerce.models import Booking  # noqa: PLC0415

        booking = Booking.objects.filter(id=source_id).select_related("order").first()
        if booking is None:
            return None
        return int(booking.order.total_paise)
    elif source_type == "RENTAL_COMPLETED":
        from apps.rental.models import RentalBooking  # noqa: PLC0415

        rental = RentalBooking.objects.filter(id=source_id).first()
        return rental.price_paise if rental else None
    elif source_type == "STAY_CHECKED_OUT":
        from apps.stay.models import StayReservation  # noqa: PLC0415

        stay = StayReservation.objects.filter(id=source_id).first()
        return stay.total_paise if stay else None

    return None
