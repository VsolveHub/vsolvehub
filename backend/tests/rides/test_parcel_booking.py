"""Pick up & Drop booking: both ends, who pays, the PIN setting, and what is refused (§4.2)."""

from typing import Any

import pytest
from django.db import IntegrityError, transaction

from apps.partners.models import PartnerProfile
from apps.rides.models import ParcelDetails, Ride, RideKind, RideState
from tests.rides.helpers import customer_client, make_user, ready_captain
from tests.rides.parcel_world import (
    book_parcel,
    end,
    make_card,
    parcel_body,
    parcel_quote,
    served_area,
)
from tests.rides.ride_world import error_code, new_ride, quote_for

pytestmark = pytest.mark.django_db


def setup_booking() -> tuple[Any, Any, Any]:
    rider = make_user()
    card = make_card(served_area(), "BIKE", RideKind.PARCEL)
    return rider, customer_client(rider), parcel_quote(rider, card)


# --- success ----------------------------------------------------------------------------------


def test_a_parcel_books_and_keeps_both_ends() -> None:
    rider, client, quote = setup_booking()

    response = book_parcel(client, quote, parcel_body())

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "PARCEL"
    assert body["state"] == "SEARCHING"
    assert body["fare_paise"] == quote.fare_paise
    ride = Ride.objects.get(id=body["id"])
    assert ride.kind == RideKind.PARCEL
    assert ride.rider_id == rider.id
    parcel = ride.parcel
    assert (parcel.mode, parcel.payer, parcel.pin_required) == ("SEND", "SENDER", True)
    assert (parcel.pickup_name, parcel.pickup_phone) == ("Ravi Kumar", "9123456780")
    assert parcel.pickup_meet_at == "CURB"
    assert (parcel.drop_name, parcel.drop_phone, parcel.drop_building, parcel.drop_unit) == (
        "Asha Rao",
        "9876543210",
        "Sky Towers",
        "4B",
    )
    assert (parcel.drop_meet_at, parcel.drop_instructions) == ("DOOR", "Ring twice")
    quote.refresh_from_db()
    assert quote.consumed_at is not None


def test_the_booker_sees_the_parcel_block() -> None:
    _rider, client, quote = setup_booking()

    body = book_parcel(client, quote, parcel_body()).json()

    parcel = body["parcel"]
    assert parcel["mode"] == "SEND"
    assert parcel["pin_required"] is True
    assert parcel["pickup"]["name"] == "Ravi Kumar"
    assert parcel["drop"]["phone"] == "9876543210"
    assert parcel["return_fare_paise"] is None
    assert parcel["return_payment_status"] is None
    assert client.get(f"/api/v1/rides/{body['id']}/").json()["parcel"] == parcel


@pytest.mark.parametrize(
    ("mode", "payer", "payment_point"),
    [
        ("SEND", "SENDER", "PICKUP"),
        ("SEND", "RECEIVER", "DROP"),
        ("RECEIVE", "RECEIVER", "DROP"),
        ("RECEIVE", "SENDER", "PICKUP"),
    ],
)
def test_the_payer_decides_where_the_money_is_collected(
    mode: str, payer: str, payment_point: str
) -> None:
    """Who pays is its own choice, not a copy of sending or receiving (D9)."""
    _rider, client, quote = setup_booking()

    body = book_parcel(client, quote, parcel_body(mode=mode, payer=payer)).json()

    assert body["parcel"]["payment_point"] == payment_point
    stored = ParcelDetails.objects.get(ride_id=body["id"])
    assert (stored.mode, stored.payer) == (mode, payer)


def test_the_pin_setting_is_stored_when_off() -> None:
    _rider, client, quote = setup_booking()

    body = book_parcel(client, quote, parcel_body(pin_required=False)).json()

    assert ParcelDetails.objects.get(ride_id=body["id"]).pin_required is False


def test_instructions_may_be_exactly_120_characters_and_the_rest_is_optional() -> None:
    _rider, client, quote = setup_booking()
    drop = {"name": "Asha", "phone": "9876543210", "meet_at": "CURB", "instructions": "x" * 120}

    response = book_parcel(client, quote, parcel_body(drop=drop))

    assert response.status_code == 201


def test_a_retry_with_the_same_key_books_one_parcel() -> None:
    _rider, client, quote = setup_booking()

    first = book_parcel(client, quote, parcel_body(), key="same")
    again = book_parcel(client, quote, parcel_body(), key="same")

    assert first.json()["id"] == again.json()["id"]
    assert Ride.objects.count() == 1
    assert ParcelDetails.objects.count() == 1


# --- refused ----------------------------------------------------------------------------------


@pytest.mark.parametrize("side", ["pickup", "drop"])
@pytest.mark.parametrize("field", ["name", "phone"])
@pytest.mark.parametrize("how", ["blank", "missing"])
def test_a_name_or_phone_missing_at_either_end_is_422(side: str, field: str, how: str) -> None:
    _rider, client, quote = setup_booking()
    details = end()
    if how == "blank":
        details[field] = ""
    else:
        del details[field]

    response = book_parcel(client, quote, parcel_body(**{side: details}))

    assert response.status_code == 422
    assert error_code(response) == "parcel_details_required"
    assert not Ride.objects.exists()
    quote.refresh_from_db()
    assert quote.consumed_at is None  # the customer can fix the details and book again


def test_a_parcel_quote_without_parcel_details_is_422() -> None:
    _rider, client, quote = setup_booking()

    response = book_parcel(client, quote)

    assert response.status_code == 422
    assert error_code(response) == "parcel_details_required"
    assert not Ride.objects.exists()


@pytest.mark.parametrize(
    "phone", ["12345", "5876543210", "+919876543210", "98765432101", "98765 43210", "abcdefghij"]
)
def test_a_phone_that_is_not_a_10_digit_indian_mobile_is_400(phone: str) -> None:
    _rider, client, quote = setup_booking()

    response = book_parcel(client, quote, parcel_body(drop=end(phone=phone)))

    assert response.status_code == 400
    assert not Ride.objects.exists()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("meet_at", "LOBBY"),  # "Leave in lobby" is not offered (D24)
        ("instructions", "x" * 121),
        ("name", "x" * 81),
    ],
)
def test_other_bad_end_details_are_400(field: str, value: str) -> None:
    _rider, client, quote = setup_booking()

    response = book_parcel(client, quote, parcel_body(drop=end(**{field: value})))

    assert response.status_code == 400
    assert not Ride.objects.exists()


@pytest.mark.parametrize(
    "change", [{"mode": "GIVE"}, {"payer": "BOTH"}, {"pin_required": None}], ids=str
)
def test_mode_payer_and_pin_choice_must_be_valid(change: dict[str, Any]) -> None:
    _rider, client, quote = setup_booking()

    response = book_parcel(client, quote, parcel_body(**change))

    assert response.status_code == 400


def test_parcel_details_with_a_ride_quote_are_refused() -> None:
    rider = make_user()
    area = served_area()
    make_card(area, "BIKE")
    ride_quote = quote_for(rider, area)

    response = book_parcel(customer_client(rider), ride_quote, parcel_body())

    assert response.status_code == 400
    assert not Ride.objects.exists()


def test_a_ride_booking_without_parcel_details_is_unchanged() -> None:
    rider = make_user()
    area = served_area()
    make_card(area, "BIKE")

    ride = new_ride(rider, area)

    assert ride.kind == RideKind.RIDE
    assert ride.state == RideState.SEARCHING
    assert not ParcelDetails.objects.exists()


def test_a_parcel_card_switched_off_after_quoting_refuses_the_booking() -> None:
    """A live ride card must not keep a switched-off parcel card on sale."""
    rider = make_user()
    area = served_area()
    make_card(area, "BIKE")  # a ride card for the same vehicle stays active
    card = make_card(area, "BIKE", RideKind.PARCEL)
    quote = parcel_quote(rider, card)
    card.is_active = False
    card.save(update_fields=("is_active",))

    response = book_parcel(customer_client(rider), quote, parcel_body())

    assert response.status_code == 422
    assert error_code(response) == "vehicle_unavailable"
    assert not Ride.objects.exists()


def test_one_open_ride_per_rider_covers_parcels_too() -> None:
    rider, client, quote = setup_booking()
    assert book_parcel(client, quote, parcel_body(), key="a").status_code == 201
    second = parcel_quote(rider, quote.rate_card)

    response = book_parcel(client, second, parcel_body(), key="b")

    assert response.status_code == 409
    assert error_code(response) == "ride_already_open"


# --- database rules ---------------------------------------------------------------------------


def test_the_database_refuses_parcel_details_without_names_or_phones() -> None:
    _rider, client, quote = setup_booking()
    ride = Ride.objects.get(id=book_parcel(client, quote, parcel_body()).json()["id"])

    with pytest.raises(IntegrityError), transaction.atomic():
        ParcelDetails.objects.filter(ride=ride).update(drop_phone="")
    with pytest.raises(IntegrityError), transaction.atomic():
        ParcelDetails.objects.filter(ride=ride).update(pickup_name="")


def test_the_database_keeps_the_return_fare_and_its_status_together() -> None:
    _rider, client, quote = setup_booking()
    ride = Ride.objects.get(id=book_parcel(client, quote, parcel_body()).json()["id"])

    with pytest.raises(IntegrityError), transaction.atomic():
        ParcelDetails.objects.filter(ride=ride).update(return_fare_paise=2000)
    with pytest.raises(IntegrityError), transaction.atomic():
        ParcelDetails.objects.filter(ride=ride).update(return_payment_status="DUE")
    ParcelDetails.objects.filter(ride=ride).update(
        return_fare_paise=2000, return_payment_status="DUE"
    )


def test_the_database_allows_at_most_five_wrong_pins() -> None:
    _rider, client, quote = setup_booking()
    ride = Ride.objects.get(id=book_parcel(client, quote, parcel_body()).json()["id"])

    ParcelDetails.objects.filter(ride=ride).update(pin_attempts=5)
    with pytest.raises(IntegrityError), transaction.atomic():
        ParcelDetails.objects.filter(ride=ride).update(pin_attempts=6)


def test_only_a_parcel_can_be_returned() -> None:
    rider = make_user()
    area = served_area()
    make_card(area, "BIKE")
    ride = new_ride(rider, area)
    captain_user, _ = ready_captain()
    partner = PartnerProfile.objects.get(user=captain_user)

    # Everything else a returned ride needs is present, so only the kind rule can refuse it.
    with pytest.raises(IntegrityError, match="rides_only_a_parcel_returns"), transaction.atomic():
        Ride.objects.filter(id=ride.id).update(
            state=RideState.RETURNED, captain=partner, final_fare_paise=5100
        )
