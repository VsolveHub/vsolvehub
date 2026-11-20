"""Database constraints on the employer onboarding models (README 3.1-3.3)."""

from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from apps.identity.models import User
from apps.partners.models import (
    EmployerProfile,
    EmployerReviewCheck,
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerProfile,
)


@pytest.fixture
def partner(db):  # noqa: ARG001
    user = User.objects.create_user(phone_number="+919977770111", full_name="Asha Rao")
    return PartnerProfile.objects.create(user=user, display_name="Asha Rao")


def _business(partner, **overrides):
    values = {"partner": partner, "business_type": "EMPLOYER", "legal_name": "Sri Sai Mobiles"}
    values.update(overrides)
    return PartnerBusinessProfile(**values)


def _refused(instance):
    with pytest.raises(IntegrityError), transaction.atomic():
        instance.save()


def test_old_business_category_still_loads(partner):
    row = _business(partner, business_category="SHOP", city="Hyderabad")
    row.save()
    row.refresh_from_db()
    assert row.business_category == PartnerBusinessProfile.BusinessCategory.SHOP


def test_gst_certificate_needs_gst_registered(partner):
    _refused(_business(partner, gst_registered=False, business_proof_type="GST_CERTIFICATE"))


def test_gst_registered_must_use_gst_certificate(partner):
    _refused(
        _business(
            partner,
            gst_registered=True,
            gstin="27AAPFU0939F1ZV",
            business_proof_type="UDYAM",
        )
    )


def test_matching_proof_and_gst_answer_is_saved(partner):
    _business(partner, gst_registered=False, business_proof_type="UDYAM").save()


def test_business_pin_code_format(partner):
    _refused(_business(partner, pin_code="012345"))


def test_business_pin_needs_both_coordinates(partner):
    _refused(_business(partner, latitude=Decimal("17.385000")))


def test_employer_individual_cannot_have_a_role(partner):
    _refused(EmployerProfile(partner=partner, hiring_as="INDIVIDUAL", poster_role="OWNER"))


def test_employer_business_cannot_have_home_location(partner):
    _refused(EmployerProfile(partner=partner, hiring_as="BUSINESS", city="Hyderabad"))


def test_employer_pin_code_format(partner):
    _refused(EmployerProfile(partner=partner, hiring_as="INDIVIDUAL", pin_code="12345"))


def test_review_check_is_unique_per_application_and_code(partner):
    application = PartnerApplication.objects.create(
        partner=partner, track=PartnerApplication.Track.EMPLOYER
    )
    reviewer = User.objects.create_user(phone_number="+919977770112", full_name="Ops Reviewer")
    EmployerReviewCheck.objects.create(
        application=application, code="NAME_MATCHES_ID", result="PASS", checked_by=reviewer
    )
    _refused(
        EmployerReviewCheck(
            application=application,
            code="NAME_MATCHES_ID",
            result="FAIL",
            note="Different name",
            checked_by=reviewer,
        )
    )
