"""Periodic recovery for browser-independent Booking Group dispatch."""

from uuid import UUID

from celery import shared_task

from apps.assignments.group_services import GROUP_TERMINAL_STATUSES, reconcile_group_dispatch
from apps.carts.models import BookingGroup


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 8},
)
def reconcile_one_booking_group_dispatch(_self: object, group_id: str) -> None:
    reconcile_group_dispatch(group_id=UUID(group_id))


@shared_task
def reconcile_booking_group_dispatch() -> int:
    group_ids = BookingGroup.objects.exclude(status__in=GROUP_TERMINAL_STATUSES).values_list(
        "id", flat=True
    )
    reconciled = 0
    for group_id in group_ids.iterator(chunk_size=100):
        reconcile_one_booking_group_dispatch.delay(str(group_id))
        reconciled += 1
    return reconciled
