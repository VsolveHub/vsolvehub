from celery import shared_task

from apps.rental.transport import expire_transport_requests


@shared_task
def expire_rental_transport_requests() -> int:
    """Delivery requests the owner never priced, or prices the customer never answered."""
    return expire_transport_requests()
