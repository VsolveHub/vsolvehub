"""Property-first units, min stay nights, and availability window."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Unit
from apps.stay.services import (
    StayStateError,
    calculate_stay_quote,
    create_enquiry,
    create_property,
    create_unit,
    moderate_property,
    submit_property,
)
from tests.helpers import force_role_client

User = get_user_model()


@pytest.fixture
def stay_world(db):
    category = Category.objects.create(slug="stay-units-test", name="Stay Units Test")
    sub = Subcategory.objects.create(category=category, slug="pg-units", name="PG Units")
    service = Service.objects.create(
        subcategory=sub, slug="shared-pg", name="Shared PG", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="shared-pg-stay",
        name="Shared PG stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant, version=1, status=A9VariantConfiguration.Status.ACTIVE
    )
    host_user = User.objects.create(phone_number="+919933330001", full_name="Host Units")
    host = PartnerProfile.objects.create(user=host_user, display_name="Host Units PG")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919933330002", full_name="Guest Units")
    return {"variant": variant, "host": host, "host_user": host_user, "guest": guest}


def _partner_client(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


@pytest.mark.django_db
def test_create_property_without_unit(stay_world):
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Shell property",
        location_text="Madhapur",
        min_stay_nights=3,
    )
    assert prop.units.count() == 0
    assert prop.min_stay_nights == 3
    unit = create_unit(
        prop=prop,
        host=stay_world["host"],
        name="Deluxe twin",
        nightly_rate_paise=120000,
        sharing_count=2,
    )
    assert unit.name == "Deluxe twin"
    assert prop.units.count() == 1


@pytest.mark.django_db
def test_create_property_prefills_location_from_partner_profile(stay_world):
    stay_world["host"].default_location_text = "Profile Prefill Colony"
    stay_world["host"].save(update_fields=["default_location_text"])
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Prefill property",
        location_text="   ",
    )
    assert prop.location_text == "Profile Prefill Colony"


@pytest.mark.django_db
def test_submit_property_requires_active_unit(stay_world):
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Empty shell",
        location_text="Madhapur",
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    with pytest.raises(StayStateError) as exc:
        submit_property(prop=prop, host=stay_world["host"])
    assert "room" in str(exc.value).lower()
    create_unit(
        prop=prop,
        host=stay_world["host"],
        name="First room",
        nightly_rate_paise=70000,
    )
    submitted = submit_property(prop=prop, host=stay_world["host"])
    # Enquiry-mode properties go live on publish; only a first paid property waits for review.
    assert submitted.moderation_status == "APPROVED"


@pytest.mark.django_db
def test_update_unit_deactivate(stay_world):
    from apps.stay.services import update_unit

    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Toggle unit",
        location_text="Kukatpally",
        nightly_rate_paise=80000,
    )
    unit = prop.units.get()
    client = _partner_client(stay_world["host_user"])
    patched = client.patch(
        f"/api/v1/partner/stays/units/{unit.id}",
        {"is_active": False},
        format="json",
    )
    assert patched.status_code == status.HTTP_200_OK
    assert patched.data["is_active"] is False
    unit.refresh_from_db()
    assert unit.is_active is False
    reactivated = update_unit(unit=unit, host=stay_world["host"], is_active=True)
    assert reactivated.is_active is True


@pytest.mark.django_db
def test_min_stay_and_availability_codes(stay_world):
    today = timezone.localdate()
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Windowed PG",
        location_text="Gachibowli",
        nightly_rate_paise=90000,
        min_stay_nights=5,
        available_from=today + timedelta(days=10),
        available_until=today + timedelta(days=40),
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(
        prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok for test"
    )

    with pytest.raises(StayStateError) as short:
        calculate_stay_quote(
            property_id=prop.id,
            check_in=today + timedelta(days=12),
            check_out=today + timedelta(days=14),
        )
    assert short.value.code == "min_stay_not_met"

    with pytest.raises(StayStateError) as early:
        calculate_stay_quote(
            property_id=prop.id,
            check_in=today + timedelta(days=2),
            check_out=today + timedelta(days=10),
        )
    assert early.value.code == "dates_unavailable"

    with pytest.raises(StayStateError) as late:
        create_enquiry(
            customer=stay_world["guest"],
            property_id=prop.id,
            check_in=today + timedelta(days=35),
            check_out=today + timedelta(days=45),
        )
    assert late.value.code == "dates_unavailable"


@pytest.mark.django_db
def test_partner_units_http_collection(stay_world):
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="HTTP property",
        location_text="Kondapur",
    )
    client = _partner_client(stay_world["host_user"])
    listed = client.get(f"/api/v1/partner/stays/properties/{prop.id}/units")
    assert listed.status_code == status.HTTP_200_OK
    assert listed.data == []

    created = client.post(
        f"/api/v1/partner/stays/properties/{prop.id}/units",
        {
            "name": "Corner room",
            "nightly_rate_paise": 85000,
            "sharing_count": 1,
        },
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED
    assert created.data["name"] == "Corner room"
    assert Unit.objects.filter(property=prop).count() == 1

    props = client.get("/api/v1/partner/stays/properties")
    assert props.status_code == status.HTTP_200_OK
    row = next(p for p in props.data if p["id"] == str(prop.id))
    assert row["min_stay_nights"] == 1
    assert "available_from" in row
    assert "available_until" in row


@pytest.mark.django_db
def test_update_unit_http(stay_world):
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Patchable",
        location_text="Jubilee Hills",
        nightly_rate_paise=70000,
    )
    unit = prop.units.get()
    client = _partner_client(stay_world["host_user"])
    patched = client.patch(
        f"/api/v1/partner/stays/units/{unit.id}",
        {"name": "Renovated suite", "nightly_rate_paise": 99000, "sharing_count": 2},
        format="json",
    )
    assert patched.status_code == status.HTTP_200_OK
    assert patched.data["name"] == "Renovated suite"
    assert patched.data["nightly_rate_paise"] == 99000
    assert patched.data["sharing_count"] == 2
    unit.refresh_from_db()
    assert unit.nightly_rate_paise == 99000


@pytest.mark.django_db
def test_enquire_http_min_stay_and_availability_codes(stay_world):
    today = timezone.localdate()
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Enquired PG",
        location_text="Madhapur",
        nightly_rate_paise=80000,
        min_stay_nights=7,
        available_from=today + timedelta(days=5),
        available_until=today + timedelta(days=60),
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok")
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=stay_world["guest"], role=role, revoked_at=None)
    client = force_role_client(user=stay_world["guest"], role_code="customer")

    short = client.post(
        "/api/v1/stays/enquire",
        {
            "property_id": str(prop.id),
            "check_in": str(today + timedelta(days=10)),
            "check_out": str(today + timedelta(days=12)),
        },
        format="json",
    )
    assert short.status_code == status.HTTP_400_BAD_REQUEST
    assert short.data["error"]["code"] == "min_stay_not_met"

    early = client.post(
        "/api/v1/stays/enquire",
        {
            "property_id": str(prop.id),
            "check_in": str(today + timedelta(days=1)),
            "check_out": str(today + timedelta(days=10)),
        },
        format="json",
    )
    assert early.status_code == status.HTTP_400_BAD_REQUEST
    assert early.data["error"]["code"] == "dates_unavailable"


@pytest.mark.django_db
def test_confirm_enquiry_holds_unit_reservation(stay_world):
    from datetime import timedelta

    from django.utils import timezone

    from apps.stay.services import (
        StayStateError,
        cancel_enquiry,
        confirm_enquiry,
        create_enquiry,
        create_property,
        moderate_property,
        submit_property,
    )

    today = timezone.localdate()
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Hold on confirm",
        location_text="Banjara Hills",
        nightly_rate_paise=100000,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok")
    enquiry = create_enquiry(
        customer=stay_world["guest"],
        property_id=prop.id,
        check_in=today + timedelta(days=8),
        check_out=today + timedelta(days=12),
    )
    confirmed = confirm_enquiry(enquiry=enquiry, host=stay_world["host"])
    assert confirmed.status == "CONFIRMED"
    # ENQUIRY mode no longer uses UnitReservation natively
    assert confirmed.unit_reservation_id is None

    # Verify double book fails
    import pytest

    with pytest.raises(StayStateError) as exc:
        create_enquiry(
            customer=stay_world["guest"],
            property_id=prop.id,
            check_in=today + timedelta(days=8),
            check_out=today + timedelta(days=12),
        )
    assert exc.value.code == "dates_unavailable"

    cancelled = cancel_enquiry(enquiry=confirmed, actor=stay_world["host"], as_host=True)
    assert cancelled.status == "CANCELLED"
