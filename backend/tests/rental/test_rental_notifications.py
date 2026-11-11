"""Who hears what, and when, across a rental booking.

Every rental notice is in-app: a row in the recipient's feed for the side (customer, partner or
Operations) it speaks to. These tests pin three things the feature kept getting wrong:

* every template a rental notice names is registered — an unregistered one is refused at write
  time and, because rental notices are best-effort, silently dropped;
* the customer is told "confirmed" (with their PIN) only once the booking is paid for;
* each step after that tells the side that did not take it.
"""

import re
from datetime import timedelta
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.identity.models import Role, UserRole
from apps.notifications.models import NotificationIntent
from apps.notifications.serializers import NotificationSerializer
from apps.notifications.templates_registry import registered_template_codes, render_notification
from apps.rental import transport
from apps.rental.models import AssetReservation, RentalBooking
from apps.rental.services import (
    cancel_booking,
    complete_rental_booking_payment,
    create_asset,
    create_booking,
    decide_deposit_dispute,
    dispute_deposit,
    handover_booking,
    mark_deposit_held,
    moderate_asset,
    release_booking_for_expired_payment,
    release_deposit,
    return_booking,
    send_overdue_return_reminders,
    submit_asset,
)

User = get_user_model()

RATE = 50000
DEPOSIT = 100000
QUOTE = 75000
LISTABLE = {
    "image_urls": ["https://cdn.example.com/lights.jpg"],
    "pickup_address_line": "Shop 4, Main Road",
    "pickup_area": "Kukatpally",
    "pickup_city": "Hyderabad",
    "pickup_pincode": "500072",
}
ADDRESS = {
    "line": "Flat 302, Lake View Apartments",
    "area": "Gachibowli",
    "city": "Hyderabad",
    "pincode": "500032",
    "contact_phone": "+91 98765 43210",
}
RENTAL_CODE = Path(__file__).resolve().parents[2] / "apps" / "rental"


# --- helpers ---------------------------------------------------------------------------------


def _asset(world, *, deposit=DEPOSIT, delivery=False):
    asset = create_asset(
        partner=world["partner"],
        variant_id=world["variant"].id,
        title="Stage lights",
        daily_rate_paise=RATE,
        deposit_paise=deposit,
        delivery_available=delivery,
        **LISTABLE,
    )
    submit_asset(asset=asset, partner=world["partner"])
    moderate_asset(asset=asset, actor=world["owner"], action="APPROVE", reason="ok for test")
    return asset


def _book(world, *, demo=False, start_in=3, deposit=DEPOSIT):
    asset = _asset(world, deposit=deposit)
    start = timezone.localdate() + timedelta(days=start_in)
    return create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        hold_deposit_for_demo=demo,
    )


def _pay(booking):
    complete_rental_booking_payment(payment_attempt_id=booking.deposit.payment_attempt_id)
    booking.refresh_from_db()
    return booking


def _sent(template_code, *, to=None):
    rows = NotificationIntent.objects.filter(template_code=template_code)
    if to is not None:
        rows = rows.filter(recipient=to)
    return list(rows)


def _one(template_code, *, to):
    rows = _sent(template_code, to=to)
    assert len(rows) == 1, f"expected one {template_code} for {to}, got {len(rows)}"
    return rows[0]


def _codes():
    return set(NotificationIntent.objects.values_list("template_code", flat=True))


def _operations_user():
    user = User.objects.create(phone_number="+919911129999", full_name="Ops Person")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture(autouse=True)
def _every_notice_renders(db):  # noqa: ARG001
    """Whatever a test sends must render: a missing context key would break the feed."""
    yield
    for intent in NotificationIntent.objects.all():
        rendered = render_notification(template_code=intent.template_code, context=intent.context)
        assert "{" not in rendered.title + rendered.body, intent.template_code


# --- templates -------------------------------------------------------------------------------


def test_every_rental_notice_names_a_registered_template():
    source = "\n".join(p.read_text() for p in RENTAL_CODE.glob("*.py"))
    used = set(re.findall(r'template_code="([a-z0-9_]+)"', source))
    used |= set(
        re.findall(r'_notify_(?:owner|customer|operations)\(\s*\w+,\s*"([a-z0-9_]+)"', source)
    )
    assert len(used) > 15  # the pattern still finds the calls
    assert used - registered_template_codes() == set()


# --- booking and payment ---------------------------------------------------------------------


def test_unpaid_booking_tells_nobody(rental_world):
    booking = _book(rental_world)
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    assert _codes() == set()


def test_payment_confirms_to_both_sides_with_the_pin(rental_world):
    booking = _pay(_book(rental_world))
    assert booking.status == RentalBooking.Status.CONFIRMED
    customer_notice = _one("rental_booking_confirmed", to=rental_world["customer"])
    assert customer_notice.audience == NotificationIntent.Audience.CUSTOMER
    assert customer_notice.context["pin"] == booking.handover_pin_hash
    owner_notice = _one("rental_new_booking", to=rental_world["owner"])
    assert owner_notice.audience == NotificationIntent.Audience.PARTNER


def test_payment_replay_does_not_notify_twice(rental_world):
    booking = _pay(_book(rental_world))
    complete_rental_booking_payment(payment_attempt_id=booking.deposit.payment_attempt_id)
    assert len(_sent("rental_booking_confirmed")) == 1


@pytest.mark.parametrize("capture", ["booking", "deposit"])
def test_item_without_a_deposit_is_confirmed_when_paid(rental_world, capture):
    """A zero deposit is HELD from the start; the rent payment must still confirm the booking."""
    booking = _book(rental_world, deposit=0)
    assert booking.status == RentalBooking.Status.PENDING_PAYMENT
    attempt_id = booking.deposit.payment_attempt_id
    confirm = complete_rental_booking_payment if capture == "booking" else mark_deposit_held
    confirm(payment_attempt_id=attempt_id)
    confirm(payment_attempt_id=attempt_id)  # a replayed callback changes nothing
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CONFIRMED
    assert booking.reservation.status == AssetReservation.Status.CONFIRMED
    _one("rental_booking_confirmed", to=rental_world["customer"])
    _one("rental_new_booking", to=rental_world["owner"])


def test_deposit_capture_path_also_confirms(rental_world):
    booking = _book(rental_world)
    mark_deposit_held(payment_attempt_id=booking.deposit.payment_attempt_id)
    _one("rental_booking_confirmed", to=rental_world["customer"])
    _one("rental_new_booking", to=rental_world["owner"])


def test_nothing_to_pay_confirms_straight_away(rental_world):
    booking = _book(rental_world, demo=True)
    assert booking.status == RentalBooking.Status.CONFIRMED
    _one("rental_booking_confirmed", to=rental_world["customer"])
    _one("rental_new_booking", to=rental_world["owner"])


def test_expired_payment_tells_the_customer_only(rental_world):
    booking = _book(rental_world)
    release_booking_for_expired_payment(payment_attempt_id=booking.deposit.payment_attempt_id)
    _one("rental_payment_expired", to=rental_world["customer"])
    assert _sent("rental_booking_cancelled_owner") == []


def test_booking_notices_open_the_booking(rental_world):
    booking = _book(rental_world, demo=True)
    notice = _one("rental_booking_confirmed", to=rental_world["customer"])
    target = NotificationSerializer(notice).data["target"]
    assert target == {"kind": "RENTAL_BOOKING", "id": str(booking.id)}


# --- handover, return, deposit ---------------------------------------------------------------


def _handed_over(world):
    booking = _book(world, demo=True)
    return handover_booking(
        booking=booking, partner=world["partner"], pin=booking.handover_pin_hash
    )


def test_handover_and_return_tell_the_customer(rental_world):
    booking = _handed_over(rental_world)
    _one("rental_handed_over_customer", to=rental_world["customer"])
    return_booking(booking=booking, partner=rental_world["partner"])
    _one("rental_returned_customer", to=rental_world["customer"])


def test_deposit_release_tells_the_customer_the_amount(rental_world):
    booking = _handed_over(rental_world)
    return_booking(booking=booking, partner=rental_world["partner"])
    release_deposit(booking=booking, partner=rental_world["partner"])
    notice = _one("rental_return_confirmed", to=rental_world["customer"])
    assert notice.context["deposit_amount"] == "1,000"


# --- damage claims ---------------------------------------------------------------------------


def _disputed(world, consume=30000):
    booking = _handed_over(world)
    return_booking(booking=booking, partner=world["partner"])
    return dispute_deposit(
        booking=booking, partner=world["partner"], reason="Cracked lens", consume_paise=consume
    )


def test_claim_tells_the_customer_and_operations(rental_world):
    ops = _operations_user()
    _disputed(rental_world)
    notice = _one("rental_claim_raised", to=rental_world["customer"])
    assert notice.context["amount_asked"] == "300"
    staff = _one("rental_new_claim", to=ops)
    assert staff.audience == NotificationIntent.Audience.OPERATIONS


def test_approved_claim_tells_both_sides_the_split(rental_world):
    ops = _operations_user()
    booking = _disputed(rental_world)
    decide_deposit_dispute(booking=booking, actor=ops, decision="APPROVE")
    customer = _one("rental_claim_decided_customer", to=rental_world["customer"])
    assert (customer.context["refund_amount"], customer.context["deducted_amount"]) == (
        "700",
        "300",
    )
    owner = _one("rental_admin_claim_decision_owner", to=rental_world["owner"])
    assert owner.context["approved_amount"] == "300"


def test_rejected_claim_says_so_to_both_sides(rental_world):
    ops = _operations_user()
    booking = _disputed(rental_world)
    decide_deposit_dispute(booking=booking, actor=ops, decision="REJECT")
    _one("rental_claim_rejected_customer", to=rental_world["customer"])
    _one("rental_claim_rejected_owner", to=rental_world["owner"])
    assert _sent("rental_admin_claim_decision_owner") == []


# --- cancellation ----------------------------------------------------------------------------


def test_customer_cancelling_a_paid_booking_tells_the_owner(rental_world):
    booking = _book(rental_world, demo=True)
    cancel_booking(booking=booking, customer=rental_world["customer"])
    _one("rental_booking_cancelled_owner", to=rental_world["owner"])
    assert _sent("rental_booking_cancelled_customer") == []


def test_customer_dropping_an_unpaid_checkout_tells_nobody(rental_world):
    booking = _book(rental_world)
    cancel_booking(booking=booking, customer=rental_world["customer"])
    assert _codes() == set()


def test_owner_cancelling_tells_the_customer(rental_world):
    booking = _book(rental_world, demo=True)
    cancel_booking(booking=booking, partner=rental_world["partner"])
    _one("rental_booking_cancelled_customer", to=rental_world["customer"])
    assert _sent("rental_booking_cancelled_owner") == []


def test_operations_cancelling_tells_both_sides(rental_world):
    booking = _book(rental_world, demo=True)
    cancel_booking(booking=booking, is_ops=True, reason="Item withdrawn")
    _one("rental_booking_cancelled_customer", to=rental_world["customer"])
    _one("rental_booking_cancelled_owner", to=rental_world["owner"])


# --- overdue ---------------------------------------------------------------------------------


def _overdue(world, *, days_late):
    booking = _handed_over(world)
    end = timezone.localdate() - timedelta(days=days_late)
    RentalBooking.objects.filter(id=booking.id).update(
        start_date=end - timedelta(days=2), end_date=end
    )
    return booking


def test_overdue_item_reminds_owner_and_customer_once(rental_world):
    ops = _operations_user()
    _overdue(rental_world, days_late=1)
    assert send_overdue_return_reminders() == 1
    send_overdue_return_reminders()
    _one("rental_overdue_return_owner", to=rental_world["owner"])
    _one("rental_overdue_return_customer", to=rental_world["customer"])
    assert _sent("rental_overdue_for_admin", to=ops) == []


def test_operations_hears_once_an_item_is_two_days_late(rental_world):
    ops = _operations_user()
    _overdue(rental_world, days_late=2)
    send_overdue_return_reminders()
    send_overdue_return_reminders()
    _one("rental_overdue_for_admin", to=ops)


def test_an_item_due_today_is_not_overdue(rental_world):
    _overdue(rental_world, days_late=0)
    assert send_overdue_return_reminders() == 0


# --- delivery --------------------------------------------------------------------------------


def _delivery_request(world):
    asset = _asset(world, delivery=True)
    start = timezone.localdate() + timedelta(days=3)
    return create_booking(
        customer=world["customer"],
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        mode="DELIVERY",
        delivery_address=ADDRESS,
    )


def test_delivery_flow_notifies_each_step(rental_world):
    world = rental_world
    booking = _delivery_request(world)
    _one("rental_delivery_requested", to=world["owner"])

    transport.quote_transport(
        booking=booking, partner=world["partner"], amount_paise=QUOTE, trip="ROUND_TRIP"
    )
    quoted = _one("rental_delivery_quoted", to=world["customer"])
    assert quoted.context["quote_amount"] == "750"

    transport.reject_quote(booking=booking, customer=world["customer"], note="Too much")
    _one("rental_delivery_quote_rejected", to=world["owner"])

    transport.quote_transport(
        booking=booking, partner=world["partner"], amount_paise=QUOTE, trip="ROUND_TRIP"
    )
    booking = transport.accept_quote(booking=booking, customer=world["customer"])
    _one("rental_delivery_quote_accepted", to=world["owner"])
    assert _sent("rental_booking_confirmed") == []

    booking = _pay(booking)
    _one("rental_booking_confirmed", to=world["customer"])
    _one("rental_new_booking", to=world["owner"])

    transport.mark_out_for_delivery(booking=booking, partner=world["partner"])
    _one("rental_out_for_delivery", to=world["customer"])


def test_declined_and_expired_delivery_tell_the_customer(rental_world):
    world = rental_world
    declined = _delivery_request(world)
    transport.decline_transport(booking=declined, partner=world["partner"])
    _one("rental_delivery_declined", to=world["customer"])

    _delivery_request(world)
    transport.expire_transport_requests(now=timezone.now() + timedelta(days=5))
    _one("rental_delivery_expired", to=world["customer"])
