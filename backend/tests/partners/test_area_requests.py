"""Tests for Partner area requests and Step 3 flow (FLOW.md, IMPLEMENTATION_PLAN.md)."""

from datetime import time
from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.identity.models import AccessAuditEvent, Role, User, UserRole
from apps.locations.models import PostalCode, ServiceArea, ServiceAreaPostalCode
from apps.partners.exceptions import PartnerApplicationIncompleteError
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerDocument,
    PartnerServiceArea,
)
from apps.partners.services import (
    transition_partner_application,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup, application_payload


@pytest.fixture
def ops_reviewer() -> tuple[User, APIClient]:
    user = User.objects.create_user(phone_number="+919111111111", full_name="Ops Reviewer")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.create(user=user, role=role)
    client = force_role_client(user=user, role_code="operations")
    return user, client


@pytest.mark.django_db
def test_save_and_read_requested_postal_codes(partner_setup: PartnerSetup) -> None:
    response = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "experience_years": 4,
            "skill_codes": [partner_setup.skill.code],
            "service_variant_ids": [str(partner_setup.variant.id)],
            "service_area_ids": [],
            "requested_postal_codes": ["509216", "509001"],
            "consents": [
                {"purpose": "partner_terms", "document_version": "2026-07"},
                {"purpose": "privacy_notice", "document_version": "2026-07"},
            ],
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED
    data = response.json()
    assert data["service_area_ids"] == []
    assert set(data["requested_postal_codes"]) == {"509216", "509001"}
    assert len(data["area_requests"]) == 2

    get_res = partner_setup.client.get("/api/v1/partner/application/")
    assert get_res.status_code == HTTPStatus.OK
    get_data = get_res.json()
    assert set(get_data["requested_postal_codes"]) == {"509216", "509001"}


@pytest.mark.django_db
def test_replace_and_clear_requested_postal_codes(partner_setup: PartnerSetup) -> None:
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "requested_postal_codes": ["509216", "509001"],
        },
        format="json",
    )
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    assert app.area_requests.count() == 2

    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": app.version,
            "requested_postal_codes": ["500001"],
        },
        format="json",
    )
    app.refresh_from_db()
    assert list(app.area_requests.values_list("postal_code", flat=True)) == ["500001"]

    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": app.version,
            "requested_postal_codes": [],
        },
        format="json",
    )
    app.refresh_from_db()
    assert app.area_requests.count() == 0


@pytest.mark.django_db
def test_dismissed_request_stays_dismissed_when_resent(partner_setup: PartnerSetup) -> None:
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Ravi Electrician", "requested_postal_codes": ["509216"]},
        format="json",
    )
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    row = app.area_requests.get()
    from django.utils import timezone  # noqa: PLC0415

    row.dismissed_at = timezone.now()
    row.save(update_fields=("dismissed_at",))

    # The partner's draft no longer lists it; saving an empty set then the same PIN again must
    # not turn it back into a live request.
    res = partner_setup.client.get("/api/v1/partner/application/")
    assert res.json()["requested_postal_codes"] == []
    for pins in ([], ["509216"]):
        app.refresh_from_db()
        partner_setup.client.patch(
            "/api/v1/partner/application/",
            {"expected_version": app.version, "requested_postal_codes": pins},
            format="json",
        )
    row.refresh_from_db()
    assert row.dismissed_at is not None
    assert app.area_requests.count() == 1


@pytest.mark.django_db
def test_limit_and_format_validation(partner_setup: PartnerSetup) -> None:
    res_overflow = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "requested_postal_codes": [
                "500001",
                "500002",
                "500003",
                "500004",
                "500005",
                "500006",
            ],
        },
        format="json",
    )
    assert res_overflow.status_code == HTTPStatus.BAD_REQUEST
    assert res_overflow.json()["error"]["code"] == "partner_area_requests_limit"

    res_invalid = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "requested_postal_codes": ["012345"],
        },
        format="json",
    )
    assert res_invalid.status_code == HTTPStatus.BAD_REQUEST


@pytest.mark.django_db
def test_non_services_track_rejected(partner_setup: PartnerSetup) -> None:
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Host", "track": "STAY_HOST"},
        format="json",
    )
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    res = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": app.version,
            "requested_postal_codes": ["500001"],
        },
        format="json",
    )
    assert res.status_code == HTTPStatus.BAD_REQUEST
    assert res.json()["error"]["code"] == "track_does_not_use_areas"


@pytest.mark.django_db
def test_live_status_resolution(partner_setup: PartnerSetup) -> None:
    PostalCode.objects.create(code="509216", city="Shadnagar", state="Telangana")
    pc_full = PostalCode.objects.create(code="500032", city="Gachibowli", state="Telangana")
    pc_ready = PostalCode.objects.create(code="509001", city="Mahbubnagar", state="Telangana")
    pc_done = PostalCode.objects.create(code="500081", city="Madhapur", state="Telangana")

    area_full = ServiceArea.objects.create(
        slug="gachibowli", name="Gachibowli", is_accepting_partners=False
    )
    ServiceAreaPostalCode.objects.create(service_area=area_full, postal_code=pc_full)

    area_ready = ServiceArea.objects.create(
        slug="mahbubnagar", name="Mahbubnagar", is_accepting_partners=True
    )
    ServiceAreaPostalCode.objects.create(service_area=area_ready, postal_code=pc_ready)

    area_done = ServiceArea.objects.create(
        slug="madhapur", name="Madhapur", is_accepting_partners=True
    )
    ServiceAreaPostalCode.objects.create(service_area=area_done, postal_code=pc_done)

    init_res = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Ravi"},
        format="json",
    )
    assert init_res.status_code == HTTPStatus.CREATED
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)

    PartnerServiceArea.objects.create(
        partner=partner_setup.user.partner_profile,
        service_area=area_done,
        is_active=True,
    )

    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "expected_version": app.version,
            "requested_postal_codes": ["509216", "500032", "509001", "500081", "110001"],
        },
        format="json",
    )

    res = partner_setup.client.get("/api/v1/partner/application/")
    assert res.status_code == HTTPStatus.OK
    area_requests = {r["postal_code"]: r for r in res.json()["area_requests"]}

    assert area_requests["509216"]["status"] == "WAITING"
    assert area_requests["509216"]["place"] == "Shadnagar"

    assert area_requests["500032"]["status"] == "AREA_FULL"
    assert area_requests["500032"]["covering_area_name"] == "Gachibowli"

    assert area_requests["509001"]["status"] == "READY"
    assert area_requests["509001"]["covering_area_name"] == "Mahbubnagar"

    assert area_requests["500081"]["status"] == "DONE"
    assert area_requests["500081"]["covering_area_name"] == "Madhapur"

    assert area_requests["110001"]["status"] == "WAITING"
    assert area_requests["110001"]["place"] is None


@pytest.mark.django_db
def test_submit_with_only_requests_accepted_and_zero_areas(
    partner_setup: PartnerSetup,
) -> None:
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "experience_years": 4,
            "skill_codes": [partner_setup.skill.code],
            "service_variant_ids": [str(partner_setup.variant.id)],
            "service_area_ids": [],
            "requested_postal_codes": ["509216"],
            "consents": [
                {"purpose": "partner_terms", "document_version": "2026-07"},
                {"purpose": "privacy_notice", "document_version": "2026-07"},
            ],
        },
        format="json",
    )
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)

    PartnerDocument.objects.create(
        application=app,
        kind=PartnerDocument.Kind.GOVERNMENT_ID,
        status=PartnerDocument.Status.PENDING,
        version=1,
        size_bytes=1024,
        sha256="a" * 64,
        content_type="image/jpeg",
        object_key=f"partners/{app.partner_id}/gov_id/doc.jpg",
    )

    sub_res = partner_setup.client.post(
        "/api/v1/partner/application/submit/",
        {"expected_version": app.version},
        format="json",
    )
    assert sub_res.status_code == HTTPStatus.OK
    app.refresh_from_db()
    assert app.status == PartnerApplication.Status.SUBMITTED


@pytest.mark.django_db
def test_approval_with_zero_areas_refused(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    reviewer_user, _ = ops_reviewer
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "experience_years": 4,
            "skill_codes": [partner_setup.skill.code],
            "service_variant_ids": [str(partner_setup.variant.id)],
            "service_area_ids": [],
            "requested_postal_codes": ["509216"],
            "consents": [
                {"purpose": "partner_terms", "document_version": "2026-07"},
                {"purpose": "privacy_notice", "document_version": "2026-07"},
            ],
        },
        format="json",
    )
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    PartnerDocument.objects.create(
        application=app,
        kind=PartnerDocument.Kind.GOVERNMENT_ID,
        status=PartnerDocument.Status.APPROVED,
        version=1,
        size_bytes=1024,
        sha256="a" * 64,
        content_type="image/jpeg",
        object_key=f"partners/{app.partner_id}/gov_id/doc.jpg",
    )
    app.status = PartnerApplication.Status.UNDER_REVIEW
    app.review_assigned_to = reviewer_user
    app.save()

    with pytest.raises(PartnerApplicationIncompleteError):
        transition_partner_application(
            reviewer=reviewer_user,
            application_id=app.id,
            target_status=PartnerApplication.Status.APPROVED,
            expected_version=app.version,
            reason="Approved",
        )


@pytest.mark.django_db
def test_unavailable_areas_error_details(partner_setup: PartnerSetup) -> None:
    partner_setup.service_area.is_accepting_partners = False
    partner_setup.service_area.save()

    res = partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Ravi Electrician",
            "service_area_ids": [str(partner_setup.service_area.id)],
        },
        format="json",
    )
    assert res.status_code == HTTPStatus.CONFLICT
    data = res.json()
    assert data["error"]["code"] == "partner_service_areas_unavailable"
    assert data["error"]["details"]["unavailable_service_area_ids"] == [
        str(partner_setup.service_area.id)
    ]


@pytest.mark.django_db
def test_operations_remove_area_during_review(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    reviewer_user, reviewer_client = ops_reviewer
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(partner_setup),
        format="json",
    )
    area2 = ServiceArea.objects.create(slug="east-hyd", name="East Hyderabad")
    partner = partner_setup.user.partner_profile
    PartnerServiceArea.objects.create(partner=partner, service_area=area2, is_active=True)

    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=partner_setup.service_area,
        weekday=0,
        starts_at=time(9, 0),
        ends_at=time(19, 0),
        is_active=True,
    )
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=area2,
        weekday=0,
        starts_at=time(9, 0),
        ends_at=time(19, 0),
        is_active=True,
    )

    app = PartnerApplication.objects.get(partner=partner)
    app.status = PartnerApplication.Status.UNDER_REVIEW
    app.review_assigned_to = reviewer_user
    app.save()

    res = reviewer_client.post(
        f"/api/v1/operations/partner-applications/{app.id}/remove-area/",
        {
            "expected_version": app.version,
            "service_area_id": str(area2.id),
            "reason": "Approve without East Hyderabad",
        },
        format="json",
    )
    assert res.status_code == HTTPStatus.OK
    app.refresh_from_db()
    assert res.json()["service_area_ids"] == [str(partner_setup.service_area.id)]

    assert not PartnerAvailabilityRule.objects.filter(
        partner=partner, service_area=area2, is_active=True
    ).exists()
    assert PartnerAvailabilityRule.objects.filter(
        partner=partner, service_area=partner_setup.service_area, is_active=True
    ).exists()

    assert AccessAuditEvent.objects.filter(
        action="operations.remove_partner_area",
        object_id=app.id,
    ).exists()
