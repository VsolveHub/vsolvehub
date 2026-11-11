from celery import shared_task

from apps.rental.transport import expire_transport_requests


@shared_task
def expire_rental_transport_requests() -> int:
    """Delivery requests the owner never priced, or prices the customer never answered."""
    return expire_transport_requests()


@shared_task
def send_rental_overdue_reminders() -> int:
    """Items still out after their last day: remind the owner and customer, then Operations."""
    # Imported here: tasks.py is loaded by Celery autodiscovery before services is needed.
    from apps.rental.services import send_overdue_return_reminders  # noqa: PLC0415

    return send_overdue_return_reminders()
