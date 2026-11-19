"""An employer applicant saves "Business details" before their session has switched to the partner
role.

The apply screens run on a session whose active role is still the customer's (the application
endpoints need only a signed-in user for exactly that reason). The business-profile endpoint
needed an *active partner role*, so an applicant's "Business details" step answered 403 and the
phone showed "We could not load your business details". It now needs only a partner profile,
which exists once an application is started and never for a plain customer.
"""

from http import HTTPStatus

import pytest

from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerApplication, PartnerConsentDocument
from apps.partners.services import update_partner_application
from tests.helpers import force_role_client

URL = "/api/v1/partner/business-profile/"
BODY = {
    "business_type": "EMPLOYER",
    "legal_name": "Sri Sai Mobiles",
    "business_category": "SHOP",
    "city": "Hyderabad",
}


def _customer_session(user: User):
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="customer")


@pytest.fixture
def applicant(db):  # noqa: ARG001
    """Someone who has started an employer application but is still on a customer session."""
    user = User.objects.create_user(phone_number="+919977770099", full_name="Asha Rao")
    PartnerConsentDocument.objects.create(
        purpose="partner_terms",
        title="Partner terms",
        document_version="2026-07",
        document_url="https://legal.vsolvehub.test/partner-terms/2026-07",
    )
    update_partner_application(
        user=user,
        expected_version=None,
        display_name="Asha Rao",
        biography=None,
        experience_years=None,
        skill_codes=None,
        service_variant_ids=None,
        service_area_ids=None,
        consents=[{"purpose": "partner_terms", "document_version": "2026-07"}],
        request_ip="127.0.0.1",
        device_identifier="",
        track=PartnerApplication.Track.EMPLOYER,
    )
    return user


@pytest.mark.django_db
def test_an_applicant_on_a_customer_session_can_read_and_save_business_details(applicant):
    client = _customer_session(applicant)

    assert client.get(URL).status_code == HTTPStatus.NOT_FOUND  # nothing declared yet: not an error

    saved = client.put(URL, BODY, format="json")
    assert saved.status_code == HTTPStatus.OK
    assert saved.json()["legal_name"] == "Sri Sai Mobiles"

    read_back = client.get(URL)
    assert read_back.status_code == HTTPStatus.OK
    assert read_back.json()["city"] == "Hyderabad"

    application = client.get("/api/v1/partner/application/").json()
    assert application["business_details_complete"] is True


@pytest.mark.django_db
def test_a_plain_customer_with_no_application_is_still_refused(db):  # noqa: ARG001
    stranger = User.objects.create_user(phone_number="+919977770098", full_name="Just A Customer")
    client = _customer_session(stranger)

    assert client.get(URL).status_code == HTTPStatus.FORBIDDEN
    assert client.put(URL, BODY, format="json").status_code == HTTPStatus.FORBIDDEN


@pytest.mark.django_db
def test_an_applicant_only_ever_reaches_their_own_business_details(applicant):
    other = User.objects.create_user(phone_number="+919977770097", full_name="Other Applicant")
    update_partner_application(
        user=other,
        expected_version=None,
        display_name="Other Applicant",
        biography=None,
        experience_years=None,
        skill_codes=None,
        service_variant_ids=None,
        service_area_ids=None,
        consents=[{"purpose": "partner_terms", "document_version": "2026-07"}],
        request_ip="127.0.0.1",
        device_identifier="",
        track=PartnerApplication.Track.EMPLOYER,
    )
    _customer_session(applicant).put(URL, BODY, format="json")

    assert _customer_session(other).get(URL).status_code == HTTPStatus.NOT_FOUND
