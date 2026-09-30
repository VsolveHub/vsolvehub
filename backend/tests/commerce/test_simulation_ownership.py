from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.commerce.models import PaymentAttempt
from apps.commerce.services.simulation import _standalone_attempt_belongs_to
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.stay.models import Property, StayReservation, Unit, UnitReservation

User = get_user_model()
pytestmark = pytest.mark.django_db


def test_a9_stay_reservation_attempt_belongs_to_customer() -> None:
    customer = User.objects.create(email="customer@example.com", phone_number="+919900000001")
    partner_user = User.objects.create(email="partner@example.com", phone_number="+919900000002")

    app = PartnerApplication.objects.create(applicant=partner_user)
    partner = PartnerProfile.objects.create(application=app)

    cat = Category.objects.create(slug="cat", name="Cat")
    sub = Subcategory.objects.create(category=cat, slug="sub", name="Sub")
    svc = Service.objects.create(subcategory=sub, slug="svc", name="Svc")
    var = ServiceVariant.objects.create(service=svc, slug="var", name="Var")

    prop = Property.objects.create(host=partner, variant=var, title="Test Prop")
    unit = Unit.objects.create(property=prop, name="Test Unit", nightly_rate_paise=1000)

    tomorrow = timezone.now().date() + timedelta(days=1)
    day_after = tomorrow + timedelta(days=1)

    unit_res = UnitReservation.objects.create(unit=unit, check_in=tomorrow, check_out=day_after)

    attempt = PaymentAttempt.objects.create(
        purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION,
        amount_paise=1000,
        provider="fake",
    )

    StayReservation.objects.create(
        property=prop,
        unit=unit,
        unit_reservation=unit_res,
        customer=customer,
        payment_attempt=attempt,
        check_in=tomorrow,
        check_out=day_after,
        total_paise=1000,
    )

    assert _standalone_attempt_belongs_to(attempt=attempt, customer_id=customer.id) is True

    other_customer = User.objects.create(email="other@example.com", phone_number="+919900000003")
    assert _standalone_attempt_belongs_to(attempt=attempt, customer_id=other_customer.id) is False
