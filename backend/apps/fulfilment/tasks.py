"""Periodic fulfilment watchdogs. Every step is idempotent and re-runnable after a worker dies."""

from datetime import timedelta
from uuid import UUID

from celery import shared_task
from django.conf import settings
from django.db.models import Exists, OuterRef
from django.utils import timezone

from apps.assignments.models import PartnerOffer
from apps.commerce.models import Booking
from apps.fulfilment.completion import auto_finalize_completion
from apps.fulfilment.services import declare_booking_late, is_partner_late


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def declare_one_booking_late(_self: object, booking_id: str) -> None:
    declare_booking_late(booking_id=UUID(booking_id))


@shared_task
def sweep_late_bookings() -> int:
    """Flag every overdue, not-yet-declared-late Booking. Never cancels or reschedules.

    The overdue check is delegated to `is_partner_late` — the single source of truth for the
    grace deadline — rather than re-derived here, so the sweep and the on-demand check can
    never silently drift apart.
    """

    candidates = Booking.objects.filter(
        status__in=(Booking.Status.CONFIRMED, Booking.Status.EN_ROUTE),
        late_declared_at__isnull=True,
    ).select_related("fulfilment_unit")
    swept = 0
    for booking in candidates.iterator(chunk_size=100):
        unit = booking.fulfilment_unit
        if unit is None or not is_partner_late(booking=booking, unit=unit):
            continue
        declare_one_booking_late.delay(str(booking.id))
        swept += 1
    return swept


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def auto_finalize_one_completion(_self: object, booking_id: str) -> None:
    auto_finalize_completion(booking_id=UUID(booking_id))


@shared_task
def sweep_completion_auto_finalize() -> int:
    """Flag every silent-Customer completion past its response window. Evidence-gated inside
    `auto_finalize_completion` itself — the sweep only decides *when* to check, never whether
    the report is trustworthy enough to finalize."""

    deadline_cutoff = timezone.now() - timedelta(hours=settings.M1_COMPLETION_RESPONSE_HOURS)
    candidates = Booking.objects.filter(
        status=Booking.Status.COMPLETION_SUBMITTED,
        completion_submission__submitted_at__lte=deadline_cutoff,
        completion_submission__response__isnull=True,
    )
    swept = 0
    for booking in candidates.iterator(chunk_size=100):
        auto_finalize_one_completion.delay(str(booking.id))
        swept += 1
    return swept


@shared_task
def sweep_unacknowledged_assignments() -> int:
    """Flag directly-assigned advance jobs that remain unacknowledged ~24h before the visit.

    Flags only — never silently reassigns. Re-dispatch is an Operations-visible action
    (spec §11.3). Direct assignment is detected as a Booking whose Fulfilment Unit never
    had a PartnerOffer row.
    """

    now = timezone.now()
    horizon = now + timedelta(hours=24)
    had_offer = PartnerOffer.objects.filter(fulfilment_unit_id=OuterRef("fulfilment_unit_id"))
    candidates = (
        Booking.objects.filter(
            status=Booking.Status.CONFIRMED,
            assignment_acknowledged_at__isnull=True,
            needs_redispatch=False,
            scheduled_start__gt=now,
            scheduled_start__lte=horizon,
            fulfilment_unit__isnull=False,
        )
        .annotate(had_offer=Exists(had_offer))
        .filter(had_offer=False)
    )
    return candidates.update(needs_redispatch=True)
