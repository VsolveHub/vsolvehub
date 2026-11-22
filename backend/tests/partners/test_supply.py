"""Phase 2 of the Step 3 flow: supply targets and flags, turned-away demand, the 12-week trend and
recruitment (docs/onboarding-step3-flow/FLOW.md sections 3c-3e)."""

from datetime import date, timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import (
    PostalCode,
    ServiceArea,
    ServiceAreaPostalCode,
    UnservedDemandEvent,
)
from apps.locations.services import record_unserved_demand
from apps.partners.models import (
    CoverageSnapshot,
    PartnerApplication,
    PartnerProfile,
    PartnerServiceArea,
    PartnerSkill,
)
from apps.partners.services.supply import (
    FLAG_AMBER,
    FLAG_GREEN,
    FLAG_NONE,
    FLAG_RED,
    coverage_flag,
    take_coverage_snapshot,
    week_start_for,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup


@pytest.fixture
def ops(operations_user: User) -> APIClient:
    return force_role_client(user=operations_user, role_code="operations")


def _approved_partner_in(partner_setup: PartnerSetup, area: ServiceArea) -> PartnerProfile:
    """The fixture's partner, approved, holding `area` and the electrician trade."""
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Ravi Electrician"},
        format="json",
    )
    partner = PartnerProfile.objects.get(user=partner_setup.user)
    PartnerApplication.objects.filter(partner=partner).update(
        status=PartnerApplication.Status.APPROVED
    )
    PartnerServiceArea.objects.create(partner=partner, service_area=area, is_active=True)
    PartnerSkill.objects.create(partner=partner, skill=partner_setup.skill, is_active=True)
    return partner


class TestFlag:
    def test_ratios_follow_the_design_bars(self) -> None:
        assert coverage_flag(0, None) == FLAG_NONE
        assert coverage_flag(5, 0) == FLAG_NONE
        assert coverage_flag(2, 10) == FLAG_RED  # 20% of target
        assert coverage_flag(5, 10) == FLAG_AMBER  # 50%
        assert coverage_flag(7, 10) == FLAG_GREEN  # 70% is green
        assert coverage_flag(10, 10) == FLAG_GREEN

    def test_alert_below_turns_a_healthy_ratio_red(self) -> None:
        assert coverage_flag(8, 10) == FLAG_GREEN
        assert coverage_flag(8, 10, alert_below=9) == FLAG_RED

    def test_week_starts_on_monday(self) -> None:
        assert week_start_for(date(2026, 11, 19)) == date(2026, 11, 16)  # a Thursday
        assert week_start_for(date(2026, 11, 16)) == date(2026, 11, 16)


@pytest.mark.django_db
def test_targets_roundtrip_and_flag(partner_setup: PartnerSetup, ops: APIClient) -> None:
    area = partner_setup.service_area
    _approved_partner_in(partner_setup, area)

    res = ops.put(
        f"/api/v1/operations/service-areas/{area.id}/targets/",
        {
            "overall": {"target_partners": 4, "alert_below": 2},
            "trades": [{"skill_code": "electrician", "target_partners": 2}],
        },
        format="json",
    )
    assert res.status_code == HTTPStatus.OK, res.content
    body = res.json()
    assert body["overall"] == {
        "target_partners": 4,
        "alert_below": 2,
        "approved_partners": 1,
        "flag": "RED",  # 1 of 4 is 25%
    }
    electrician = next(t for t in body["trades"] if t["skill_code"] == "electrician")
    assert (electrician["approved_partners"], electrician["target_partners"]) == (1, 2)
    assert electrician["flag"] == "AMBER"  # 50%

    # An empty or zero target removes the row.
    cleared = ops.put(
        f"/api/v1/operations/service-areas/{area.id}/targets/",
        {"overall": {"target_partners": 0}, "trades": [{"skill_code": "electrician"}]},
        format="json",
    )
    assert cleared.json()["overall"]["flag"] == "NONE"
    assert cleared.json()["overall"]["target_partners"] is None


@pytest.mark.django_db
def test_alert_below_cannot_exceed_target(partner_setup: PartnerSetup, ops: APIClient) -> None:
    res = ops.put(
        f"/api/v1/operations/service-areas/{partner_setup.service_area.id}/targets/",
        {"overall": {"target_partners": 3, "alert_below": 5}},
        format="json",
    )
    assert res.status_code == HTTPStatus.BAD_REQUEST


@pytest.mark.django_db
def test_unknown_trade_is_refused(partner_setup: PartnerSetup, ops: APIClient) -> None:
    res = ops.put(
        f"/api/v1/operations/service-areas/{partner_setup.service_area.id}/targets/",
        {"trades": [{"skill_code": "plumber", "target_partners": 2}]},
        format="json",
    )
    assert res.status_code == HTTPStatus.BAD_REQUEST


@pytest.mark.django_db
def test_only_approved_partners_count_as_supply(
    partner_setup: PartnerSetup, ops: APIClient
) -> None:
    area = partner_setup.service_area
    partner = _approved_partner_in(partner_setup, area)
    PartnerApplication.objects.filter(partner=partner).update(
        status=PartnerApplication.Status.SUBMITTED
    )
    res = ops.get(f"/api/v1/operations/service-areas/{area.id}/targets/")
    assert res.json()["overall"]["approved_partners"] == 0


@pytest.mark.django_db
def test_turned_away_is_recorded_once_per_window_and_never_for_slot_problems() -> None:
    assert record_unserved_demand(postal_code="509216", reason_code="OUTSIDE_SERVICE_AREA") is True
    # The same lookup retried straight away counts once.
    assert record_unserved_demand(postal_code="509216", reason_code="OUTSIDE_SERVICE_AREA") is False
    # A slot problem is not unmet area demand.
    assert (
        record_unserved_demand(postal_code="509216", reason_code="OUTSIDE_OPERATING_HOURS") is False
    )
    assert UnservedDemandEvent.objects.filter(postal_code="509216").count() == 1


@pytest.mark.django_db
def test_customer_pin_check_records_a_turned_away_customer() -> None:
    res = APIClient().post(
        "/api/v1/serviceability/check/", {"postal_code": "509216"}, format="json"
    )
    assert res.status_code == HTTPStatus.OK
    assert res.json()["is_serviceable"] is False
    assert UnservedDemandEvent.objects.filter(postal_code="509216").count() == 1


@pytest.mark.django_db
def test_coverage_lite_reports_supply_turned_away_and_trend(
    partner_setup: PartnerSetup, ops: APIClient
) -> None:
    area = partner_setup.service_area
    pc = PostalCode.objects.create(code="500032", city="Gachibowli", state="Telangana")
    ServiceAreaPostalCode.objects.create(service_area=area, postal_code=pc)
    _approved_partner_in(partner_setup, area)
    ops.put(
        f"/api/v1/operations/service-areas/{area.id}/targets/",
        {"overall": {"target_partners": 10}},
        format="json",
    )
    UnservedDemandEvent.objects.create(postal_code="500032", reason_code="SERVICE_AREA_PAUSED")
    old = UnservedDemandEvent.objects.create(
        postal_code="500032", reason_code="SERVICE_AREA_PAUSED"
    )
    UnservedDemandEvent.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - timedelta(days=40)
    )
    last_week = week_start_for(timezone.localdate()) - timedelta(weeks=1)
    CoverageSnapshot.objects.create(week_start=last_week, service_area=area, approved_partners=3)

    data = ops.get("/api/v1/operations/coverage-lite/").json()
    item = next(a for a in data["areas"] if a["id"] == str(area.id))
    assert item["approved_partners"] == 1
    assert item["target_partners"] == 10
    assert item["flag"] == "RED"
    assert item["turned_away_28d_count"] == 1  # the 40-day-old one is outside the window
    assert len(item["trend"]) == 12
    assert item["trend"][-1] == 1  # this week is live
    assert item["trend"][-2] == 3  # last week is from its snapshot
    assert item["trend"][0] is None  # no snapshot that far back, not an invented zero
    assert data["summary"]["red_areas"] == 1
    assert data["summary"]["total_turned_away_28d"] == 1
    assert len(data["summary"]["trend_weeks"]) == 12


@pytest.mark.django_db
def test_snapshot_is_idempotent_within_a_week(partner_setup: PartnerSetup) -> None:
    _approved_partner_in(partner_setup, partner_setup.service_area)
    today = date(2026, 11, 19)
    first = take_coverage_snapshot(today=today)
    second = take_coverage_snapshot(today=today)
    assert first == second
    rows = CoverageSnapshot.objects.filter(
        week_start=date(2026, 11, 16), service_area=partner_setup.service_area
    )
    assert rows.filter(skill__isnull=True).get().approved_partners == 1
    assert rows.filter(skill=partner_setup.skill).get().approved_partners == 1
    assert rows.count() == 2


@pytest.mark.django_db
def test_recruitment_lists_red_and_amber_areas_with_a_tagged_link(
    partner_setup: PartnerSetup, ops: APIClient
) -> None:
    area = partner_setup.service_area
    ServiceArea.objects.create(slug="no-target", name="No target")  # no target, no flag
    _approved_partner_in(partner_setup, area)
    ops.put(
        f"/api/v1/operations/service-areas/{area.id}/targets/",
        {
            "overall": {"target_partners": 5},
            "trades": [{"skill_code": "electrician", "target_partners": 4}],
        },
        format="json",
    )

    res = ops.get("/api/v1/operations/recruitment-push/")
    assert res.status_code == HTTPStatus.OK
    needs = res.json()
    assert [n["slug"] for n in needs] == ["west-hyderabad"]
    assert needs[0]["shortfall"] == 4
    assert needs[0]["trade_gaps"][0]["skill_code"] == "electrician"
    assert needs[0]["trade_gaps"][0]["shortfall"] == 3
    assert "utm_campaign=west-hyderabad" in needs[0]["apply_link"]

    csv_res = ops.get("/api/v1/operations/recruitment-push/?format=csv")
    assert csv_res.status_code == HTTPStatus.OK
    assert "west-hyderabad" in csv_res.content.decode()


@pytest.mark.django_db
def test_area_requests_show_customer_lookups(partner_setup: PartnerSetup, ops: APIClient) -> None:
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {"display_name": "Applicant", "requested_postal_codes": ["509216"]},
        format="json",
    )
    for _ in range(2):
        UnservedDemandEvent.objects.create(postal_code="509216", reason_code="OUTSIDE_SERVICE_AREA")
    items = ops.get("/api/v1/operations/area-requests/").json()
    assert items[0]["customer_lookups_28d"] == 2


@pytest.mark.django_db
def test_new_area_lists_every_offerable_service_so_it_can_be_switched_on(
    partner_setup: PartnerSetup, ops: APIClient
) -> None:
    created = ops.post(
        "/api/v1/operations/service-areas/",
        {"slug": "shadnagar", "name": "Shadnagar", "zone": "South"},
        format="json",
    )
    assert created.status_code == HTTPStatus.CREATED, created.content
    area_id = created.json()["id"]

    detail = ops.get(f"/api/v1/operations/service-areas/{area_id}/").json()
    services = detail["services"]
    assert [s["variant_id"] for s in services] == [str(partner_setup.variant.id)]
    assert services[0]["is_active"] is False
    assert services[0]["skill_code"] == "electrician"
    assert (detail["services_active_count"], detail["services_total_count"]) == (0, 1)

    switched = ops.post(
        f"/api/v1/operations/service-areas/{area_id}/services/",
        {"variant_id": str(partner_setup.variant.id), "is_active": True},
        format="json",
    )
    assert switched.status_code == HTTPStatus.OK, switched.content
    detail = ops.get(f"/api/v1/operations/service-areas/{area_id}/").json()
    assert (detail["services_active_count"], detail["services_total_count"]) == (1, 1)

    listed = next(
        a for a in ops.get("/api/v1/operations/service-areas/").json() if a["id"] == area_id
    )
    assert listed["services_total_count"] == 1


@pytest.mark.django_db
def test_area_request_trades_carry_the_skill_code(
    partner_setup: PartnerSetup, ops: APIClient
) -> None:
    partner_setup.client.patch(
        "/api/v1/partner/application/",
        {
            "display_name": "Applicant",
            "skill_codes": ["electrician"],
            "requested_postal_codes": ["509216"],
        },
        format="json",
    )
    item = ops.get("/api/v1/operations/area-requests/").json()[0]
    assert item["trade_counts"] == [
        {"trade_name": "Electrician", "skill_code": "electrician", "count": 1}
    ]


@pytest.mark.django_db
def test_overlap_resolution_is_a_dry_run_until_applied_and_keeps_the_staffed_area(
    partner_setup: PartnerSetup,
) -> None:
    from django.core.management import call_command  # noqa: PLC0415

    pc = PostalCode.objects.create(code="509001", city="Mahbubnagar", state="Telangana")
    quiet = ServiceArea.objects.create(slug="aaa-quiet", name="AAA Quiet")
    staffed = partner_setup.service_area  # sorts after "AAA Quiet" by name
    ServiceAreaPostalCode.objects.create(service_area=quiet, postal_code=pc)
    ServiceAreaPostalCode.objects.create(service_area=staffed, postal_code=pc)
    _approved_partner_in(partner_setup, staffed)

    call_command("resolve_postal_code_overlaps")  # dry run
    assert ServiceAreaPostalCode.objects.filter(postal_code=pc).count() == 2

    call_command("resolve_postal_code_overlaps", "--apply")
    kept = ServiceAreaPostalCode.objects.get(postal_code=pc)
    assert kept.service_area_id == staffed.id  # approved partners beat the alphabet

    # Nothing left to resolve, and running it again changes nothing.
    call_command("resolve_postal_code_overlaps", "--apply")
    assert ServiceAreaPostalCode.objects.filter(postal_code=pc).count() == 1


@pytest.mark.django_db
def test_overlap_resolution_falls_back_to_open_then_name() -> None:
    from django.core.management import call_command  # noqa: PLC0415

    pc = PostalCode.objects.create(code="500032", city="Gachibowli", state="Telangana")
    full = ServiceArea.objects.create(slug="aaa-full", name="AAA Full", is_accepting_partners=False)
    open_ = ServiceArea.objects.create(slug="zzz-open", name="ZZZ Open")
    ServiceAreaPostalCode.objects.create(service_area=full, postal_code=pc)
    ServiceAreaPostalCode.objects.create(service_area=open_, postal_code=pc)

    call_command("resolve_postal_code_overlaps", "--apply")
    assert ServiceAreaPostalCode.objects.get(postal_code=pc).service_area_id == open_.id


@pytest.mark.django_db
def test_review_read_model_shows_zone_hours_mismatch_and_unoffered_services(
    partner_setup: PartnerSetup, ops: APIClient
) -> None:
    from datetime import time  # noqa: PLC0415

    from apps.catalog.models import ServiceVariant  # noqa: PLC0415
    from apps.partners.models import PartnerAvailabilityRule, PartnerService  # noqa: PLC0415

    offering = partner_setup.service_area  # offers the fixture variant
    offering.zone = "West"
    offering.save(update_fields=("zone",))
    empty = ServiceArea.objects.create(
        slug="miyapur", name="Miyapur", zone="North"
    )  # offers nothing
    partner = _approved_partner_in(partner_setup, offering)
    PartnerServiceArea.objects.create(partner=partner, service_area=empty, is_active=True)
    other_variant = ServiceVariant.objects.create(
        service=partner_setup.variant.service,
        code="other",
        name="Other job",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        required_skill_code="electrician",
        tax_category_code="technician-repair",
    )
    for variant in (partner_setup.variant, other_variant):
        PartnerService.objects.create(partner=partner, variant=variant, is_active=True)
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=offering,
        weekday=0,
        starts_at=time(9),
        ends_at=time(17),
        is_active=True,
    )
    application = PartnerApplication.objects.get(partner=partner)

    body = ops.get(f"/api/v1/operations/partner-applications/{application.id}/").json()
    details = {d["name"]: d for d in body["area_details"]}
    assert details["West Hyderabad"] == {
        "service_area_id": str(offering.id),
        "name": "West Hyderabad",
        "zone": "West",
        "hours_set": True,
        "offers_partner_trades": True,
    }
    assert details["Miyapur"]["hours_set"] is False
    assert details["Miyapur"]["offers_partner_trades"] is False  # the mismatch flag
    # The second variant is offered in neither chosen area.
    assert body["services_not_offered"] == ["Other job"]

    # The partner never sees Operations-only review detail about themselves.
    own = partner_setup.client.get("/api/v1/partner/application/").json()
    assert own["area_details"] == []
    assert own["services_not_offered"] == []
