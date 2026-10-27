"""Partner-arranged delivery: request -> quote -> accept and pay once -> deliver.

Owner decisions (Django_Next.js_Plan/M3/06-rental-pickup-delivery-and-item-options.md):
R-1 nothing is charged until the transport price is agreed, then rent + fee + deposit +
transport are one payment; R-5 transport commission is 0%.
"""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from apps.commerce.models import PaymentAttempt
from apps.payouts.models import PartnerLedgerEntry
from apps.rental import transport
from apps.rental.models import (
    AssetReservation,
    RentalBooking,
    RentalPlatformFee,
    RentalTransportRequest,
)
from apps.rental.services import (
    RentalStateError,
    cancel_booking,
    complete_rental_booking_payment,
    create_asset,
    create_booking,
    handover_booking,
    moderate_asset,
    return_booking,
    submit_asset,
)
from tests.rental.conftest import role_client

RATE = 50_000  # ₹500 a day
DEPOSIT = 100_000
QUOTE = 75_000  # ₹750 transport
ADDRESS = {
    "line": "Flat 302, Lake View Apartments",
    "area": "Gachibowli",
    "city": "Hyderabad",
    "pincode": "500032",
    "contact_phone": "+91 98765 43210",
}


def _asset(world, *, delivery=True, quantity=1):
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Stage lights",
        daily_rate_paise=RATE,
        deposit_paise=DEPOSIT,
        quantity_available=quantity,
        pickup_address_line="Shop 4, Main Road",
        pickup_area="Kukatpally",
        pickup_city="Hyderabad",
        pickup_pincode="500072",
        delivery_available=delivery,
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok for test")
    return asset


def _request(world, asset=None, *, days=2, start_in=3):
    asset = asset or _asset(world)
    start = timezone.localdate() + timedelta(days=start_in)
    return create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=days),
        mode="DELIVERY",
        delivery_address=ADDRESS,
        delivery_note="Third floor, lift available",
    )


def _quote(world, booking, amount=QUOTE, trip="ROUND_TRIP"):
    return transport.quote_transport(
        booking=booking, partner=world["partner"], amount_paise=amount, trip=trip, note="Tempo"
    )


def _paid(world, booking):
    booking = transport.accept_quote(booking=booking, customer=world["customer"])
    complete_rental_booking_payment(payment_attempt_id=booking.deposit.payment_attempt_id)
    booking.refresh_from_db()
    return booking


# --- request ---------------------------------------------------------------------------------


def test_delivery_request_charges_nothing_and_holds_the_dates(rental_world):
    booking = _request(rental_world)

    assert booking.status == RentalBooking.Status.AWAITING_TRANSPORT_QUOTE
    assert booking.pickup_or_delivery_mode == RentalBooking.Mode.DELIVERY
    assert booking.deposit.payment_attempt_id is None
    assert not PaymentAttempt.objects.exists()
    assert booking.reservation.status == AssetReservation.Status.TENTATIVE
    request = booking.transport
    assert request.status == RentalTransportRequest.Status.REQUESTED
    assert request.customer_note == "Third floor, lift available"
    assert booking.delivery_address["contact_phone"] == "9876543210"


def test_a_pending_request_blocks_the_last_unit(rental_world):
    asset = _asset(rental_world, quantity=1)
    _request(rental_world, asset)
    start = timezone.localdate() + timedelta(days=3)
    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start,
            end_date=start + timedelta(days=1),
        )
    assert refused.value.code == "out_of_stock"


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"line": ""}, "address"),
        ({"city": ""}, "city"),
        ({"pincode": "12345"}, "6-digit pincode"),
        ({"pincode": "012345"}, "6-digit pincode"),
        ({"contact_phone": "98765"}, "10-digit"),
    ],
)
def test_incomplete_delivery_address_is_refused(rental_world, change, message):
    asset = _asset(rental_world)
    start = timezone.localdate() + timedelta(days=3)
    with pytest.raises(RentalStateError, match=message) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start,
            end_date=start + timedelta(days=1),
            mode="DELIVERY",
            delivery_address={**ADDRESS, **change},
        )
    assert refused.value.code == "delivery_address_invalid"
    assert not RentalBooking.objects.exists()


def test_delivery_needs_a_day_to_arrange(rental_world):
    """The owner needs time to quote, so a delivery can't start today."""
    asset = _asset(rental_world)
    today = timezone.localdate()
    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=today,
            end_date=today + timedelta(days=1),
            mode="DELIVERY",
            delivery_address=ADDRESS,
        )
    assert refused.value.code == "delivery_too_soon"


def test_unknown_mode_is_refused(rental_world):
    asset = _asset(rental_world)
    start = timezone.localdate() + timedelta(days=3)
    with pytest.raises(RentalStateError) as refused:
        create_booking(
            customer=rental_world["customer"],
            asset_id=asset.id,
            start_date=start,
            end_date=start + timedelta(days=1),
            mode="DRONE",
        )
    assert refused.value.code == "rental_mode_invalid"


# --- quote -----------------------------------------------------------------------------------


def test_owner_quotes_a_price(rental_world):
    booking = _request(rental_world)
    request = _quote(rental_world, booking)
    assert request.status == RentalTransportRequest.Status.QUOTED
    assert request.quote_paise == QUOTE
    assert request.trip == RentalTransportRequest.Trip.ROUND_TRIP
    assert request.quote_count == 1
    # Still nothing charged.
    assert not PaymentAttempt.objects.exists()


@pytest.mark.parametrize(
    ("amount", "trip", "code"),
    [(0, "ONE_WAY", "transport_amount_invalid"), (QUOTE, "TELEPORT", "transport_trip_invalid")],
)
def test_bad_quotes_are_refused(rental_world, amount, trip, code):
    booking = _request(rental_world)
    with pytest.raises(RentalStateError) as refused:
        _quote(rental_world, booking, amount=amount, trip=trip)
    assert refused.value.code == code


def test_only_the_items_owner_can_quote(rental_world, django_user_model):
    from apps.partners.models import PartnerProfile  # noqa: PLC0415

    booking = _request(rental_world)
    stranger = PartnerProfile.objects.create(
        user=django_user_model.objects.create(phone_number="+919911129999", full_name="X"),
        display_name="Stranger",
    )
    with pytest.raises(PermissionError):
        transport.quote_transport(
            booking=booking, partner=stranger, amount_paise=QUOTE, trip="ONE_WAY"
        )


def test_quote_cannot_be_sent_twice_without_a_rejection(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    with pytest.raises(RentalStateError) as refused:
        _quote(rental_world, booking, amount=60_000)
    assert refused.value.code == "transport_state_invalid"


def test_rejected_quote_goes_back_to_the_owner_up_to_three_times(rental_world):
    booking = _request(rental_world)
    for n in range(1, 3):
        _quote(rental_world, booking, amount=QUOTE - n * 1_000)
        request = transport.reject_quote(
            booking=booking, customer=rental_world["customer"], note="Too high"
        )
        assert request.status == RentalTransportRequest.Status.REQUESTED
        assert request.reject_note == "Too high"
    _quote(rental_world, booking, amount=50_000)
    last = transport.reject_quote(booking=booking, customer=rental_world["customer"])
    assert last.quote_count == RentalTransportRequest.MAX_QUOTES
    assert last.status == RentalTransportRequest.Status.DECLINED
    booking.reservation.refresh_from_db()
    assert booking.reservation.status == AssetReservation.Status.RELEASED


# --- accept and pay --------------------------------------------------------------------------


def test_accept_starts_one_payment_for_rent_fee_deposit_and_transport(rental_world):
    RentalPlatformFee.objects.update_or_create(pk=1, defaults={"percent": 10})
    booking = _request(rental_world, days=2)
    _quote(rental_world, booking)
    booking = transport.accept_quote(booking=booking, customer=rental_world["customer"])

    rent = RATE * 2
    fee = rent // 10
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    assert booking.transport_paise == QUOTE
    assert booking.transport_fee_percent == 0
    assert booking.transport_fee_paise == 0
    attempts = PaymentAttempt.objects.all()
    assert attempts.count() == 1
    attempt = attempts.get()
    assert attempt.purpose == PaymentAttempt.Purpose.A7_RENTAL_BOOKING
    assert attempt.amount_paise == rent + fee + DEPOSIT + QUOTE
    assert booking.deposit.payment_attempt_id == attempt.id


def test_accept_twice_charges_once(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    transport.accept_quote(booking=booking, customer=rental_world["customer"])
    with pytest.raises(RentalStateError):
        transport.accept_quote(booking=booking, customer=rental_world["customer"])
    assert PaymentAttempt.objects.count() == 1


def test_another_customer_cannot_accept(rental_world, django_user_model):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    other = django_user_model.objects.create(phone_number="+919911128888", full_name="Other")
    with pytest.raises(PermissionError):
        transport.accept_quote(booking=booking, customer=other)


def test_capture_confirms_booking_and_reservation(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    booking = _paid(rental_world, booking)
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert booking.reservation.status == AssetReservation.Status.CONFIRMED
    assert booking.transport.status == RentalTransportRequest.Status.ACCEPTED


def test_abandoned_payment_cancels_like_pickup(rental_world):
    from apps.rental.services import release_booking_for_expired_payment  # noqa: PLC0415

    booking = _request(rental_world)
    _quote(rental_world, booking)
    booking = transport.accept_quote(booking=booking, customer=rental_world["customer"])
    release_booking_for_expired_payment(payment_attempt_id=booking.deposit.payment_attempt_id)
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED
    assert booking.transport.status == RentalTransportRequest.Status.CANCELLED
    assert booking.reservation.status == AssetReservation.Status.RELEASED


# --- delivery --------------------------------------------------------------------------------


def test_out_for_delivery_needs_payment_first(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    transport.accept_quote(booking=booking, customer=rental_world["customer"])
    with pytest.raises(RentalStateError) as refused:
        transport.mark_out_for_delivery(booking=booking, partner=rental_world["partner"])
    assert refused.value.code == "transport_state_invalid"


def test_handover_with_pin_marks_delivered(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    booking = _paid(rental_world, booking)
    transport.mark_out_for_delivery(booking=booking, partner=rental_world["partner"])
    handed = handover_booking(
        booking=booking, partner=rental_world["partner"], pin=booking.handover_pin_hash
    )
    assert handed.status == RentalBooking.Status.HANDOVER
    request = RentalTransportRequest.objects.get(booking=booking)
    assert request.status == RentalTransportRequest.Status.DELIVERED
    assert request.delivered_at is not None


def test_earning_includes_transport_at_zero_commission(rental_world):
    RentalPlatformFee.objects.update_or_create(pk=1, defaults={"percent": 10})
    booking = _request(rental_world, days=2)
    _quote(rental_world, booking)
    booking = _paid(rental_world, booking)
    booking = handover_booking(
        booking=booking, partner=rental_world["partner"], pin=booking.handover_pin_hash
    )
    return_booking(booking=booking, partner=rental_world["partner"])

    entry = PartnerLedgerEntry.objects.get(
        rental_booking=booking, kind=PartnerLedgerEntry.Kind.EARNING
    )
    rent = RATE * 2
    fee = rent // 10
    assert entry.gross_paise == rent + QUOTE
    assert entry.commission_paise == fee
    assert entry.net_paise == rent - fee + QUOTE
    assert entry.calculation_snapshot["transport_paise"] == QUOTE
    assert entry.calculation_snapshot["transport_fee_paise"] == 0


# --- decline, expiry, switch, cancel ---------------------------------------------------------


def test_decline_releases_dates_and_charges_nothing(rental_world):
    booking = _request(rental_world)
    request = transport.decline_transport(
        booking=booking, partner=rental_world["partner"], reason="No vehicle that day"
    )
    assert request.status == RentalTransportRequest.Status.DECLINED
    assert request.decline_reason == "No vehicle that day"
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.AWAITING_TRANSPORT_QUOTE
    assert booking.reservation.status == AssetReservation.Status.RELEASED
    assert not PaymentAttempt.objects.exists()


def test_switch_to_pickup_after_decline_charges_the_pickup_amount(rental_world):
    booking = _request(rental_world, days=2)
    transport.decline_transport(booking=booking, partner=rental_world["partner"])
    booking = transport.switch_to_pickup(booking=booking, customer=rental_world["customer"])

    assert booking.pickup_or_delivery_mode == RentalBooking.Mode.PICKUP
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    assert booking.transport_paise == 0
    assert booking.reservation.status == AssetReservation.Status.CONFIRMED
    attempt = PaymentAttempt.objects.get()
    assert attempt.amount_paise == RATE * 2 + DEPOSIT


def test_switch_to_pickup_while_quote_is_open_cancels_the_request(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    booking = transport.switch_to_pickup(booking=booking, customer=rental_world["customer"])
    assert booking.transport.status == RentalTransportRequest.Status.CANCELLED


def test_switch_to_pickup_refuses_when_the_dates_were_taken(rental_world):
    asset = _asset(rental_world, quantity=1)
    booking = _request(rental_world, asset)
    transport.decline_transport(booking=booking, partner=rental_world["partner"])
    start = timezone.localdate() + timedelta(days=3)
    create_booking(
        customer=rental_world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    with pytest.raises(RentalStateError) as refused:
        transport.switch_to_pickup(booking=booking, customer=rental_world["customer"])
    assert refused.value.code == "out_of_stock"


def test_switch_to_pickup_refused_after_accepting(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    transport.accept_quote(booking=booking, customer=rental_world["customer"])
    with pytest.raises(RentalStateError):
        transport.switch_to_pickup(booking=booking, customer=rental_world["customer"])


def test_expiry_sweep_ends_unanswered_requests(rental_world):
    booking = _request(rental_world)
    RentalTransportRequest.objects.filter(booking=booking).update(
        respond_by=timezone.now() - timedelta(minutes=1)
    )
    assert transport.expire_transport_requests() == 1
    booking.refresh_from_db()
    assert booking.transport.status == RentalTransportRequest.Status.EXPIRED
    assert booking.reservation.status == AssetReservation.Status.RELEASED
    # A second sweep finds nothing new.
    assert transport.expire_transport_requests() == 0


def test_expired_quote_cannot_be_accepted(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    RentalTransportRequest.objects.filter(booking=booking).update(
        respond_by=timezone.now() - timedelta(seconds=1)
    )
    with pytest.raises(RentalStateError) as refused:
        transport.accept_quote(booking=booking, customer=rental_world["customer"])
    assert refused.value.code == "quote_expired"


def test_quote_deadline_never_passes_the_start_of_the_rental(rental_world):
    booking = _request(rental_world, start_in=1)
    start_of_day = timezone.make_aware(datetime.combine(booking.start_date, datetime.min.time()))
    assert booking.transport.respond_by <= start_of_day


def test_abandoned_declined_request_is_cancelled_on_its_start_day(rental_world):
    booking = _request(rental_world)
    transport.decline_transport(booking=booking, partner=rental_world["partner"])
    later = timezone.now() + timedelta(days=4)
    transport.expire_transport_requests(now=later)
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED


def test_cancel_before_payment_charges_nothing(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    cancelled = cancel_booking(booking=booking, customer=rental_world["customer"])
    assert cancelled.status == RentalBooking.Status.CANCELLED
    assert cancelled.transport.status == RentalTransportRequest.Status.CANCELLED
    assert not PaymentAttempt.objects.exists()


def test_cancel_after_payment_refunds_the_whole_charge_including_transport(rental_world):
    booking = _request(rental_world)
    _quote(rental_world, booking)
    booking = _paid(rental_world, booking)
    attempt = booking.deposit.payment_attempt
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.save(update_fields=("status", "updated_at"))

    cancel_booking(booking=booking, customer=rental_world["customer"])
    refund = attempt.refunds.get()
    assert refund.amount_paise == attempt.amount_paise


# --- API -------------------------------------------------------------------------------------


def test_delivery_round_trip_over_http(rental_world):
    asset = _asset(rental_world)
    customer = role_client(rental_world["customer"], "customer")
    owner = role_client(rental_world["owner"], "partner")
    start = timezone.localdate() + timedelta(days=3)

    booked = customer.post(
        "/api/v1/rentals/book",
        {
            "asset_id": str(asset.id),
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=1)).isoformat(),
            "pickup_or_delivery_mode": "DELIVERY",
            "delivery_address": ADDRESS,
            "delivery_note": "Gate 2",
        },
        format="json",
    )
    assert booked.status_code == status.HTTP_201_CREATED
    body = booked.json()
    assert body["status"] == "AWAITING_TRANSPORT_QUOTE"
    assert body["transport"]["status"] == "REQUESTED"
    assert body["deposit"]["payment_attempt_id"] is None
    booking_id = body["id"]

    quoted = owner.post(
        f"/api/v1/partner/rentals/bookings/{booking_id}/transport/quote",
        {"amount_paise": QUOTE, "trip": "ONE_WAY", "note": "Auto"},
        format="json",
    )
    assert quoted.status_code == status.HTTP_200_OK
    assert quoted.json()["transport"]["quote_paise"] == QUOTE

    accepted = customer.post(f"/api/v1/me/rentals/{booking_id}/transport/accept", {}, format="json")
    assert accepted.status_code == status.HTTP_200_OK
    paid = accepted.json()
    assert paid["status"] == "PENDING_PAYMENT"
    assert paid["deposit"]["payment_attempt_id"]
    assert paid["amount_due_paise"] == RATE + DEPOSIT + QUOTE


@pytest.mark.django_db
def test_platform_fee_endpoint_shows_zero_transport_commission(client):
    response = client.get("/api/v1/rentals/platform-fee")
    assert response.json()["transport_fee_percent"] == 0


def test_partner_transport_unknown_action_is_refused(rental_world):
    booking = _request(rental_world)
    owner = role_client(rental_world["owner"], "partner")
    response = owner.post(
        f"/api/v1/partner/rentals/bookings/{booking.id}/transport/teleport", {}, format="json"
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# --- the delivery pin -----------------------------------------------------------------------

PIN = {"latitude": "17.440000", "longitude": "78.350000"}


def _book_with(world, address):
    asset = _asset(world)
    start = timezone.localdate() + timedelta(days=3)
    return create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        mode="DELIVERY",
        delivery_address=address,
    )


def test_the_delivery_pin_is_kept_and_routes_the_owner(rental_world):
    from apps.rental.serializers import PartnerRentalBookingSerializer  # noqa: PLC0415

    booking = _book_with(rental_world, {**ADDRESS, **PIN})

    assert booking.delivery_address["latitude"] == "17.440000"
    assert booking.delivery_address["longitude"] == "78.350000"
    data = PartnerRentalBookingSerializer(booking).data
    assert data["delivery_directions_url"] == (
        "https://www.google.com/maps/dir/?api=1&destination=17.440000,78.350000"
    )


def test_an_address_without_a_pin_still_books_with_no_route(rental_world):
    from apps.rental.serializers import PartnerRentalBookingSerializer  # noqa: PLC0415

    booking = _book_with(rental_world, ADDRESS)

    assert "latitude" not in booking.delivery_address
    assert PartnerRentalBookingSerializer(booking).data["delivery_directions_url"] == ""


@pytest.mark.parametrize(
    "pin",
    [
        {"latitude": "17.440000"},
        {"latitude": "91", "longitude": "78.35"},
        {"latitude": "not-a-number", "longitude": "78.35"},
    ],
)
def test_a_broken_pin_is_refused_not_half_kept(rental_world, pin):
    with pytest.raises(RentalStateError) as refused:
        _book_with(rental_world, {**ADDRESS, **pin})

    assert refused.value.code == "delivery_address_invalid"
    assert not RentalBooking.objects.exists()


def test_the_booking_api_refuses_half_a_pin(rental_world):
    asset = _asset(rental_world)
    start = timezone.localdate() + timedelta(days=3)
    client = role_client(rental_world["customer"], "customer")

    response = client.post(
        "/api/v1/rentals/book",
        {
            "asset_id": str(asset.id),
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=1)).isoformat(),
            "pickup_or_delivery_mode": "DELIVERY",
            "delivery_address": {**ADDRESS, "latitude": "17.44"},
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "pin_incomplete" in str(response.json()["error"]["details"])
