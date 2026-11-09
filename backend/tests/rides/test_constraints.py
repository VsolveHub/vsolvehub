"""Database rules on the rides tables: a bug in a service must not be able to write these rows."""

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import PartnerProfile
from apps.rides.models import (
    ActorKind,
    CaptainDutySession,
    CaptainPass,
    CaptainPassPlan,
    FareQuote,
    Ride,
    RideOffer,
    RideRateCard,
    RideRating,
    RideSosEvent,
    RideState,
    RideTrackPoint,
    RideTransition,
    VehicleType,
)
from tests.rides.helpers import make_user, start_application

pytestmark = pytest.mark.django_db


def make_area() -> ServiceArea:
    return ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Madhapur", timezone="Asia/Kolkata"
    )


def make_card(area: ServiceArea, **overrides: Any) -> RideRateCard:
    fields: dict[str, Any] = {
        "service_area": area,
        "vehicle_type": VehicleType.BIKE,
        "base_fare_paise": 2000,
        "included_distance_m": 2000,
        "per_km_paise": 800,
        "per_minute_paise": 100,
        "minimum_fare_paise": 3000,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
    }
    fields.update(overrides)
    return RideRateCard.objects.create(**fields)


def test_only_one_active_rate_card_per_area_and_vehicle_type() -> None:
    area = make_area()
    make_card(area)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, version=2)


def test_new_version_allowed_once_the_old_card_is_inactive() -> None:
    area = make_area()
    old = make_card(area)
    old.is_active = False
    old.save()

    new = make_card(area, version=2)

    assert new.is_active
    assert RideRateCard.objects.filter(service_area=area, is_active=True).get() == new


def test_each_vehicle_type_has_its_own_active_card() -> None:
    area = make_area()
    for vehicle_type in VehicleType.values:
        make_card(area, vehicle_type=vehicle_type)

    assert RideRateCard.objects.filter(service_area=area, is_active=True).count() == 3


def test_version_cannot_repeat_for_the_same_area_and_vehicle_type() -> None:
    area = make_area()
    make_card(area, is_active=False)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, is_active=False)


def test_version_starts_at_one() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(make_area(), version=0)


@pytest.mark.parametrize(
    "field",
    [
        "base_fare_paise",
        "per_km_paise",
        "per_minute_paise",
        "minimum_fare_paise",
        "waiting_per_minute_paise",
    ],
)
def test_money_is_never_negative(field: str) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(make_area(), **{field: -1})


# --- builders ---------------------------------------------------------------------------------


def make_captain() -> PartnerProfile:
    return start_application(make_user("Ravi Captain")).partner


def make_quote(rider: User, area: ServiceArea | None = None) -> FareQuote:
    area = area or make_area()
    card = RideRateCard.objects.filter(service_area=area).first() or make_card(area)
    return FareQuote.objects.create(
        rider=rider,
        service_area=area,
        vehicle_type=card.vehicle_type,
        rate_card=card,
        rate_card_version=card.version,
        pickup_latitude=Decimal("17.44"),
        pickup_longitude=Decimal("78.35"),
        pickup_label="Gachibowli",
        drop_latitude=Decimal("17.45"),
        drop_longitude=Decimal("78.38"),
        drop_label="Hitech City",
        distance_m=3000,
        duration_s=600,
        route_polyline="abc",
        fare_paise=5400,
        expires_at=timezone.now() + timedelta(minutes=5),
    )


def make_ride(rider: User | None = None, **overrides: Any) -> Ride:
    rider = rider or make_user("Priya Rider")
    quote = overrides.pop("quote", None) or make_quote(rider)
    fields: dict[str, Any] = {
        "rider": rider,
        "quote": quote,
        "service_area": quote.service_area,
        "vehicle_type": quote.vehicle_type,
        "pickup_latitude": quote.pickup_latitude,
        "pickup_longitude": quote.pickup_longitude,
        "pickup_label": quote.pickup_label,
        "drop_latitude": quote.drop_latitude,
        "drop_longitude": quote.drop_longitude,
        "drop_label": quote.drop_label,
        "fare_paise": quote.fare_paise,
    }
    fields.update(overrides)
    return Ride.objects.create(**fields)


def make_plan(**overrides: Any) -> CaptainPassPlan:
    fields: dict[str, Any] = {
        "code": f"day-{uuid.uuid4().hex[:6]}",
        "name": "Day pass",
        "price_paise": 4900,
        "duration_hours": 24,
    }
    fields.update(overrides)
    return CaptainPassPlan.objects.create(**fields)


def active_pass(captain: PartnerProfile, plan: CaptainPassPlan | None = None) -> CaptainPass:
    now = timezone.now()
    return CaptainPass.objects.create(
        partner=captain,
        plan=plan or make_plan(),
        status=CaptainPass.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(hours=24),
    )


# --- commerce ---------------------------------------------------------------------------------


def test_captain_pass_is_a_checkout_free_payment_purpose() -> None:
    assert PaymentAttempt.Purpose.RIDE_CAPTAIN_PASS in PaymentAttempt.CHECKOUT_FREE_PURPOSES


# --- passes -----------------------------------------------------------------------------------


def test_pass_plan_code_is_unique() -> None:
    make_plan(code="day-pass")
    with pytest.raises(IntegrityError), transaction.atomic():
        make_plan(code="day-pass")


def test_pass_plan_lasts_at_least_an_hour() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_plan(duration_hours=0)


def test_a_free_plan_is_allowed() -> None:
    assert make_plan(price_paise=0).price_paise == 0


def test_only_one_active_pass_per_captain() -> None:
    captain = make_captain()
    active_pass(captain)
    with pytest.raises(IntegrityError), transaction.atomic():
        active_pass(captain)


def test_pending_passes_do_not_count_as_active() -> None:
    captain = make_captain()
    plan = make_plan()
    active_pass(captain, plan)
    CaptainPass.objects.create(partner=captain, plan=plan)
    CaptainPass.objects.create(partner=captain, plan=plan)
    assert CaptainPass.objects.filter(partner=captain).count() == 3


def test_an_active_pass_must_have_a_window() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        CaptainPass.objects.create(
            partner=make_captain(), plan=make_plan(), status=CaptainPass.Status.ACTIVE
        )


# --- duty -------------------------------------------------------------------------------------


def test_only_one_open_duty_session_per_captain() -> None:
    captain = make_captain()
    CaptainDutySession.objects.create(partner=captain)
    with pytest.raises(IntegrityError), transaction.atomic():
        CaptainDutySession.objects.create(partner=captain)


def test_a_new_session_may_start_after_the_last_one_ended() -> None:
    captain = make_captain()
    first = CaptainDutySession.objects.create(partner=captain)
    first.ended_at = timezone.now()
    first.end_reason = CaptainDutySession.EndReason.CAPTAIN_OFF
    first.save()
    CaptainDutySession.objects.create(partner=captain)
    assert CaptainDutySession.objects.filter(partner=captain).count() == 2


def test_an_ended_session_needs_a_reason() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        CaptainDutySession.objects.create(partner=make_captain(), ended_at=timezone.now())


# --- rides ------------------------------------------------------------------------------------


def test_only_one_open_ride_per_rider() -> None:
    rider = make_user()
    make_ride(rider)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(rider)


def test_a_rider_can_book_again_after_the_last_ride_ends() -> None:
    rider = make_user()
    make_ride(
        rider,
        state=RideState.CANCELLED,
        cancelled_by=ActorKind.RIDER,
        cancel_reason="CHANGED_MIND",
        cancelled_at=timezone.now(),
    )
    make_ride(rider)
    assert Ride.objects.filter(rider=rider).count() == 2


def test_only_one_open_ride_per_captain() -> None:
    captain = make_captain()
    make_ride(state=RideState.CAPTAIN_ASSIGNED, captain=captain)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(state=RideState.IN_TRIP, captain=captain)


def test_a_quote_books_at_most_one_ride() -> None:
    rider = make_user()
    ride = make_ride(rider, state=RideState.NO_CAPTAIN_FOUND)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(rider, quote=ride.quote)


@pytest.mark.parametrize(
    "state", [RideState.CAPTAIN_ASSIGNED, RideState.CAPTAIN_ARRIVED, RideState.IN_TRIP]
)
def test_an_assigned_ride_names_its_captain(state: str) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(state=state)


def test_final_fare_is_fare_plus_waiting() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(waiting_paise=200, final_fare_paise=5400)


def test_a_completed_ride_has_its_final_fare() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(state=RideState.COMPLETED, captain=make_captain())


def test_a_completed_ride_with_the_right_final_fare_is_accepted() -> None:
    ride = make_ride(
        state=RideState.COMPLETED,
        captain=make_captain(),
        waiting_paise=200,
        final_fare_paise=5600,
    )
    assert ride.final_fare_paise == 5600


def test_a_cancelled_ride_says_who_and_why() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(state=RideState.CANCELLED, cancelled_at=timezone.now())


def test_otp_attempts_stop_at_five() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_ride(otp_attempts=6)


# --- transitions ------------------------------------------------------------------------------


def test_transitions_cannot_be_changed() -> None:
    row = RideTransition.objects.create(
        ride=make_ride(), to_state=RideState.SEARCHING, actor_kind=ActorKind.SYSTEM
    )
    row.reason = "edited"
    with pytest.raises(ValueError, match="append-only"):
        row.save()


def test_transitions_cannot_be_deleted() -> None:
    row = RideTransition.objects.create(
        ride=make_ride(), to_state=RideState.SEARCHING, actor_kind=ActorKind.SYSTEM
    )
    with pytest.raises(ValueError, match="append-only"):
        row.delete()


def test_only_the_system_acts_without_a_user() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        RideTransition.objects.create(
            ride=make_ride(), to_state=RideState.CANCELLED, actor_kind=ActorKind.RIDER
        )


# --- offers -----------------------------------------------------------------------------------


def make_offer(ride: Ride, captain: PartnerProfile, **overrides: Any) -> RideOffer:
    fields: dict[str, Any] = {
        "ride": ride,
        "captain": captain,
        "round": 1,
        "pickup_distance_m": 800,
        "expires_at": timezone.now() + timedelta(seconds=15),
    }
    fields.update(overrides)
    return RideOffer.objects.create(**fields)


def test_a_captain_gets_one_offer_per_ride() -> None:
    ride, captain = make_ride(), make_captain()
    make_offer(ride, captain)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_offer(ride, captain, round=2)


def test_only_one_offer_per_ride_can_be_accepted() -> None:
    ride = make_ride()
    make_offer(ride, make_captain(), status=RideOffer.Status.ACCEPTED)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_offer(ride, make_captain(), status=RideOffer.Status.ACCEPTED)


def test_offer_rounds_start_at_one() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_offer(make_ride(), make_captain(), round=0)


def test_an_offer_expires_after_it_is_made() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_offer(make_ride(), make_captain(), expires_at=timezone.now() - timedelta(seconds=1))


# --- track points, ratings, SOS ---------------------------------------------------------------


@pytest.mark.parametrize(("latitude", "accuracy_m"), [(Decimal("91"), 10), (Decimal("17.4"), 0)])
def test_track_points_are_sane(latitude: Decimal, accuracy_m: int) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        RideTrackPoint.objects.create(
            ride=make_ride(),
            latitude=latitude,
            longitude=Decimal("78.3"),
            accuracy_m=accuracy_m,
            captured_at=timezone.now(),
        )


@pytest.mark.parametrize("stars", [0, 6])
def test_stars_are_one_to_five(stars: int) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        RideRating.objects.create(ride=make_ride(), rater_kind=ActorKind.RIDER, stars=stars)


def test_each_side_rates_a_ride_once() -> None:
    ride = make_ride()
    RideRating.objects.create(ride=ride, rater_kind=ActorKind.RIDER, stars=5)
    RideRating.objects.create(ride=ride, rater_kind=ActorKind.CAPTAIN, stars=4)
    with pytest.raises(IntegrityError), transaction.atomic():
        RideRating.objects.create(ride=ride, rater_kind=ActorKind.RIDER, stars=1)


def test_operations_cannot_rate_a_ride() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        RideRating.objects.create(ride=make_ride(), rater_kind=ActorKind.OPERATIONS, stars=3)


def test_an_sos_may_have_no_location() -> None:
    ride = make_ride()
    sos = RideSosEvent.objects.create(ride=ride, raised_by=ride.rider)
    assert sos.status == RideSosEvent.Status.OPEN


def test_a_resolved_sos_says_who_and_when() -> None:
    ride = make_ride()
    with pytest.raises(IntegrityError), transaction.atomic():
        RideSosEvent.objects.create(
            ride=ride, raised_by=ride.rider, status=RideSosEvent.Status.RESOLVED
        )
