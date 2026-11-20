"""Tests for Phase 1b Operations Tools (FLOW.md, IMPLEMENTATION_PLAN.md).

Covers:
- B11: ServiceArea.zone field and serialization
- B12: report_postal_code_overlaps management command
- B13: Operations Areas API (list, create, patch, add pin, remove pin, toggle service,
  bulk preview & apply)
- B14: Operations Area Requests API & Notification trigger & Dismiss
- B15: Add area to approved partner (with schedule rule copy)
- B16: Coverage Lite reporting & CSV export
"""

import io
from datetime import time
from http import HTTPStatus

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.identity.models import User
from apps.locations.models import PostalCode, ServiceArea, ServiceAreaPostalCode, ServiceAreaService
from apps.partners.models import (
    PartnerApplication,
    PartnerAreaRequest,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerScheduleChangeAudit,
    PartnerServiceArea,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup, application_payload


@pytest.fixture
def ops_reviewer(operations_user: User) -> tuple[User, APIClient]:
    client = force_role_client(user=operations_user, role_code="operations")
    return operations_user, client


@pytest.fixture
def sample_catalog() -> tuple[Category, Service, ServiceVariant]:
    category, _ = Category.objects.get_or_create(slug="electrical", defaults={"name": "Electrical"})
    subcat, _ = Subcategory.objects.get_or_create(
        category=category, slug="wiring", defaults={"name": "Wiring"}
    )
    service, _ = Service.objects.get_or_create(
        subcategory=subcat,
        slug="switch-repair",
        defaults={"name": "Switch Repair", "short_description": "Fix switches"},
    )
    variant, _ = ServiceVariant.objects.get_or_create(
        service=service,
        code="standard-switch",
        defaults={
            "name": "Standard Switch Repair",
            "pricing_strategy": ServiceVariant.PricingStrategy.DURATION,
            "required_skill_code": "electrician",
            "tax_category_code": "technician-repair",
        },
    )
    return category, service, variant


@pytest.mark.django_db
def test_b11_service_area_zone_model_and_api(ops_reviewer: tuple[User, APIClient]) -> None:
    _, client = ops_reviewer
    area = ServiceArea.objects.create(
        slug="hyderabad-west-hitec",
        name="Hitec City",
        zone="Hyderabad West",
        is_accepting_partners=True,
    )
    assert area.zone == "Hyderabad West"

    # Read from public service-areas API
    res = client.get("/api/v1/service-areas/")
    assert res.status_code == HTTPStatus.OK
    areas = res.json()
    item = next(a for a in areas if a["slug"] == "hyderabad-west-hitec")
    assert item["zone"] == "Hyderabad West"

    # Read from operations API
    ops_res = client.get("/api/v1/operations/service-areas/")
    assert ops_res.status_code == HTTPStatus.OK
    ops_areas = ops_res.json()
    ops_item = next(a for a in ops_areas if a["slug"] == "hyderabad-west-hitec")
    assert ops_item["zone"] == "Hyderabad West"


@pytest.mark.django_db
def test_b12_report_postal_code_overlaps_command() -> None:
    pc1 = PostalCode.objects.create(code="500081", city="Hyderabad", state="Telangana")
    pc2 = PostalCode.objects.create(code="500082", city="Hyderabad", state="Telangana")
    area_a = ServiceArea.objects.create(slug="area-a", name="Area A")
    area_b = ServiceArea.objects.create(slug="area-b", name="Area B")

    ServiceAreaPostalCode.objects.create(service_area=area_a, postal_code=pc1)
    ServiceAreaPostalCode.objects.create(service_area=area_b, postal_code=pc1)
    ServiceAreaPostalCode.objects.create(service_area=area_b, postal_code=pc2)

    out = io.StringIO()
    call_command("report_postal_code_overlaps", stdout=out)
    output = out.getvalue()
    assert "Found 1 postal code(s) belonging to multiple service areas" in output
    assert "500081" in output
    assert "Area A" in output
    assert "Area B" in output


@pytest.mark.django_db
def test_b13_operations_areas_crud_and_pin_conflict(
    ops_reviewer: tuple[User, APIClient],
    sample_catalog: tuple[Category, Service, ServiceVariant],
) -> None:
    _, client = ops_reviewer
    _, _, variant = sample_catalog

    # Create area
    create_res = client.post(
        "/api/v1/operations/service-areas/",
        {
            "slug": "gachibowli",
            "name": "Gachibowli",
            "zone": "Hyderabad West",
            "state_code": "TS",
            "is_accepting_partners": True,
        },
        format="json",
    )
    assert create_res.status_code == HTTPStatus.CREATED
    area_data = create_res.json()
    area_id = area_data["id"]

    # Patch area
    patch_res = client.patch(
        f"/api/v1/operations/service-areas/{area_id}/",
        {"name": "Gachibowli Hub", "is_accepting_partners": False},
        format="json",
    )
    assert patch_res.status_code == HTTPStatus.OK
    assert patch_res.json()["name"] == "Gachibowli Hub"
    assert not patch_res.json()["is_accepting_partners"]

    # Add PIN with new city/state
    add_pin_res = client.post(
        f"/api/v1/operations/service-areas/{area_id}/pins/",
        {"postal_code": "500032", "city": "Hyderabad", "state": "Telangana"},
        format="json",
    )
    assert add_pin_res.status_code == HTTPStatus.CREATED
    assert ServiceAreaPostalCode.objects.filter(
        service_area_id=area_id, postal_code__code="500032"
    ).exists()

    # Create second area and try to add same PIN -> 409 postal_code_in_other_area
    area2 = ServiceArea.objects.create(slug="kondapur", name="Kondapur")
    conflict_res = client.post(
        f"/api/v1/operations/service-areas/{area2.id}/pins/",
        {"postal_code": "500032"},
        format="json",
    )
    assert conflict_res.status_code == HTTPStatus.CONFLICT
    err_data = conflict_res.json()
    assert err_data["error"]["code"] == "postal_code_in_other_area"
    assert err_data["error"]["details"]["postal_code"] == "500032"
    assert err_data["error"]["details"]["area_name"] == "Gachibowli Hub"

    # Remove PIN
    del_res = client.delete(f"/api/v1/operations/service-areas/{area_id}/pins/500032/")
    assert del_res.status_code == HTTPStatus.OK
    assert not ServiceAreaPostalCode.objects.filter(
        service_area_id=area_id, postal_code__code="500032"
    ).exists()

    # Toggle service variant
    toggle_res = client.post(
        f"/api/v1/operations/service-areas/{area_id}/services/",
        {"variant_id": str(variant.id), "is_active": True},
        format="json",
    )
    assert toggle_res.status_code == HTTPStatus.OK
    assert ServiceAreaService.objects.filter(
        service_area_id=area_id, variant_id=variant.id, is_active=True
    ).exists()


@pytest.mark.django_db
def test_b13_bulk_pin_preview_and_apply(ops_reviewer: tuple[User, APIClient]) -> None:
    _, client = ops_reviewer
    area1 = ServiceArea.objects.create(slug="area-one", name="Area One")
    area2 = ServiceArea.objects.create(slug="area-two", name="Area Two")
    pc = PostalCode.objects.create(code="500001", city="Hyderabad", state="Telangana")
    ServiceAreaPostalCode.objects.create(service_area=area1, postal_code=pc)

    csv_data = (
        "pin,area_slug,city,state\n"
        "500001,area-two,Hyderabad,Telangana\n"  # conflict: 500001 in area-one
        "500002,area-two,Hyderabad,Telangana\n"  # new pin
        "999999,non-existent,Nowhere,Telangana\n"  # unknown area
        "123,area-two,Bad,Pin\n"  # invalid pin
    )

    # Preview
    preview_res = client.post(
        "/api/v1/operations/service-areas/bulk-pins/preview/",
        {"csv_content": csv_data},
        format="json",
    )
    assert preview_res.status_code == HTTPStatus.OK
    preview_data = preview_res.json()
    assert preview_data["total"] == 4
    assert preview_data["conflict"] == 1
    assert preview_data["add"] == 1
    assert preview_data["unknown_area"] == 1
    assert preview_data["invalid"] == 1
    assert len(preview_data["conflicts"]) == 1
    assert preview_data["conflicts"][0]["pin"] == "500001"

    # Apply with MOVE resolution for 500001
    apply_res = client.post(
        "/api/v1/operations/service-areas/bulk-pins/apply/",
        {
            "csv_content": csv_data,
            "conflict_resolutions": {"500001": "MOVE"},
        },
        format="json",
    )
    assert apply_res.status_code == HTTPStatus.OK
    apply_data = apply_res.json()
    assert apply_data["moved"] == 1
    assert apply_data["added"] == 1

    # Verify 500001 moved to area2
    assert not ServiceAreaPostalCode.objects.filter(
        service_area=area1, postal_code__code="500001"
    ).exists()
    assert ServiceAreaPostalCode.objects.filter(
        service_area=area2, postal_code__code="500001"
    ).exists()
    # Verify 500002 added to area2
    assert ServiceAreaPostalCode.objects.filter(
        service_area=area2, postal_code__code="500002"
    ).exists()


@pytest.mark.django_db
def test_b14_area_requests_grouped_notify_and_dismiss(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    ops_user, client = ops_reviewer
    PostalCode.objects.create(code="509216", city="Shadnagar", state="Telangana")

    # Partner requested 509216
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Applicant 1",
            "experience_years": 3,
            "skill_codes": [partner_setup.skill.code],
            "service_variant_ids": [str(partner_setup.variant.id)],
            "service_area_ids": [],
            "requested_postal_codes": ["509216"],
        },
        format="json",
    )

    # 1. Read grouped area requests
    res = client.get("/api/v1/operations/area-requests/")
    assert res.status_code == HTTPStatus.OK
    items = res.json()
    assert len(items) == 1
    item = items[0]
    assert item["postal_code"] == "509216"
    assert item["place"] == "Shadnagar"
    assert item["status"] == "WAITING"
    assert item["request_count"] == 1
    assert partner_setup.skill.name in item["trades"]

    # 2a. Nothing covers the PIN yet, so there is nothing to announce.
    refused = client.post("/api/v1/operations/area-requests/509216/notify/")
    assert refused.status_code == HTTPStatus.CONFLICT

    # 2b. Once an open area covers it, the asking partner is notified.
    area = ServiceArea.objects.create(
        slug="shadnagar", name="Shadnagar", is_accepting_partners=True
    )
    ServiceAreaPostalCode.objects.create(
        service_area=area, postal_code=PostalCode.objects.get(code="509216")
    )
    notify_res = client.post("/api/v1/operations/area-requests/509216/notify/")
    assert notify_res.status_code == HTTPStatus.OK
    notify_data = notify_res.json()
    assert notify_data["notified_count"] == 1

    req = PartnerAreaRequest.objects.get(postal_code="509216")
    assert req.notified_at is not None

    # 3. Dismiss (Mark not valid)
    dismiss_res = client.post(
        "/api/v1/operations/area-requests/509216/dismiss/",
        {"reason": "Not in target roadmap"},
        format="json",
    )
    assert dismiss_res.status_code == HTTPStatus.OK
    assert dismiss_res.json()["count"] == 1

    req.refresh_from_db()
    assert req.dismissed_at is not None
    assert req.dismissed_by == ops_user


@pytest.mark.django_db
def test_b15_add_area_to_approved_partner_copies_hours(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    _ops_user, client = ops_reviewer
    partner_setup.client.patch(
        "/api/v1/partner/application/", application_payload(partner_setup), format="json"
    )
    partner = partner_setup.user.partner_profile
    app = partner.application
    app.status = PartnerApplication.Status.APPROVED
    app.save()

    existing_area = partner_setup.service_area
    new_area = ServiceArea.objects.create(
        slug="new-zone-area",
        name="New Zone Area",
        is_active=True,
    )
    # Enable partner's variant in new area
    ServiceAreaService.objects.create(
        service_area=new_area,
        variant=partner_setup.variant,
        is_active=True,
    )

    # Setup existing schedule rules on existing_area
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=existing_area,
        weekday=1,
        starts_at=time(9, 0),
        ends_at=time(17, 0),
        is_active=True,
    )
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=existing_area,
        weekday=2,
        starts_at=time(9, 0),
        ends_at=time(17, 0),
        is_active=True,
    )

    # Call add area endpoint
    add_res = client.post(
        f"/api/v1/operations/partners/{partner.id}/add-area/",
        {"service_area_id": str(new_area.id), "reason": "Requested area opened"},
        format="json",
    )
    assert add_res.status_code == HTTPStatus.OK
    res_data = add_res.json()
    assert res_data["status"] == "added"
    assert res_data["rules_copied_count"] == 2

    # Verify PartnerServiceArea link
    assert PartnerServiceArea.objects.filter(
        partner=partner, service_area=new_area, is_active=True
    ).exists()

    # Verify rules were copied
    copied_rules = PartnerAvailabilityRule.objects.filter(
        partner=partner, service_area=new_area, is_active=True
    )
    assert copied_rules.count() == 2
    assert set(copied_rules.values_list("weekday", flat=True)) == {1, 2}

    # Verify audit
    assert PartnerScheduleChangeAudit.objects.filter(partner=partner).exists()


@pytest.mark.django_db
def test_b16_coverage_lite_report_and_csv(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    _, client = ops_reviewer
    area = partner_setup.service_area
    area.zone = "Hyderabad East"
    area.save()

    # JSON report
    res = client.get("/api/v1/operations/coverage-lite/")
    assert res.status_code == HTTPStatus.OK
    data = res.json()
    assert "summary" in data
    assert "areas" in data
    assert data["summary"]["total_areas"] >= 1
    area_item = next(a for a in data["areas"] if a["id"] == str(area.id))
    assert area_item["zone"] == "Hyderabad East"

    # CSV report
    csv_res = client.get("/api/v1/operations/coverage-lite/?format=csv")
    assert csv_res.status_code == HTTPStatus.OK
    assert "text/csv" in csv_res["Content-Type"]
    assert "Hyderabad East" in csv_res.content.decode("utf-8")


@pytest.mark.django_db
def test_requests_from_partners_who_already_hold_the_area_are_done_not_demand(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    """FLOW.md section 2: a request is Done once the partner holds an area covering the PIN."""
    _ops_user, client = ops_reviewer
    pc = PostalCode.objects.create(code="509216", city="Shadnagar", state="Telangana")
    area = ServiceArea.objects.create(
        slug="shadnagar", name="Shadnagar", is_accepting_partners=True
    )
    ServiceAreaPostalCode.objects.create(service_area=area, postal_code=pc)

    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Applicant 1", "requested_postal_codes": ["509216"]},
        format="json",
    )
    assert [i["status"] for i in client.get("/api/v1/operations/area-requests/").json()] == [
        "READY"
    ]

    PartnerServiceArea.objects.create(
        partner=PartnerProfile.objects.get(user=partner_setup.user),
        service_area=area,
        is_active=True,
    )
    assert client.get("/api/v1/operations/area-requests/").json() == []
    done = client.get("/api/v1/operations/area-requests/?status=DONE").json()
    assert [i["status"] for i in done] == ["DONE"]


@pytest.mark.django_db
def test_bulk_apply_refuses_unknown_pin_without_city_and_state(
    ops_reviewer: tuple[User, APIClient],
) -> None:
    _ops_user, client = ops_reviewer
    ServiceArea.objects.create(slug="shadnagar", name="Shadnagar")
    res = client.post(
        "/api/v1/operations/service-areas/bulk-pins/apply/",
        {"rows": [{"pin": "509216", "area_slug": "shadnagar"}]},
        format="json",
    )
    assert res.status_code == HTTPStatus.OK
    body = res.json()
    assert body["added"] == 0
    assert len(body["row_errors"]) == 1
    assert not PostalCode.objects.filter(code="509216").exists()


@pytest.mark.django_db
def test_dismiss_with_application_id_only_dismisses_that_partners_request(
    partner_setup: PartnerSetup,
    ops_reviewer: tuple[User, APIClient],
) -> None:
    """The review screen marks one application's PIN not valid, never every partner's."""
    _ops_user, client = ops_reviewer
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Applicant 1", "requested_postal_codes": ["509216"]},
        format="json",
    )
    other_user = User.objects.create_user(phone_number="+919222222222", full_name="Other")
    other_app = PartnerApplication.objects.create(
        partner=PartnerProfile.objects.create(user=other_user, display_name="Other"),
    )
    PartnerAreaRequest.objects.create(application=other_app, postal_code="509216")

    mine = PartnerApplication.objects.get(partner__user=partner_setup.user)
    res = client.post(
        "/api/v1/operations/area-requests/509216/dismiss/",
        {"application_id": str(mine.id)},
        format="json",
    )
    assert res.status_code == HTTPStatus.OK
    assert res.json()["count"] == 1
    assert PartnerAreaRequest.objects.get(application=mine).dismissed_at is not None
    assert PartnerAreaRequest.objects.get(application=other_app).dismissed_at is None
