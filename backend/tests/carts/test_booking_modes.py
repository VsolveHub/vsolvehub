"""Tests for customer-facing Instant / ASAP and Scheduled booking modes."""

from datetime import UTC, datetime, time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.utils import timezone
import pytest
from rest_framework.test import APIClient

from apps.assignments.group_services import dispatch_unit
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentPlanSet, Quote
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from apps.catalog.models import ServiceVariant
from tests.carts.test_fulfilment_planning import _add_item, _address_payload, _customer_context

FROZEN_NOW = datetime(2026, 8, 10, 4, 30, tzinfo=UTC)  # 10:00 AM IST Monday
NIGHT_NOW = datetime(2026, 8, 10, 18, 0, tzinfo=UTC)   # 11:30 PM IST Monday


def _create_online_partner(area: ServiceArea, variant: ServiceVariant, *, suffix: str = "0001") -> PartnerProfile:
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    for d in range(7):
        PartnerAvailabilityRule.objects.create(
            partner=partner,
            service_area=area,
            weekday=d,
            starts_at=time(8),
            ends_at=time(20),
        )
    PartnerLocation.objects.create(
        partner=partner,
        service_area=area,
        latitude="17.414",
        longitude="78.354",
        accuracy_m=10,
        consent_version="1.0",
        captured_at=FROZEN_NOW,
    )
    PartnerOnlineSession.objects.create(partner=partner, service_area=area, ended_at=None)
    return partner


def _create_offline_partner(area: ServiceArea, variant: ServiceVariant, *, suffix: str = "0099") -> PartnerProfile:
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    for d in range(7):
        PartnerAvailabilityRule.objects.create(
            partner=partner,
            service_area=area,
            weekday=d,
            starts_at=time(8),
            ends_at=time(20),
        )
    PartnerLocation.objects.create(
        partner=partner,
        service_area=area,
        latitude="17.414",
        longitude="78.354",
        accuracy_m=10,
        consent_version="1.0",
        captured_at=FROZEN_NOW,
    )
    # No PartnerOnlineSession
    return partner


def _get_scheduling_groups(client: APIClient, *, address_id: str, cart_version: int) -> list[dict[str, object]]:
    response = client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": address_id, "expected_cart_version": cart_version},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK
    return response.json()["groups"]


@pytest.mark.django_db
def test_booking_windows_publishes_instant_summary_when_online_partner_reachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    _create_online_partner(area, variant)

    response = client.post(
        "/api/v1/booking/windows/",
        {"address_id": address_id},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert "instant" in data
    instant = data["instant"]
    assert instant["is_available"] is True
    assert instant["earliest_starts_at"] is not None
    assert instant["eta_minutes"] is not None
    assert instant["eta_minutes"] > 0
    assert instant["unavailable_reason"] is None
    assert data["availability_is_preliminary"] is True


@pytest.mark.django_db
def test_booking_windows_publishes_instant_unavailable_when_no_partner_online(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    _create_offline_partner(area, variant)

    response = client.post(
        "/api/v1/booking/windows/",
        {"address_id": address_id},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    instant = data["instant"]
    assert instant["is_available"] is False
    assert instant["earliest_starts_at"] is None
    assert instant["eta_minutes"] is None
    assert instant["unavailable_reason"] == "NO_ONLINE_PARTNERS"


@pytest.mark.django_db
def test_booking_windows_publishes_instant_unavailable_outside_operating_hours(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: NIGHT_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    response = client.post(
        "/api/v1/booking/windows/",
        {"address_id": address_id},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    instant = data["instant"]
    assert instant["is_available"] is False
    assert instant["unavailable_reason"] == "OUTSIDE_OPERATING_HOURS"


@pytest.mark.django_db
def test_instant_plan_set_creation_uses_earliest_starts_at(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    _create_online_partner(area, variant)

    response = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "INSTANT",
            "preferred_starts": [],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="plan-set-instant-test",
    )
    assert response.status_code == HTTPStatus.CREATED
    data = response.json()
    assert data["booking_mode"] == "INSTANT"
    plan = data["plans"][0]
    unit = plan["units"][0]
    assert unit["starts_at"] is not None


@pytest.mark.django_db
def test_scheduled_plan_set_creation_uses_selected_starts_at(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    _create_online_partner(area, variant)

    groups = _get_scheduling_groups(client, address_id=address_id, cart_version=cart_version + 1)
    future_start = FROZEN_NOW + timedelta(days=2, hours=3)
    response = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "SCHEDULED",
            "preferred_starts": [{"group_key": groups[0]["key"], "starts_at": future_start.isoformat()}],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="plan-set-scheduled-test",
    )
    assert response.status_code == HTTPStatus.CREATED
    data = response.json()
    assert data["booking_mode"] == "SCHEDULED"
    plan = data["plans"][0]
    unit = plan["units"][0]
    assert datetime.fromisoformat(unit["starts_at"]) == future_start


@pytest.mark.django_db
def test_instant_booking_group_dispatches_via_same_day_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    partner = _create_online_partner(area, variant)

    plan_response = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "INSTANT",
            "preferred_starts": [],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="plan-set-dispatch-instant",
    )
    plan_id = plan_response.json()["plans"][0]["id"]
    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="quote-dispatch-instant",
    )
    quote_id = quote_response.json()["id"]

    checkout_response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="checkout-dispatch-instant",
    )
    assert checkout_response.status_code == HTTPStatus.CREATED
    group_id = checkout_response.json()["booking_group"]["id"]
    group = BookingGroup.objects.get(id=group_id)
    assert group.booking_mode == BookingGroup.BookingMode.INSTANT

    unit = group.units.first()
    assert unit is not None
    # Dispatching unit should create a same-day offer
    result = dispatch_unit(group=group, unit=unit)
    assert isinstance(result, PartnerOffer)
    assert result.partner_id == partner.id


@pytest.mark.django_db
def test_scheduled_booking_group_dispatches_via_advance_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    _create_online_partner(area, variant)

    groups = _get_scheduling_groups(client, address_id=address_id, cart_version=cart_version + 1)
    future_start = FROZEN_NOW + timedelta(days=2, hours=3)
    plan_response = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "SCHEDULED",
            "preferred_starts": [{"group_key": groups[0]["key"], "starts_at": future_start.isoformat()}],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="plan-set-dispatch-sched",
    )
    plan_id = plan_response.json()["plans"][0]["id"]
    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="quote-dispatch-sched",
    )
    quote_id = quote_response.json()["id"]

    checkout_response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="checkout-dispatch-sched",
    )
    assert checkout_response.status_code == HTTPStatus.CREATED
    group_id = checkout_response.json()["booking_group"]["id"]
    group = BookingGroup.objects.get(id=group_id)
    assert group.booking_mode == BookingGroup.BookingMode.SCHEDULED

    unit = group.units.first()
    assert unit is not None
    # Dispatching unit should create a TENTATIVE Reservation directly without offer
    result = dispatch_unit(group=group, unit=unit)
    assert isinstance(result, Reservation)
    assert result.status == Reservation.Status.TENTATIVE


@pytest.mark.django_db
def test_mode_switch_invalidates_prior_plan_set_and_quote(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    area = ServiceArea.objects.get(slug="hyderabad-500032")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    _create_online_partner(area, variant)

    groups = _get_scheduling_groups(client, address_id=address_id, cart_version=cart_version + 1)
    future_start = FROZEN_NOW + timedelta(days=2, hours=3)
    sched_plan_set = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "SCHEDULED",
            "preferred_starts": [{"group_key": groups[0]["key"], "starts_at": future_start.isoformat()}],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="mode-switch-1",
    ).json()
    first_plan_set_id = sched_plan_set["id"]

    sched_quote = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": sched_plan_set["plans"][0]["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="mode-switch-quote-1",
    ).json()

    # Customer switches mode to INSTANT
    instant_plan_set = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "INSTANT",
            "preferred_starts": [],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="mode-switch-2",
    )
    assert instant_plan_set.status_code == HTTPStatus.CREATED

    # The previous plan set is INVALIDATED
    prior_set = FulfilmentPlanSet.objects.get(id=first_plan_set_id)
    assert prior_set.status == FulfilmentPlanSet.Status.INVALIDATED

    # The previous quote cannot checkout
    checkout_res = client.post(
        "/api/v1/checkouts/",
        {"quote_id": sched_quote["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="mode-switch-checkout-old",
    )
    assert checkout_res.status_code in (HTTPStatus.CONFLICT, HTTPStatus.GONE)


@pytest.mark.django_db
def test_no_instant_booking_created_when_no_partner_reachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(timezone, "now", lambda: FROZEN_NOW)
    client, customer, address_id, cart_version = _customer_context()
    _add_item(client, slug="switch-socket-repair", cart_version=cart_version)

    # No partner created / online
    response = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version + 1,
            "booking_mode": "INSTANT",
            "preferred_starts": [],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="no-partner-instant",
    )
    assert response.status_code == HTTPStatus.CONFLICT
    data = response.json()
    item_failures = data.get("error", {}).get("details", {}).get("item_failures", [])
    assert any(
        r.get("reason") in ("NO_ONLINE_PARTNERS", "NO_CAPACITY", "instant_unavailable")
        for r in item_failures
    )
