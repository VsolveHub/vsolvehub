"""Partner-arranged delivery for rentals: request, quote, accept, deliver.

The platform never prices transport. The flow is:

1. The customer books with ``DELIVERY`` and their address. Nothing is charged; the booking is
   ``AWAITING_TRANSPORT_QUOTE`` and its dates are held tentatively.
2. The owner checks the request, arranges a vehicle and quotes a price (drop only, or drop and
   collect), or declines.
3. The customer accepts or rejects the quote. A rejected quote goes back to the owner, who may
   quote again, up to ``RentalTransportRequest.MAX_QUOTES`` times.
4. On accept, rent + platform fee + deposit + transport are charged together, once.
5. The owner marks the item out for delivery and hands it over with the customer's PIN, which
   starts the rental.

A declined or expired request has charged nothing. The customer can switch to self pickup (and
pay the pickup amount) or cancel.

Commission on transport is 0% today. It is snapshotted on the booking at accept time
(``transport_fee_percent``), so a later rate applies only to later quotes.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.rental.models import (
    AssetReservation,
    RentalAsset,
    RentalBooking,
    RentalTransportRequest,
)
from apps.rental.pickup_address import PickupAddressError, clean_pincode
from apps.rental.services import (
    RentalStateError,
    _check_stock,
    _notify_rental,
    _require_rental_capability,
    initiate_rental_booking_payment,
)

#: How long the owner has to quote, and then the customer to answer.
RESPOND_WINDOW = timedelta(hours=24)
#: The platform's share of the transport amount. Shown to the owner as "0% commission".
TRANSPORT_FEE_PERCENT = 0
_PHONE_DIGITS = 10


def transport_fee_percent() -> int:
    return TRANSPORT_FEE_PERCENT


def _error(message: str, code: str) -> Exception:
    return RentalStateError(message, code=code)


def _clean_pin(raw: dict[str, Any]) -> dict[str, str]:
    """The customer's map pin for the address, both halves or neither, as six-decimal text.

    Optional: an address typed before pins existed has none. When present it is what the owner's
    directions link routes to, so a half pin or an out-of-range one is refused, not guessed at.
    """
    lat, lng = raw.get("latitude"), raw.get("longitude")
    if lat in (None, "") and lng in (None, ""):
        return {}
    try:
        latitude, longitude = Decimal(str(lat)), Decimal(str(lng))
    except InvalidOperation as exc:
        raise _error(
            "The delivery pin is not a valid location.", "delivery_address_invalid"
        ) from exc
    if not (Decimal(-90) <= latitude <= Decimal(90) and Decimal(-180) <= longitude <= Decimal(180)):
        raise _error("The delivery pin is not a valid location.", "delivery_address_invalid")
    return {"latitude": f"{latitude:.6f}", "longitude": f"{longitude:.6f}"}


def clean_delivery_address(raw: dict[str, Any]) -> dict[str, str]:
    """``{line, area, city, pincode, contact_phone}``, trimmed, plus ``latitude``/``longitude``
    when the address has a pin. Line, city, pincode and phone are required; the owner needs them
    to find the door and call on the way."""
    line = str(raw.get("line") or "").strip()
    area = str(raw.get("area") or "").strip()
    city = str(raw.get("city") or "").strip()
    phone = "".join(ch for ch in str(raw.get("contact_phone") or "") if ch.isdigit())
    try:
        pincode = clean_pincode(str(raw.get("pincode") or ""))
    except PickupAddressError as exc:
        raise _error(str(exc), "delivery_address_invalid") from exc
    missing = [
        name
        for name, value in (("address", line), ("city", city), ("pincode", pincode))
        if not value
    ]
    if missing:
        raise _error(f"Add the delivery {', '.join(missing)}.", "delivery_address_invalid")
    if len(phone) < _PHONE_DIGITS:
        raise _error("Add a 10-digit contact phone for the delivery.", "delivery_address_invalid")
    return {
        "line": line[:240],
        "area": area[:120],
        "city": city[:120],
        "pincode": pincode,
        "contact_phone": phone[-_PHONE_DIGITS:],
        **_clean_pin(raw),
    }


def _deadline(booking: RentalBooking, *, now: datetime) -> datetime:
    """24 hours from now, but never past the start of the rental's first day."""
    start = timezone.make_aware(datetime.combine(booking.start_date, datetime.min.time()))
    return min(now + RESPOND_WINDOW, start)


def _notify(
    *, recipient_id: Any, template_code: str, booking: RentalBooking, key: str, **ctx: Any
) -> None:
    _notify_rental(
        recipient_id=recipient_id,
        purpose="rental.transport",
        template_code=template_code,
        context={"asset_title": booking.asset.title, "booking_id": str(booking.id), **ctx},
        idempotency_key=key,
    )


def open_transport_request(
    *, booking: RentalBooking, customer_note: str = ""
) -> RentalTransportRequest:
    """Called by ``create_booking`` inside its transaction."""
    now = timezone.now()
    request = RentalTransportRequest.objects.create(
        booking=booking,
        customer_note=(customer_note or "").strip()[:480],
        respond_by=_deadline(booking, now=now),
    )
    _notify(
        recipient_id=booking.asset.partner.user_id,
        template_code="rental_delivery_requested",
        booking=booking,
        key=f"rental-delivery-requested:{request.id}",
        respond_by=request.respond_by.isoformat(),
    )
    return request


def _lock(booking: RentalBooking) -> tuple[RentalBooking, RentalTransportRequest]:
    locked = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("asset", "asset__partner", "deposit")
        .get(id=booking.id)
    )
    try:
        request = RentalTransportRequest.objects.select_for_update().get(booking_id=locked.id)
    except RentalTransportRequest.DoesNotExist as exc:
        raise _error("This booking has no delivery request.", "transport_state_invalid") from exc
    return locked, request


def _require_owner(booking: RentalBooking, partner: Any) -> None:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")


def _require_customer(booking: RentalBooking, customer: Any) -> None:
    if booking.customer_id != getattr(customer, "id", None):
        raise PermissionError("Not your booking.")


def _require_open(request: RentalTransportRequest, *, now: datetime) -> None:
    if request.respond_by <= now:
        raise _error(
            "This delivery request has expired. Switch to self pickup or cancel.", "quote_expired"
        )


@transaction.atomic
def quote_transport(
    *, booking: RentalBooking, partner: Any, amount_paise: int, trip: str, note: str = ""
) -> RentalTransportRequest:
    booking, request = _lock(booking)
    _require_owner(booking, partner)
    now = timezone.now()
    if booking.status != RentalBooking.Status.AWAITING_TRANSPORT_QUOTE or (
        request.status != RentalTransportRequest.Status.REQUESTED
    ):
        raise _error("This request is not waiting for a price.", "transport_state_invalid")
    _require_open(request, now=now)
    if request.quote_count >= RentalTransportRequest.MAX_QUOTES:
        raise _error("You have already sent the most quotes allowed.", "quote_limit_reached")
    if int(amount_paise) <= 0:
        raise _error("Enter the transport price.", "transport_amount_invalid")
    if trip not in RentalTransportRequest.Trip.values:
        raise _error("Choose drop only, or drop and collect.", "transport_trip_invalid")
    request.status = RentalTransportRequest.Status.QUOTED
    request.quote_paise = int(amount_paise)
    request.trip = trip
    request.quote_note = (note or "").strip()[:480]
    request.quote_count += 1
    request.quoted_at = now
    request.respond_by = _deadline(booking, now=now)
    request.save()
    _notify(
        recipient_id=booking.customer_id,
        template_code="rental_delivery_quoted",
        booking=booking,
        key=f"rental-delivery-quoted:{request.id}:{request.quote_count}",
        quote_paise=request.quote_paise,
        trip=request.trip,
    )
    return request


def _end_request(*, booking: RentalBooking, request: RentalTransportRequest, status: str) -> None:
    """Decline or expiry: nothing was charged, the dates are let go. The booking waits for the
    customer to switch to self pickup or cancel."""
    request.status = status
    request.save(update_fields=("status", "updated_at"))
    AssetReservation.objects.filter(
        id=booking.reservation_id, status=AssetReservation.Status.TENTATIVE
    ).update(status=AssetReservation.Status.RELEASED, updated_at=timezone.now())


@transaction.atomic
def decline_transport(
    *, booking: RentalBooking, partner: Any, reason: str = ""
) -> RentalTransportRequest:
    booking, request = _lock(booking)
    _require_owner(booking, partner)
    if request.status != RentalTransportRequest.Status.REQUESTED:
        raise _error(
            "Only a request waiting for a price can be declined.", "transport_state_invalid"
        )
    request.decline_reason = (reason or "").strip()[:480]
    request.save(update_fields=("decline_reason", "updated_at"))
    _end_request(booking=booking, request=request, status=RentalTransportRequest.Status.DECLINED)
    _notify(
        recipient_id=booking.customer_id,
        template_code="rental_delivery_declined",
        booking=booking,
        key=f"rental-delivery-declined:{request.id}",
    )
    return request


@transaction.atomic
def reject_quote(
    *, booking: RentalBooking, customer: Any, note: str = ""
) -> RentalTransportRequest:
    """The customer says no to this price. The owner may quote again, up to the limit."""
    booking, request = _lock(booking)
    _require_customer(booking, customer)
    now = timezone.now()
    if request.status != RentalTransportRequest.Status.QUOTED:
        raise _error("There is no price waiting for your answer.", "transport_state_invalid")
    _require_open(request, now=now)
    request.reject_note = (note or "").strip()[:480]
    if request.quote_count >= RentalTransportRequest.MAX_QUOTES:
        request.save(update_fields=("reject_note", "updated_at"))
        _end_request(
            booking=booking, request=request, status=RentalTransportRequest.Status.DECLINED
        )
    else:
        request.status = RentalTransportRequest.Status.REQUESTED
        request.respond_by = _deadline(booking, now=now)
        request.save(update_fields=("status", "reject_note", "respond_by", "updated_at"))
    _notify(
        recipient_id=booking.asset.partner.user_id,
        template_code="rental_delivery_quote_rejected",
        booking=booking,
        key=f"rental-delivery-rejected:{request.id}:{request.quote_count}",
        note=request.reject_note,
    )
    return request


@transaction.atomic
def accept_quote(*, booking: RentalBooking, customer: Any) -> RentalBooking:
    """Agree the price and start the one payment for rent, fee, deposit and transport."""
    booking, request = _lock(booking)
    _require_customer(booking, customer)
    now = timezone.now()
    if booking.status != RentalBooking.Status.AWAITING_TRANSPORT_QUOTE or (
        request.status != RentalTransportRequest.Status.QUOTED
    ):
        raise _error("There is no price waiting for your answer.", "transport_state_invalid")
    _require_open(request, now=now)
    quote = int(request.quote_paise or 0)
    percent = transport_fee_percent()
    booking.transport_paise = quote
    booking.transport_fee_percent = percent
    booking.transport_fee_paise = quote * percent // 100
    request.status = RentalTransportRequest.Status.ACCEPTED
    request.accepted_at = now
    request.save(update_fields=("status", "accepted_at", "updated_at"))
    booking.status = RentalBooking.Status.PENDING_PAYMENT
    booking.save(
        update_fields=(
            "transport_paise",
            "transport_fee_percent",
            "transport_fee_paise",
            "status",
            "updated_at",
        )
    )
    # Paid on capture by ``complete_rental_booking_payment``, which confirms the reservation.
    initiate_rental_booking_payment(booking=booking)
    _notify(
        recipient_id=booking.asset.partner.user_id,
        template_code="rental_delivery_quote_accepted",
        booking=booking,
        key=f"rental-delivery-accepted:{request.id}:{request.quote_count}",
        quote_paise=quote,
    )
    return booking


@transaction.atomic
def switch_to_pickup(*, booking: RentalBooking, customer: Any) -> RentalBooking:
    """Drop the delivery and book as self pickup. Allowed until the customer has paid."""
    booking, request = _lock(booking)
    _require_customer(booking, customer)
    if booking.status != RentalBooking.Status.AWAITING_TRANSPORT_QUOTE:
        raise _error("This booking can no longer switch to self pickup.", "transport_state_invalid")
    # Same lock order as ``create_booking``: the asset row serialises stock checks.
    RentalAsset.objects.select_for_update().get(id=booking.asset_id)
    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status == AssetReservation.Status.RELEASED:
        # The dates were let go when the request was declined or expired. Take them again only
        # if the stock is still free.
        line = booking.lines.order_by("id").first()
        _check_stock(
            booking.asset, booking.start_date, booking.end_date, int(line.quantity) if line else 1
        )
    reservation.status = AssetReservation.Status.CONFIRMED
    reservation.save(update_fields=("status", "updated_at"))
    if request.status not in (
        RentalTransportRequest.Status.DECLINED,
        RentalTransportRequest.Status.EXPIRED,
    ):
        request.status = RentalTransportRequest.Status.CANCELLED
        request.save(update_fields=("status", "updated_at"))
    booking.pickup_or_delivery_mode = RentalBooking.Mode.PICKUP
    booking.transport_paise = 0
    booking.transport_fee_paise = 0
    booking.status = RentalBooking.Status.PENDING_PAYMENT
    booking.save(
        update_fields=(
            "pickup_or_delivery_mode",
            "transport_paise",
            "transport_fee_paise",
            "status",
            "updated_at",
        )
    )
    initiate_rental_booking_payment(booking=booking)
    return booking


@transaction.atomic
def mark_out_for_delivery(*, booking: RentalBooking, partner: Any) -> RentalTransportRequest:
    booking, request = _lock(booking)
    _require_owner(booking, partner)
    if booking.status != RentalBooking.Status.CONFIRMED or (
        request.status != RentalTransportRequest.Status.ACCEPTED
    ):
        raise _error(
            "Mark it out for delivery once the customer has paid.", "transport_state_invalid"
        )
    request.status = RentalTransportRequest.Status.OUT_FOR_DELIVERY
    request.save(update_fields=("status", "updated_at"))
    _notify(
        recipient_id=booking.customer_id,
        template_code="rental_out_for_delivery",
        booking=booking,
        key=f"rental-out-for-delivery:{request.id}",
    )
    return request


def expire_transport_requests(*, now: datetime | None = None) -> int:
    """Requests nobody answered in time. Beat runs this; each row is its own transaction."""
    now = now or timezone.now()
    due = list(
        RentalTransportRequest.objects.filter(
            status__in=(
                RentalTransportRequest.Status.REQUESTED,
                RentalTransportRequest.Status.QUOTED,
            ),
            respond_by__lte=now,
        ).values_list("booking_id", flat=True)
    )
    expired = 0
    for booking_id in due:
        with transaction.atomic():
            booking = (
                RentalBooking.objects.select_for_update(of=("self",))
                .select_related("asset")
                .get(id=booking_id)
            )
            request = RentalTransportRequest.objects.select_for_update().get(booking_id=booking_id)
            if (
                request.status
                not in (
                    RentalTransportRequest.Status.REQUESTED,
                    RentalTransportRequest.Status.QUOTED,
                )
                or request.respond_by > now
            ):
                continue
            _end_request(
                booking=booking, request=request, status=RentalTransportRequest.Status.EXPIRED
            )
            _notify(
                recipient_id=booking.customer_id,
                template_code="rental_delivery_expired",
                booking=booking,
                key=f"rental-delivery-expired:{request.id}",
            )
            expired += 1
    expired += _cancel_abandoned_requests(now=now)
    return expired


def _cancel_abandoned_requests(*, now: datetime) -> int:
    """A declined or expired request the customer never switched or cancelled, once the rental's
    first day has come. Nothing was charged, so there is nothing to refund."""
    today = timezone.localdate(now)
    ids = list(
        RentalBooking.objects.filter(
            status=RentalBooking.Status.AWAITING_TRANSPORT_QUOTE,
            start_date__lte=today,
            transport__status__in=(
                RentalTransportRequest.Status.DECLINED,
                RentalTransportRequest.Status.EXPIRED,
            ),
        ).values_list("id", flat=True)
    )
    cancelled = 0
    for booking_id in ids:
        with transaction.atomic():
            booking = RentalBooking.objects.select_for_update(of=("self",)).get(id=booking_id)
            if booking.status != RentalBooking.Status.AWAITING_TRANSPORT_QUOTE:
                continue
            booking.status = RentalBooking.Status.CANCELLED
            booking.save(update_fields=("status", "updated_at"))
            AssetReservation.objects.filter(id=booking.reservation_id).exclude(
                status=AssetReservation.Status.RELEASED
            ).update(status=AssetReservation.Status.RELEASED, updated_at=timezone.now())
            cancelled += 1
    return cancelled
