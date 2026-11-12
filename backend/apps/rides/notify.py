"""Who hears about a ride, and when (brief §5.7).

Each function records a notification intent inside the caller's transaction, so a notice exists
exactly when the change it describes committed; the platform's delivery sweep sends it. Every
intent has an idempotency key built from the event, so a repeated or retried step never notifies
twice. Contexts hold names, amounts and ids only: never an address, a position or a start code.
"""

from typing import Any
from uuid import UUID

from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.rides.models import Ride, RideOffer, RideSosEvent

__all__ = [
    "captain_arrived",
    "captain_assigned",
    "captain_cancelled",
    "new_offer",
    "no_captain_found",
    "ride_cancelled",
    "sos_raised",
]

_PUSH = NotificationIntent.Channel.PUSH
_CUSTOMER = NotificationIntent.Audience.CUSTOMER
_PARTNER = NotificationIntent.Audience.PARTNER
_OPERATIONS = NotificationIntent.Audience.OPERATIONS


def _rupees(paise: int) -> str:
    return f"₹{paise // 100}"


def _send(
    *,
    recipient_id: Any,
    audience: str,
    template_code: str,
    key: str,
    context: dict[str, Any],
    channel: str = _PUSH,
) -> None:
    request_notification(
        recipient_id=recipient_id,
        purpose=f"rides.{template_code}",
        channel=channel,
        audience=audience,
        template_code=template_code,
        context=context,
        idempotency_key=f"rides:{template_code}:{key}",
    )


def new_offer(offer: RideOffer, ride: Ride) -> None:
    """The captain's alert: wakes a phone that is in the background or locked."""
    _send(
        recipient_id=offer.captain.user_id,
        audience=_PARTNER,
        template_code="rides_offer_new",
        # The offer row is reused when a ride searches again, so the time makes each offer unique.
        key=f"{offer.id}:{offer.offered_at.timestamp()}",
        context={
            "ride_id": str(ride.id),
            "offer_id": str(offer.id),
            "amount": _rupees(ride.fare_paise),
            "pickup_distance_m": offer.pickup_distance_m,
        },
    )


def captain_assigned(ride: Ride) -> None:
    captain = ride.captain
    if captain is None:
        return
    _send(
        recipient_id=ride.rider_id,
        audience=_CUSTOMER,
        template_code="rides_captain_assigned",
        key=f"{ride.id}:{ride.captain_assigned_at}",
        context={
            "ride_id": str(ride.id),
            "partner_name": captain.display_name,
        },
    )


def captain_arrived(ride: Ride) -> None:
    if ride.captain is None:
        return
    _send(
        recipient_id=ride.rider_id,
        audience=_CUSTOMER,
        template_code="rides_captain_arrived",
        key=f"{ride.id}:{ride.captain_arrived_at}",
        context={"ride_id": str(ride.id), "partner_name": ride.captain.display_name},
    )


def no_captain_found(ride: Ride) -> None:
    _send(
        recipient_id=ride.rider_id,
        audience=_CUSTOMER,
        template_code="rides_no_captain_found",
        key=str(ride.id),
        context={"ride_id": str(ride.id)},
    )


def captain_cancelled(ride: Ride, at: Any) -> None:
    """The rider hears that another captain is being found."""
    _send(
        recipient_id=ride.rider_id,
        audience=_CUSTOMER,
        template_code="rides_finding_another_captain",
        key=f"{ride.id}:{at}",
        context={"ride_id": str(ride.id)},
    )


def ride_cancelled(ride: Ride, *, captain_user_id: UUID | None) -> None:
    """Tell the side that did not cancel. A rider who cancels needs no push about it; Operations
    cancelling tells both."""
    by_operations = ride.cancelled_by == "OPERATIONS"
    context = {"ride_id": str(ride.id)}
    if captain_user_id is not None:
        _send(
            recipient_id=captain_user_id,
            audience=_PARTNER,
            template_code="rides_cancelled_captain",
            key=f"{ride.id}:captain",
            context=context,
        )
    if by_operations:
        _send(
            recipient_id=ride.rider_id,
            audience=_CUSTOMER,
            template_code="rides_cancelled_by_operations",
            key=f"{ride.id}:rider",
            context=context,
        )


def sos_raised(sos: RideSosEvent, *, raised_by_kind: str) -> None:
    """Every Operations user, at once, in their console feed."""
    recipients = (
        User.objects.filter(
            userrole__role__code="operations", userrole__revoked_at__isnull=True, is_active=True
        )
        .distinct()
        .values_list("id", flat=True)
    )
    for recipient_id in recipients:
        _send(
            recipient_id=recipient_id,
            audience=_OPERATIONS,
            channel=NotificationIntent.Channel.IN_APP,
            template_code="rides_sos_raised",
            key=f"{sos.id}:{recipient_id}",
            context={
                "sos_id": str(sos.id),
                "ride_id": str(sos.ride_id),
                "raised_by": raised_by_kind,
            },
        )
