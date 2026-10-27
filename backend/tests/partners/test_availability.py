from datetime import date, datetime, time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.carts.availability import load_snapshot
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerDocument,
    PartnerScheduleChangeAudit,
    PartnerServiceArea,
)
from apps.partners.services.review import (
    _seed_default_availability_if_missing,
    transition_partner_application,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup, application_payload

pytestmark = pytest.mark.django_db

WEEKLY_RULE_COUNT = 2


def _create_application(setup: PartnerSetup) -> None:
    response = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED


def test_partner_replaces_and_reads_weekly_schedule(partner_setup: PartnerSetup) -> None:
    _create_application(partner_setup)
    payload = {
        "rules": [
            {
                "service_area_id": str(partner_setup.service_area.id),
                "weekday": 0,
                "starts_at": "09:00",
                "ends_at": "13:00",
                "ends_next_day": False,
            },
            {
                "service_area_id": str(partner_setup.service_area.id),
                "weekday": 0,
                "starts_at": "14:00",
                "ends_at": "18:00",
                "ends_next_day": False,
            },
        ],
        "exceptions": [
            {
                "service_area_id": str(partner_setup.service_area.id),
                "date": "2026-08-15",
                "is_available": False,
                "reason": "Public holiday",
            },
        ],
    }
    updated = partner_setup.client.put(
        "/api/v1/partner/availability/",
        payload,
        format="json",
    )
    fetched = partner_setup.client.get("/api/v1/partner/availability/")

    assert updated.status_code == HTTPStatus.OK
    assert fetched.status_code == HTTPStatus.OK
    assert len(fetched.json()["rules"]) == WEEKLY_RULE_COUNT
    assert fetched.json()["exceptions"][0]["date"] == str(date(2026, 8, 15))
    assert PartnerAvailabilityRule.objects.count() == WEEKLY_RULE_COUNT
    assert PartnerAvailabilityException.objects.count() == 1


def test_overlapping_and_unapproved_area_schedules_are_rejected(
    partner_setup: PartnerSetup,
) -> None:
    _create_application(partner_setup)
    overlapping = partner_setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(partner_setup.service_area.id),
                    "weekday": 0,
                    "starts_at": "09:00",
                    "ends_at": "13:00",
                },
                {
                    "service_area_id": str(partner_setup.service_area.id),
                    "weekday": 0,
                    "starts_at": "12:00",
                    "ends_at": "18:00",
                },
            ],
            "exceptions": [],
        },
        format="json",
    )
    other_area = ServiceArea.objects.create(slug="east-hyderabad", name="East Hyderabad")
    wrong_area = partner_setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(other_area.id),
                    "weekday": 1,
                    "starts_at": "09:00",
                    "ends_at": "18:00",
                },
            ],
            "exceptions": [],
        },
        format="json",
    )

    assert overlapping.status_code == HTTPStatus.BAD_REQUEST
    assert overlapping.json()["error"]["code"] == "partner_schedule_invalid"
    assert wrong_area.status_code == HTTPStatus.BAD_REQUEST
    assert PartnerAvailabilityRule.objects.count() == 0


def test_overnight_window_must_be_explicit(partner_setup: PartnerSetup) -> None:
    _create_application(partner_setup)
    response = partner_setup.client.put(
        "/api/v1/partner/availability/",
        {
            "rules": [
                {
                    "service_area_id": str(partner_setup.service_area.id),
                    "weekday": 5,
                    "starts_at": "22:00",
                    "ends_at": "02:00",
                    "ends_next_day": False,
                },
            ],
            "exceptions": [],
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_operations_schedule_change_requires_partner_consent_and_is_audited(
    partner_setup: PartnerSetup,
    operations_user: User,
) -> None:
    _create_application(partner_setup)
    application = PartnerApplication.objects.get(partner__user=partner_setup.user)
    client = force_role_client(user=operations_user, role_code="operations")
    payload = {
        "consent_purpose": "partner_terms",
        "consent_document_version": "2026-07",
        "rules": [
            {
                "service_area_id": str(partner_setup.service_area.id),
                "weekday": 0,
                "starts_at": "09:00",
                "ends_at": "17:00",
            },
        ],
        "exceptions": [],
    }

    response = client.put(
        f"/api/v1/operations/partners/{application.partner_id}/availability/",
        payload,
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["rules"][0]["starts_at"] == "09:00:00"
    audit = PartnerScheduleChangeAudit.objects.get(partner_id=application.partner_id)
    assert audit.actor == operations_user
    assert audit.consent.purpose == "partner_terms"
    assert audit.previous_schedule == {"rules": [], "exceptions": []}

    payload["consent_document_version"] = "not-accepted"
    denied = client.put(
        f"/api/v1/operations/partners/{application.partner_id}/availability/",
        payload,
        format="json",
    )
    assert denied.status_code == HTTPStatus.BAD_REQUEST


def _approve_required_document(app: PartnerApplication) -> PartnerDocument:
    return PartnerDocument.objects.create(
        application=app,
        kind=PartnerDocument.Kind.GOVERNMENT_ID,
        version=1,
        status=PartnerDocument.Status.APPROVED,
        object_key=f"partners/{app.partner_id}/gov_id/doc.jpg",
        content_type="image/jpeg",
        size_bytes=1024,
        sha256="a" * 64,
    )


def test_approval_does_not_overwrite_existing_custom_availability(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    _create_application(partner_setup)
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    _approve_required_document(app)
    # Partner configures custom availability: Monday 10:00 to 14:00
    PartnerAvailabilityRule.objects.create(
        partner=app.partner,
        service_area=partner_setup.service_area,
        weekday=0,
        starts_at=time(10, 0),
        ends_at=time(14, 0),
        ends_next_day=False,
        is_active=True,
    )
    assert PartnerAvailabilityRule.objects.filter(partner=app.partner, is_active=True).count() == 1

    # Transition to APPROVED
    app.status = PartnerApplication.Status.UNDER_REVIEW
    app.review_assigned_to = operations_user
    app.save(update_fields=("status", "review_assigned_to"))

    transition_partner_application(
        reviewer=operations_user,
        application_id=app.id,
        expected_version=app.version,
        target_status=PartnerApplication.Status.APPROVED,
        reason="Verification approved",
    )

    # Custom availability was NOT overwritten or seeded with default 7 rules
    rules = PartnerAvailabilityRule.objects.filter(partner=app.partner, is_active=True)
    assert rules.count() == 1
    assert rules.first().starts_at == time(10, 0)
    assert rules.first().ends_at == time(14, 0)


def test_approval_seeds_default_rules_only_for_service_areas_with_zero_active_rules(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    _create_application(partner_setup)
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    _approve_required_document(app)
    second_area = ServiceArea.objects.create(slug="east-hyderabad", name="East Hyderabad")
    PartnerServiceArea.objects.create(partner=app.partner, service_area=second_area, is_active=True)

    # First area has 1 custom rule, second area has 0 rules
    PartnerAvailabilityRule.objects.create(
        partner=app.partner,
        service_area=partner_setup.service_area,
        weekday=1,
        starts_at=time(11, 0),
        ends_at=time(16, 0),
        ends_next_day=False,
        is_active=True,
    )

    app.status = PartnerApplication.Status.UNDER_REVIEW
    app.review_assigned_to = operations_user
    app.save(update_fields=("status", "review_assigned_to"))

    transition_partner_application(
        reviewer=operations_user,
        application_id=app.id,
        expected_version=app.version,
        target_status=PartnerApplication.Status.APPROVED,
        reason="Verification approved",
    )

    # First area still has its 1 custom rule
    first_area_rules = PartnerAvailabilityRule.objects.filter(
        partner=app.partner, service_area=partner_setup.service_area, is_active=True
    )
    assert first_area_rules.count() == 1
    assert first_area_rules.first().weekday == 1
    assert first_area_rules.first().starts_at == time(11, 0)

    # Second area has 7 seeded rules (Mon-Sun 09:00-19:00)
    second_area_rules = PartnerAvailabilityRule.objects.filter(
        partner=app.partner, service_area=second_area, is_active=True
    )
    assert second_area_rules.count() == 7
    assert set(second_area_rules.values_list("weekday", flat=True)) == set(range(7))
    for rule in second_area_rules:
        assert rule.starts_at == time(9, 0)
        assert rule.ends_at == time(19, 0)


def test_approval_seeding_is_idempotent(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    _create_application(partner_setup)
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    _approve_required_document(app)
    app.status = PartnerApplication.Status.UNDER_REVIEW
    app.review_assigned_to = operations_user
    app.save(update_fields=("status", "review_assigned_to"))

    transition_partner_application(
        reviewer=operations_user,
        application_id=app.id,
        expected_version=app.version,
        target_status=PartnerApplication.Status.APPROVED,
        reason="Verification approved",
    )
    assert PartnerAvailabilityRule.objects.filter(partner=app.partner, is_active=True).count() == 7

    # Calling safety net seeding again directly doesn't duplicate rules
    seeded_again = _seed_default_availability_if_missing(partner=app.partner)
    assert len(seeded_again) == 0
    assert PartnerAvailabilityRule.objects.filter(partner=app.partner, is_active=True).count() == 7


def test_approval_only_seeds_during_real_transition_to_approved(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    _create_application(partner_setup)
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    app.status = PartnerApplication.Status.UNDER_REVIEW
    app.review_assigned_to = operations_user
    app.save(update_fields=("status", "review_assigned_to"))

    # Transition to CHANGES_REQUIRED should NOT seed rules
    transition_partner_application(
        reviewer=operations_user,
        application_id=app.id,
        expected_version=app.version,
        target_status=PartnerApplication.Status.CHANGES_REQUIRED,
        reason="Missing documents",
    )
    assert PartnerAvailabilityRule.objects.filter(partner=app.partner).count() == 0


def test_booking_engine_returns_capacity_for_approved_partner_with_valid_rules(
    partner_setup: PartnerSetup,
) -> None:
    _create_application(partner_setup)
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    app.status = PartnerApplication.Status.APPROVED
    app.save(update_fields=("status",))

    # Add Mon-Sun rules
    for weekday in range(7):
        PartnerAvailabilityRule.objects.create(
            partner=app.partner,
            service_area=partner_setup.service_area,
            weekday=weekday,
            starts_at=time(9, 0),
            ends_at=time(19, 0),
            is_active=True,
        )

    zone = ZoneInfo(partner_setup.service_area.timezone or "Asia/Kolkata")
    now_local = timezone.now().astimezone(zone)
    target_start = (now_local + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)

    snapshot = load_snapshot(
        variant_ids=(partner_setup.variant.id,),
        area=partner_setup.service_area,
        horizon_start=target_start - timedelta(days=1),
        horizon_end=target_start + timedelta(days=2),
    )
    assert snapshot.capacity(starts_at=target_start, duration_minutes=60) == 1


def test_booking_engine_returns_no_capacity_for_approved_partner_with_zero_active_rules(
    partner_setup: PartnerSetup,
) -> None:
    _create_application(partner_setup)
    app = PartnerApplication.objects.get(partner__user=partner_setup.user)
    app.status = PartnerApplication.Status.APPROVED
    app.save(update_fields=("status",))

    # Zero active availability rules
    assert PartnerAvailabilityRule.objects.filter(partner=app.partner, is_active=True).count() == 0

    zone = ZoneInfo(partner_setup.service_area.timezone or "Asia/Kolkata")
    now_local = timezone.now().astimezone(zone)
    target_start = (now_local + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)

    snapshot = load_snapshot(
        variant_ids=(partner_setup.variant.id,),
        area=partner_setup.service_area,
        horizon_start=target_start - timedelta(days=1),
        horizon_end=target_start + timedelta(days=2),
    )
    assert snapshot.capacity(starts_at=target_start, duration_minutes=60) == 0

