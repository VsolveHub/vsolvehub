"""Paid stay reservations stay closed until hosts can be paid (`STAY_PAID_RESERVATIONS_ENABLED`).

A paid stay is collected by V Solve Hub in full, and nothing yet pays the host, takes a
commission or accounts for the GST on accommodation. Every live stay is in enquiry mode, which
takes no payment; this keeps a paid one from being opened by a configuration change alone.
"""

from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.stay.models import StayReservation
from apps.stay.services import (
    StayStateError,
    create_property,
    create_reservation,
    moderate_property,
    submit_property,
)
from tests.stay.test_a9_flow import stay_world  # noqa: F401


def _published(stay_world):  # noqa: F811
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Closed PG",
        nightly_rate_paise=90000,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok")
    return prop


def _reserve(stay_world, prop):  # noqa: F811
    check_in = timezone.localdate() + timedelta(days=3)
    return create_reservation(
        customer=stay_world["guest"],
        property_id=prop.id,
        unit_id=prop.units.first().id,
        check_in=check_in,
        check_out=check_in + timedelta(days=2),
        guest_count=1,
    )


@pytest.mark.django_db
@override_settings(STAY_PAID_RESERVATIONS_ENABLED=False)
def test_a_paid_stay_is_refused_while_hosts_cannot_be_paid(stay_world):  # noqa: F811
    prop = _published(stay_world)

    with pytest.raises(StayStateError) as refused:
        _reserve(stay_world, prop)

    assert refused.value.code == "stay_paid_reservations_closed"
    assert not StayReservation.objects.filter(property=prop).exists()
    assert not PaymentAttempt.objects.filter(
        purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION
    ).exists()


@pytest.mark.django_db
@override_settings(STAY_PAID_RESERVATIONS_ENABLED=True)
def test_a_paid_stay_works_once_switched_on(stay_world):  # noqa: F811
    prop = _published(stay_world)

    reservation = _reserve(stay_world, prop)

    assert reservation.status == StayReservation.Status.HELD


def test_paid_stays_are_closed_by_default() -> None:
    from config.settings import base  # noqa: PLC0415

    assert base.STAY_PAID_RESERVATIONS_ENABLED is False
