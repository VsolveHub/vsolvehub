"""Focused A9 stay enquiry-first fail-closed + happy-path tests."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import StayEnquiry
from apps.stay.services import (
    StayStateError,
    create_enquiry,
    create_property,
    moderate_property,
    respond_enquiry,
    submit_property,
)

User = get_user_model()


@pytest.fixture
def stay_world(db):
    category = Category.objects.create(slug="stay-test", name="Stay Test")
    sub = Subcategory.objects.create(category=category, slug="pg", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="double-pg", name="Double PG", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="double-pg-stay",
        name="Double PG stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant, version=1, status=A9VariantConfiguration.Status.ACTIVE
    )
    host_user = User.objects.create(phone_number="+919922220001", full_name="Host")
    host = PartnerProfile.objects.create(user=host_user, display_name="Host PG")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919922220002", full_name="Guest")
    return {"variant": variant, "host": host, "host_user": host_user, "guest": guest}


@pytest.mark.django_db
def test_create_property_fail_closed_without_active_config(stay_world):
    A9VariantConfiguration.objects.filter(variant=stay_world["variant"]).update(
        status=A9VariantConfiguration.Status.RETIRED
    )
    with pytest.raises(StayStateError, match="not open"):
        create_property(
            host=stay_world["host"],
            variant_id=stay_world["variant"].id,
            title="X",
        )


@pytest.mark.django_db
def test_enquiry_happy_path(stay_world):
    prop = create_property(
        host=stay_world["host"],
        variant_id=stay_world["variant"].id,
        title="Demo PG",
        nightly_rate_paise=90000,
    )
    submit_property(prop=prop, host=stay_world["host"])
    moderate_property(
        prop=prop, actor=stay_world["host_user"], action="APPROVE", reason="ok for test"
    )
    check_in = timezone.localdate() + timedelta(days=3)
    enquiry = create_enquiry(
        customer=stay_world["guest"],
        property_id=prop.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=10),
        message="Interested",
    )
    assert enquiry.status == StayEnquiry.Status.SUBMITTED
    respond_enquiry(
        enquiry=enquiry, host=stay_world["host"], response="Yes, available.", decline=False
    )
    enquiry.refresh_from_db()
    assert enquiry.status == StayEnquiry.Status.RESPONDED


@pytest.mark.django_db
def test_no_fulfilment_unit_on_stay_models():
    from apps.stay import models as stay_models

    for name in ("Property", "Unit", "StayEnquiry"):
        model = getattr(stay_models, name)
        field_names = {f.name for f in model._meta.get_fields()}
        assert "fulfilment_unit" not in field_names
