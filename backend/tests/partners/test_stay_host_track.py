"""The short sign-up for partners who list their own property (``track = STAY_HOST``).

A stay host tells us who they are, accepts the agreements and uploads an identity document.
They are never asked for trades, service areas or working hours, and approving their
application is what lets them list stays — there is no second capability review.
"""

import pytest
from django.conf import settings

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import User
from apps.partners.capabilities import is_approved_stay_host, workspace_grants
from apps.partners.exceptions import PartnerApplicationIncompleteError
from apps.partners.models import PartnerApplication, PartnerConsentDocument, PartnerDocument
from apps.partners.services import submit_partner_application, update_partner_application
from apps.stay.services import create_property, public_properties, submit_property


def _consent_documents() -> list[dict[str, str]]:
    PartnerConsentDocument.objects.create(
        purpose="partner_terms",
        title="Partner terms",
        document_version="2026-07",
        document_url="https://legal.vsolvehub.test/partner-terms/2026-07",
    )
    return [{"purpose": "partner_terms", "document_version": "2026-07"}]


def _start(user: User, *, track: str) -> PartnerApplication:
    return update_partner_application(
        user=user,
        expected_version=None,
        display_name="Asha Rao",
        biography=None,
        experience_years=None,
        skill_codes=None,
        service_variant_ids=None,
        service_area_ids=None,
        consents=_consent_documents(),
        request_ip="127.0.0.1",
        device_identifier="",
        track=track,
    )


def _upload_required_documents(application: PartnerApplication) -> None:
    for index, kind in enumerate(settings.PARTNER_REQUIRED_DOCUMENT_KINDS):
        PartnerDocument.objects.create(
            application=application,
            kind=kind,
            version=1,
            object_key=f"partner-documents/test/{index}.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            sha256="0" * 64,
        )


@pytest.fixture
def host_user(db):  # noqa: ARG001
    return User.objects.create_user(phone_number="+919977770001", full_name="Asha Rao")


@pytest.mark.django_db
def test_stay_host_submits_without_trades_areas_or_hours(host_user):
    application = _start(host_user, track=PartnerApplication.Track.STAY_HOST)
    _upload_required_documents(application)

    submitted = submit_partner_application(user=host_user, expected_version=application.version)

    assert submitted.status == PartnerApplication.Status.SUBMITTED
    assert submitted.track == PartnerApplication.Track.STAY_HOST


@pytest.mark.django_db
def test_stay_host_still_needs_identity_documents(host_user):
    application = _start(host_user, track=PartnerApplication.Track.STAY_HOST)

    with pytest.raises(PartnerApplicationIncompleteError):
        submit_partner_application(user=host_user, expected_version=application.version)


@pytest.mark.django_db
def test_service_partners_still_need_trades_and_areas(host_user):
    application = _start(host_user, track=PartnerApplication.Track.SERVICES)
    _upload_required_documents(application)

    with pytest.raises(PartnerApplicationIncompleteError):
        submit_partner_application(user=host_user, expected_version=application.version)


def _stay_variant() -> ServiceVariant:
    category, _ = Category.objects.get_or_create(
        slug="rooms-pg-hostel-hotels", defaults={"name": "Stays"}
    )
    sub = Subcategory.objects.create(category=category, slug="host-track", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="host-track-pg", name="PG", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="host-track-pg",
        name="PG stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay-host",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant, version=1, status=A9VariantConfiguration.Status.ACTIVE
    )
    return variant


@pytest.mark.django_db
def test_approved_stay_host_can_list_without_a_capability_request(host_user):
    application = _start(host_user, track=PartnerApplication.Track.STAY_HOST)
    application.status = PartnerApplication.Status.APPROVED
    application.save(update_fields=("status",))
    partner = application.partner
    variant = _stay_variant()

    assert is_approved_stay_host(partner)
    assert "A9_STAY" in {grant.workspace_key for grant in workspace_grants(partner)}

    prop = create_property(
        host=partner,
        variant_id=variant.id,
        title="Asha's PG",
        location_text="Kondapur, Hyderabad",
        nightly_rate_paise=800000,
        image_urls=["https://cdn.example.com/cover.jpg"],
    )
    submit_property(prop=prop, host=partner)
    assert prop.id in {row.id for row in public_properties()}


@pytest.mark.django_db
def test_unapproved_stay_host_cannot_list(host_user):
    application = _start(host_user, track=PartnerApplication.Track.STAY_HOST)
    variant = _stay_variant()

    assert not is_approved_stay_host(application.partner)
    with pytest.raises(PermissionError):
        create_property(
            host=application.partner,
            variant_id=variant.id,
            title="Too early",
            location_text="Kondapur",
        )


@pytest.mark.django_db
def test_service_partner_gets_no_stays_workspace_from_the_application(host_user):
    application = _start(host_user, track=PartnerApplication.Track.SERVICES)
    application.status = PartnerApplication.Status.APPROVED
    application.save(update_fields=("status",))

    assert "A9_STAY" not in {grant.workspace_key for grant in workspace_grants(application.partner)}
