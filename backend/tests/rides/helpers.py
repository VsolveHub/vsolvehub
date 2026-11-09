"""Builders for rides tests. Test rows only; nothing here reaches production code."""

import itertools

from django.conf import settings
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerApplication, PartnerConsentDocument, PartnerDocument
from apps.partners.selectors import RIDE_CAPTAIN_DOCUMENT_KINDS
from apps.partners.services import update_partner_application
from tests.helpers import force_role_client

_phone = itertools.count(1)

VEHICLE_BODY = {
    "vehicle_type": "BIKE",
    "registration_number": "ts 09 ab 1234",
    "make_model": "Honda Shine",
    "colour": "Black",
}


def make_user(name: str = "Ravi Kumar") -> User:
    return User.objects.create_user(phone_number=f"+9199660{next(_phone):05d}", full_name=name)


def _consents() -> list[dict[str, str]]:
    PartnerConsentDocument.objects.get_or_create(
        purpose="partner_terms",
        document_version="2026-07",
        defaults={
            "title": "Partner terms",
            "document_url": "https://legal.vsolvehub.test/partner-terms/2026-07",
        },
    )
    return [{"purpose": "partner_terms", "document_version": "2026-07"}]


def start_application(
    user: User, *, track: str = PartnerApplication.Track.RIDE_CAPTAIN
) -> PartnerApplication:
    """A partner application with a name and the agreements accepted, in DRAFT."""
    return update_partner_application(
        user=user,
        expected_version=None,
        display_name=user.full_name or "Captain",
        biography=None,
        experience_years=None,
        skill_codes=None,
        service_variant_ids=None,
        service_area_ids=None,
        consents=_consents(),
        request_ip="127.0.0.1",
        device_identifier="",
        track=track,
    )


def upload_documents(
    application: PartnerApplication,
    kinds: tuple[str, ...],
    *,
    status: str = PartnerDocument.Status.PENDING,
) -> None:
    for index, kind in enumerate(kinds):
        PartnerDocument.objects.create(
            application=application,
            kind=kind,
            version=1,
            object_key=f"partner-documents/test/{application.id}/{index}.pdf",
            content_type="application/pdf",
            size_bytes=1024,
            sha256="0" * 64,
            status=status,
        )


IDENTITY_KINDS = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
CAPTAIN_KINDS = tuple(str(kind) for kind in RIDE_CAPTAIN_DOCUMENT_KINDS)


def set_status(application: PartnerApplication, status: str) -> None:
    application.status = status
    application.save(update_fields=("status",))


def ready_captain(name: str = "Ravi Captain") -> tuple[User, APIClient]:
    """An approved captain with a vehicle: everything but a pass, which each test decides."""
    from apps.rides.models import CaptainVehicle  # noqa: PLC0415

    user = make_user(name)
    application = start_application(user)
    set_status(application, PartnerApplication.Status.APPROVED)
    CaptainVehicle.objects.create(
        partner=application.partner,
        vehicle_type="BIKE",
        registration_number=f"TS09AB{next(_phone):04d}",
        make_model="Honda Shine",
        colour="Black",
    )
    return user, partner_client(user)


def partner_client(user: User) -> APIClient:
    return force_role_client(user=user, role_code="partner")


def customer_client(user: User) -> APIClient:
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="customer")
