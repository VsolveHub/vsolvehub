"""Enquiry-only stays: the guest enquires, the host sees who they are and calls them.

No payment is taken for any stay. A room's rate is quoted per night or per month depending on
the property type, and the enquiry carries a start date plus how long the guest wants to stay.
"""

import importlib
from datetime import date, timedelta

import pytest
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import registered_template_codes
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Property, StayEnquiry
from apps.stay.services import (
    StayStateError,
    _add_months,
    calculate_stay_quote,
    cancel_enquiry,
    confirm_enquiry,
    create_enquiry,
    create_property,
    get_stay_taxonomy,
    public_properties,
    respond_enquiry,
    submit_property,
)
from tests.helpers import force_role_client

User = get_user_model()

MONTHLY_RENT = 900000
NIGHTLY_RATE = 250000
THREE_MONTHS = 3
TWO_MONTHS = 2


def _variant(service: Service, code: str, period: str) -> ServiceVariant:
    variant = ServiceVariant.objects.create(
        service=service,
        code=code,
        name=code,
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=A9VariantConfiguration.BookingMode.ENQUIRY,
        price_period=period,
    )
    return variant


@pytest.fixture
def world(db):  # noqa: ARG001
    category, _ = Category.objects.get_or_create(
        slug="rooms-pg-hostel-hotels", defaults={"name": "Stays"}
    )
    sub = Subcategory.objects.create(category=category, slug="call-flow", name="Call flow")
    service = Service.objects.create(
        subcategory=sub, slug="call-flow-svc", name="Call flow", status=Service.Status.ACTIVE
    )
    monthly = _variant(service, "call-pg", A9VariantConfiguration.PricePeriod.MONTH)
    nightly = _variant(service, "call-hotel", A9VariantConfiguration.PricePeriod.NIGHT)

    host_user = User.objects.create(phone_number="+919966660001", full_name="Call Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Call Host Stays")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=monthly,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919966660002", full_name="Priya Guest")
    return {
        "monthly": monthly,
        "nightly": nightly,
        "host": host,
        "host_user": host_user,
        "guest": guest,
    }


def _live(world, key: str, *, rate: int, min_stay: int = 1):
    prop = create_property(
        host=world["host"],
        variant_id=world[key].id,
        title=f"{key} stay",
        location_text="Madhapur, Hyderabad",
        nightly_rate_paise=rate,
        min_stay_nights=min_stay,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=world["host"])
    prop.refresh_from_db()
    return prop


def _start(days: int = 10) -> date:
    return timezone.localdate() + timedelta(days=days)


def _intents(template_code: str):
    return NotificationIntent.objects.filter(template_code=template_code)


# --- price per month or per night ---------------------------------------------------------------


@pytest.mark.django_db
def test_monthly_enquiry_asks_months_and_estimates_rent(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    move_in = _start()

    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=move_in, length=3
    )

    assert enquiry.stay_length == THREE_MONTHS
    assert enquiry.price_period == "MONTH"
    assert enquiry.check_out == _add_months(move_in, 3)
    assert enquiry.total_quote_paise == 3 * MONTHLY_RENT


@pytest.mark.django_db
def test_nightly_enquiry_asks_nights(world):
    prop = _live(world, "nightly", rate=NIGHTLY_RATE)
    arrive = _start()

    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=arrive, length=4
    )

    assert enquiry.check_out == arrive + timedelta(days=4)
    assert enquiry.price_period == "NIGHT"
    assert enquiry.total_quote_paise == 4 * NIGHTLY_RATE


def test_months_end_on_the_last_day_of_a_short_month():
    assert _add_months(date(2027, 1, 31), 1) == date(2027, 2, 28)
    assert _add_months(date(2028, 11, 30), 3) == date(2029, 2, 28)


@pytest.mark.django_db
def test_quote_reports_the_price_unit(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)

    quote = calculate_stay_quote(property_id=prop.id, check_in=_start(), length=2)

    assert quote["price_period"] == "MONTH"
    assert quote["stay_length"] == TWO_MONTHS
    assert quote["total_quote_paise"] == 2 * MONTHLY_RENT


@pytest.mark.django_db
def test_length_is_required(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)

    with pytest.raises(StayStateError) as exc:
        create_enquiry(customer=world["guest"], property_id=prop.id, check_in=_start())
    assert exc.value.code == "length_required"


@pytest.mark.django_db
def test_minimum_and_maximum_stay_are_in_months_for_monthly_places(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT, min_stay=3)

    with pytest.raises(StayStateError) as short:
        create_enquiry(customer=world["guest"], property_id=prop.id, check_in=_start(), length=2)
    assert short.value.code == "min_stay_not_met"
    assert "3 months" in str(short.value)

    with pytest.raises(StayStateError) as long:
        create_enquiry(customer=world["guest"], property_id=prop.id, check_in=_start(), length=25)
    assert long.value.code == "max_stay_exceeded"


@pytest.mark.django_db
def test_price_unit_is_published_to_guests_and_hosts(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    from rest_framework.test import APIClient  # noqa: PLC0415

    detail = APIClient().get(f"/api/v1/stays/{prop.id}")

    assert detail.data["price_period"] == "MONTH"
    types = {
        variant["code"]: variant["price_period"]
        for sub in get_stay_taxonomy()
        for svc in sub["services"]
        for variant in svc["variants"]
    }
    assert types["call-pg"] == "MONTH"
    assert types["call-hotel"] == "NIGHT"


@pytest.mark.django_db
def test_an_old_open_window_no_longer_blocks_guests(world):
    """Hosts stop enquiries by pausing or marking a room full, not with a date window.

    A property saved before the window was removed may still carry one; it is ignored.
    """
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    Property.objects.filter(id=prop.id).update(
        available_from=_start(100), available_until=timezone.localdate() - timedelta(days=1)
    )

    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=_start(), length=2
    )

    assert enquiry.status == StayEnquiry.Status.SUBMITTED
    assert prop.id in {row.id for row in public_properties()}


# --- the host sees who is asking ----------------------------------------------------------------


def _partner_client(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


def _customer_client(user):
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="customer")


@pytest.mark.django_db
def test_host_sees_the_guests_name_and_number(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    create_enquiry(customer=world["guest"], property_id=prop.id, check_in=_start(), length=1)

    rows = (
        _partner_client(world["host_user"]).get("/api/v1/partner/stays/enquiries").data["results"]
    )

    assert rows[0]["customer_name"] == "Priya Guest"
    assert rows[0]["customer_phone"] == "+919966660002"
    assert rows[0]["stay_length"] == 1


@pytest.mark.django_db
def test_the_guests_own_list_does_not_echo_contact_fields(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    create_enquiry(customer=world["guest"], property_id=prop.id, check_in=_start(), length=1)

    rows = _customer_client(world["guest"]).get("/api/v1/me/stay-enquiries").data["results"]

    assert "customer_phone" not in rows[0]


@pytest.mark.django_db
def test_enquiries_hold_no_room(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=_start(), length=2
    )

    booked = confirm_enquiry(enquiry=enquiry, host=world["host"])

    assert booked.status == StayEnquiry.Status.CONFIRMED
    assert booked.unit_reservation_id is None


# --- notifications -------------------------------------------------------------------------------


def test_every_enquiry_notice_has_a_template():
    assert {
        "stay_enquiry_received",
        "stay_enquiry_confirmed",
        "stay_enquiry_declined",
        "stay_enquiry_withdrawn",
    } <= registered_template_codes()


@pytest.mark.django_db
def test_host_is_told_about_a_new_enquiry(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)

    create_enquiry(customer=world["guest"], property_id=prop.id, check_in=_start(), length=1)

    notice = _intents("stay_enquiry_received").get()
    assert notice.recipient_id == world["host_user"].id


@pytest.mark.django_db
def test_guest_is_told_when_marked_booked(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=_start(), length=1
    )

    confirm_enquiry(enquiry=enquiry, host=world["host"])

    assert _intents("stay_enquiry_confirmed").get().recipient_id == world["guest"].id


@pytest.mark.django_db
def test_host_can_mark_not_available_without_a_note_and_guest_is_told(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=_start(), length=1
    )

    declined = respond_enquiry(enquiry=enquiry, host=world["host"], response="", decline=True)

    assert declined.status == StayEnquiry.Status.DECLINED
    assert _intents("stay_enquiry_declined").get().recipient_id == world["guest"].id


@pytest.mark.django_db
def test_host_is_told_when_the_guest_withdraws(world):
    prop = _live(world, "monthly", rate=MONTHLY_RENT)
    enquiry = create_enquiry(
        customer=world["guest"], property_id=prop.id, check_in=_start(), length=1
    )

    cancel_enquiry(enquiry=enquiry, actor=world["guest"])

    assert _intents("stay_enquiry_withdrawn").get().recipient_id == world["host_user"].id


# --- data migration ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_migration_makes_every_stay_enquiry_only_and_keeps_hotels_nightly(world):
    paid = world["nightly"].a9_configurations.get()
    paid.booking_mode = A9VariantConfiguration.BookingMode.RESERVATION
    paid.price_period = A9VariantConfiguration.PricePeriod.MONTH
    paid.save()
    monthly = world["monthly"].a9_configurations.get()
    monthly.price_period = A9VariantConfiguration.PricePeriod.NIGHT
    monthly.save()
    migration = importlib.import_module("apps.catalog.migrations.0023_a9_price_period_enquiry_only")

    migration.enquiry_only_with_price_period(django_apps, None)

    paid.refresh_from_db()
    monthly.refresh_from_db()
    assert (paid.booking_mode, paid.price_period) == ("ENQUIRY", "NIGHT")
    assert (monthly.booking_mode, monthly.price_period) == ("ENQUIRY", "MONTH")
