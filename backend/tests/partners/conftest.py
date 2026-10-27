from dataclasses import dataclass
from datetime import timedelta
from http import HTTPStatus
from secrets import token_urlsafe
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.models import PartnerConsentDocument, PartnerDocumentUpload, Skill
from apps.partners.storage import SignedReview, SignedUpload, VerifiedObject


@dataclass(frozen=True, slots=True)
class PartnerSetup:
    user: User
    client: APIClient
    skill: Skill
    variant: ServiceVariant
    service_area: ServiceArea


class FakeDocumentStorage:
    def __init__(self) -> None:
        self.verification_overrides: dict[str, VerifiedObject] = {}
        self.reviewed_keys: list[str] = []
        self.deleted_keys: list[str] = []
        self.upload_token = token_urlsafe(16)

    def create_signed_upload(self, *, object_key: str) -> SignedUpload:
        return SignedUpload(
            upload_url=f"https://storage.test/upload/{object_key}?token={self.upload_token}",
            upload_token=self.upload_token,
            resumable_url="https://storage.test/upload/resumable",
            expires_at=timezone.now() + timedelta(hours=2),
        )

    def verify_object(self, *, object_key: str, maximum_size_bytes: int) -> VerifiedObject:
        del maximum_size_bytes
        if object_key in self.verification_overrides:
            return self.verification_overrides[object_key]
        upload = PartnerDocumentUpload.objects.get(object_key=object_key)
        return VerifiedObject(
            size_bytes=upload.size_bytes,
            content_type=upload.content_type,
            sha256=upload.sha256,
        )

    def create_signed_review(self, *, object_key: str, expires_in_seconds: int) -> SignedReview:
        self.reviewed_keys.append(object_key)
        return SignedReview(
            review_url=f"https://storage.test/review/{object_key}?token=review-token",
            expires_at=timezone.now() + timedelta(seconds=expires_in_seconds),
        )

    def delete_object(self, *, object_key: str) -> None:
        self.deleted_keys.append(object_key)


@pytest.fixture(autouse=True)
def document_storage(monkeypatch: pytest.MonkeyPatch) -> FakeDocumentStorage:
    storage = FakeDocumentStorage()
    monkeypatch.setattr("apps.partners.services.get_document_storage", lambda: storage)
    monkeypatch.setattr("apps.partners.services.documents.get_document_storage", lambda: storage)
    monkeypatch.setattr("apps.partners.storage.get_document_storage", lambda: storage)
    return storage


@pytest.fixture
def partner_setup() -> PartnerSetup:
    user = User.objects.create_user(phone_number="+919876543210", full_name="Ravi Kumar")
    client = APIClient()
    client.force_authenticate(user=user)
    category = Category.objects.create(slug="technician", name="Technician")
    subcategory = Subcategory.objects.create(
        category=category,
        slug="electrician",
        name="Electrician",
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug="switch-repair",
        name="Switch Repair",
        short_description="Repair a switch.",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="standard",
        name="Standard",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        required_skill_code="electrician",
        tax_category_code="technician-repair",
    )
    skill = Skill.objects.create(code="electrician", name="Electrician")
    PartnerConsentDocument.objects.create(
        purpose="partner_terms",
        title="Partner terms",
        document_version="2026-07",
        document_url="https://legal.vsolvehub.test/partner-terms/2026-07",
    )
    PartnerConsentDocument.objects.create(
        purpose="privacy_notice",
        title="Partner privacy notice",
        document_version="2026-07",
        document_url="https://legal.vsolvehub.test/partner-privacy/2026-07",
    )
    service_area = ServiceArea.objects.create(
        slug="west-hyderabad",
        name="West Hyderabad",
    )
    ServiceAreaService.objects.create(service_area=service_area, variant=variant)
    return PartnerSetup(
        user=user,
        client=client,
        skill=skill,
        variant=variant,
        service_area=service_area,
    )


@pytest.fixture
def operations_user() -> User:
    user = User.objects.create_user(phone_number="+919900000001", full_name="Operations Reviewer")
    role = Role.objects.create(code="operations", name="Operations", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


def application_payload(setup: PartnerSetup, *, expected_version: int | None = None) -> dict:
    payload: dict[str, object] = {
        "display_name": "Ravi K.",
        "biography": "Residential electrical specialist.",
        "experience_years": 6,
        "skill_codes": [setup.skill.code],
        "service_variant_ids": [str(setup.variant.id)],
        "service_area_ids": [str(setup.service_area.id)],
        "consents": [
            {"purpose": "partner_terms", "document_version": "2026-07"},
            {"purpose": "privacy_notice", "document_version": "2026-07"},
        ],
        "device_identifier": "partner-browser",
    }
    if expected_version is not None:
        payload["expected_version"] = expected_version
    return payload


def upload_partner_document(
    client: APIClient,
    *,
    expected_version: int,
    kind: str = "GOVERNMENT_ID",
    content_type: str = "image/jpeg",
    size_bytes: int = 1024,
    sha256: str = "a" * 64,
) -> Any:
    issued = client.post(
        "/api/v1/partner/application/documents/uploads/",
        {
            "expected_version": expected_version,
            "kind": kind,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "sha256": sha256,
        },
        format="json",
    )
    assert issued.status_code == HTTPStatus.CREATED
    return client.post(
        "/api/v1/partner/application/documents/",
        {"expected_version": expected_version, "upload_id": issued.json()["id"]},
        format="json",
    )


def set_partner_schedule(
    setup: PartnerSetup,
    *,
    weekday: int = 0,
    starts_at: str = "09:00:00",
    ends_at: str = "18:00:00",
) -> Any:
    return setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(setup.service_area.id),
                    "weekday": weekday,
                    "starts_at": starts_at,
                    "ends_at": ends_at,
                    "ends_next_day": False,
                }
            ],
            "exceptions": [],
        },
        format="json",
    )

