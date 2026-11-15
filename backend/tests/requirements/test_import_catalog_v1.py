"""`import_catalog_v1`: the Version 1 priced-on-site services, photos, rates and approvals.

Builds the smallest world the command needs (the four live sibling services it copies settings
from, the seven tiles, the five pricing trades, one area and one staff user) and checks what the
command writes, that a preview writes nothing and that a rerun changes nothing.
"""

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceMedia,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import User
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.capabilities import request_capability, transition_capability
from apps.partners.models import (
    PartnerCapability,
    PartnerCapabilityTransition,
    PartnerProfile,
    PartnerServiceArea,
    Skill,
)
from apps.requirements.management.commands.import_catalog_v1 import (
    GRANT_REASON_CODE,
    V1_SERVICES,
    Rate,
)
from apps.requirements.models import WorkItem, WorkItemRate

pytestmark = pytest.mark.django_db

A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
TILES = (
    ("electrician", "renovation-projects"),
    ("plumber", "renovation-projects"),
    ("technician", "carpenter"),
    ("technician", "internet-technician"),
    ("technician", "cctv-technician"),
    ("technician", "home-automation-technician"),
    ("beautician", "bridal-events"),
)
#: sibling slug -> the tile it sits in.
SIBLINGS = {
    "full-home-rewiring": ("electrician", "renovation-projects"),
    "full-bathroom-renovation": ("plumber", "renovation-projects"),
    "modular-kitchen-fit-out": ("technician", "carpenter"),
    "bridal-event-makeup": ("beautician", "bridal-events"),
}
PRICING_TRADES = ("electrician", "plumber", "carpenter", "internet-technician", "cctv-technician")
ELECTRICIAN_SLUGS = {
    "new-house-wiring",
    "concealed-wiring",
    "open-wiring",
    "conduit-pipe-laying",
    "cable-pulling",
}
NO_SIBLING_TRADE_SLUGS = {"lan-cable-wiring", "full-cctv-setup", "cctv-wiring", "smart-home-setup"}
V1_SLUGS = [row.slug for row in V1_SERVICES]


def _world() -> ServiceArea:
    staff = User.objects.create_user(phone_number="+919812300001", full_name="Ops")
    staff.is_staff = True
    staff.save(update_fields=["is_staff"])
    area = ServiceArea.objects.create(slug="hyderabad-500032", name="Hyderabad")
    for code in PRICING_TRADES:
        Skill.objects.create(code=code, name=code.title())
    tiles: dict[tuple[str, str], Subcategory] = {}
    for category_slug, tile_slug in TILES:
        category, _ = Category.objects.get_or_create(
            slug=category_slug, defaults={"name": category_slug.title()}
        )
        tiles[(category_slug, tile_slug)] = Subcategory.objects.create(
            category=category, slug=tile_slug, name=tile_slug.title()
        )
    for slug, tile in SIBLINGS.items():
        service = Service.objects.create(
            subcategory=tiles[tile],
            slug=slug,
            name=slug.replace("-", " ").title(),
            short_description="Sibling.",
            icon_key="electrical",
            status=Service.Status.ACTIVE,
        )
        variant = ServiceVariant.objects.create(
            service=service,
            code="standard",
            name="Priced on site",
            pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
            booking_archetype=A5,
            required_skill_code=slug,
            tax_category_code="services-standard",
        )
        M2VariantConfiguration.objects.create(
            variant=variant,
            version=1,
            status=M2VariantConfiguration.Status.ACTIVE,
            question_schema={"questions": [{"code": "occasion", "kind": "SELECT"}]},
            pricing_skill_code="sibling-trade",
            material_fulfilment_mode=M2VariantConfiguration.MaterialFulfilmentMode.CUSTOMER_PROCURES,
            first_quote_sla_hours=24,
            quote_delivery_sla_hours=72,
            max_quotes=3,
            commission_basis_points=1_500,
        )
        ServiceAreaService.objects.create(service_area=area, variant=variant, is_active=True)
    Service.objects.create(
        subcategory=tiles[("technician", "carpenter")],
        slug="cupboard-hinge-repair",
        name="Cupboard / Hinge Repair",
        short_description="Repair.",
        status=Service.Status.ACTIVE,
    )
    return area


def _approved_rewiring_partner(area: ServiceArea) -> PartnerProfile:
    user = User.objects.create_user(phone_number="+919812300002", full_name="Ravi K")
    partner = PartnerProfile.objects.create(user=user, display_name="Ravi K")
    PartnerServiceArea.objects.create(partner=partner, service_area=area, is_active=True)
    variant = ServiceVariant.objects.get(service__slug="full-home-rewiring")
    capability = request_capability(partner=partner, variant=variant, service_areas=[area])
    for status in (PartnerCapability.Status.UNDER_REVIEW, PartnerCapability.Status.APPROVED):
        transition_capability(
            capability_id=capability.id, to_status=status, actor=None, reason_code="test"
        )
    return partner


def _run(*flags: str) -> str:
    out = StringIO()
    call_command("import_catalog_v1", *flags, stdout=out)
    return out.getvalue()


class TestTheSheetRows:
    def test_twenty_one_services_twenty_two_photos_fifteen_rates(self) -> None:
        assert len(V1_SERVICES) == 21
        assert len(set(V1_SLUGS)) == 21
        photos = [row.photo for row in V1_SERVICES]
        assert len(set(photos)) == 21
        assert all(photo.endswith(".jpeg") for photo in photos)
        assert sum(row.rate is not None for row in V1_SERVICES) == 15

    def test_the_reference_rate_is_the_middle_and_the_band_reaches_both_ends(self) -> None:
        wiring = Rate("sq_ft", 40, 80)
        assert wiring.reference_paise == 6_000
        assert wiring.band_bps == 3_333
        cable = Rate("running_ft", 15, 35)
        assert cable.reference_paise == 2_500
        assert cable.band_bps == 4_000

    def test_every_card_states_its_price(self) -> None:
        for row in V1_SERVICES:
            assert "₹" in row.short_description, row.slug
            assert row.short_description.endswith("."), row.slug


class TestPreview:
    def test_a_preview_writes_nothing(self) -> None:
        _world()
        output = _run()

        assert "Preview only" in output
        assert not Service.objects.filter(slug__in=V1_SLUGS).exists()
        assert not WorkItem.objects.exists()
        cover = ServiceMedia.objects.filter(service__slug="cupboard-hinge-repair")
        assert not cover.exists()


class TestApply:
    def test_every_service_is_priced_on_site_with_its_photo_and_areas(self) -> None:
        area = _world()
        _run("--apply")

        services = Service.objects.filter(slug__in=V1_SLUGS)
        assert services.count() == 21
        assert set(services.values_list("status", flat=True)) == {Service.Status.ACTIVE}
        for row in V1_SERVICES:
            variant = ServiceVariant.objects.get(service__slug=row.slug, code="standard")
            assert variant.booking_archetype == A5
            assert variant.required_skill_code == row.slug
            assert Skill.objects.filter(code=row.slug, is_active=True).exists()
            assert ServiceAreaService.objects.filter(
                variant=variant, service_area=area, is_active=True
            ).exists()
            cover = ServiceMedia.objects.get(service__slug=row.slug, kind=ServiceMedia.Kind.COVER)
            assert cover.url.endswith(f"/Images/catalog-v2/{row.photo}")

    def test_the_configuration_is_the_siblings_with_the_trade_and_no_questions(self) -> None:
        _world()
        _run("--apply")

        configuration = M2VariantConfiguration.objects.get(
            variant__service__slug="lan-cable-wiring", status=M2VariantConfiguration.Status.ACTIVE
        )
        assert configuration.pricing_skill_code == "internet-technician"
        assert configuration.question_schema == {"questions": []}
        # Copied from full-home-rewiring.
        assert configuration.commission_basis_points == 1_500
        assert configuration.first_quote_sla_hours == 24
        assert configuration.max_quotes == 3

    def test_the_card_and_the_price_book_follow_the_sheet(self) -> None:
        area = _world()
        _run("--apply")

        service = Service.objects.get(slug="new-house-wiring")
        assert "₹40–80 per sq ft" in service.short_description  # noqa: RUF001
        item = WorkItem.objects.get(skill__code="electrician", name="New House Wiring")
        assert item.unit == "sq_ft"
        assert item.group == "Wiring"
        assert (item.band_below_bps, item.band_above_bps) == (3_333, 3_333)
        rate = WorkItemRate.objects.get(
            work_item=item, service_area=area, status=WorkItemRate.Status.PUBLISHED
        )
        assert rate.reference_rate_paise == 6_000
        assert rate.published_by is not None
        assert rate.published_by.is_staff

    def test_cupboard_hinge_repair_gets_its_photo_and_nothing_else(self) -> None:
        _world()
        _run("--apply")

        cover = ServiceMedia.objects.get(
            service__slug="cupboard-hinge-repair", kind=ServiceMedia.Kind.COVER
        )
        assert cover.url.endswith(
            "/Images/catalog-v2/technician/carpenter/cupboard-hinge-repair.jpeg"
        )
        assert not ServiceVariant.objects.filter(service__slug="cupboard-hinge-repair").exists()

    def test_without_the_flag_no_partner_is_approved(self) -> None:
        area = _world()
        _approved_rewiring_partner(area)
        output = _run("--apply")

        assert not PartnerCapability.objects.filter(variant__service__slug__in=V1_SLUGS).exists()
        assert "no approved partner yet" in output


class TestGrantFromSibling:
    def test_same_trade_partners_are_approved_through_the_audited_lifecycle(self) -> None:
        area = _world()
        partner = _approved_rewiring_partner(area)
        _run("--apply", "--grant-from-sibling")

        approved = PartnerCapability.objects.filter(
            partner=partner, status=PartnerCapability.Status.APPROVED
        ).exclude(variant__service__slug="full-home-rewiring")
        assert set(approved.values_list("variant__service__slug", flat=True)) == ELECTRICIAN_SLUGS
        capability = approved.get(variant__service__slug="new-house-wiring")
        assert list(capability.service_areas.all()) == [area]
        assert (
            PartnerCapabilityTransition.objects.filter(
                capability=capability, reason_code=GRANT_REASON_CODE
            ).count()
            == 2
        )

    def test_trades_without_a_sibling_of_their_own_borrow_no_partners(self) -> None:
        area = _world()
        _approved_rewiring_partner(area)
        _run("--apply", "--grant-from-sibling")

        assert not PartnerCapability.objects.filter(
            variant__service__slug__in=NO_SIBLING_TRADE_SLUGS
        ).exists()

    def test_a_partner_who_dropped_the_area_is_reported_not_fatal(self) -> None:
        area = _world()
        partner = _approved_rewiring_partner(area)
        PartnerServiceArea.objects.filter(partner=partner).update(is_active=False)
        output = _run("--apply", "--grant-from-sibling")

        assert "not granted: Ravi K" in output
        assert Service.objects.filter(slug__in=V1_SLUGS).count() == 21


class TestRerun:
    def test_a_rerun_changes_nothing(self) -> None:
        area = _world()
        _approved_rewiring_partner(area)
        _run("--apply", "--grant-from-sibling")
        rates = WorkItemRate.objects.count()
        capabilities = PartnerCapability.objects.count()
        covers = ServiceMedia.objects.count()

        output = _run("--apply", "--grant-from-sibling")

        assert "0 new, 21 updated" in output
        assert "0 rates published, 15 unchanged" in output
        assert WorkItemRate.objects.count() == rates
        assert PartnerCapability.objects.count() == capabilities
        assert ServiceMedia.objects.count() == covers

    def test_a_rerun_keeps_a_service_operations_paused(self) -> None:
        _world()
        _run("--apply")
        Service.objects.filter(slug="sewer-line-work").update(status=Service.Status.PAUSED)

        _run("--apply")

        assert Service.objects.get(slug="sewer-line-work").status == Service.Status.PAUSED

    def test_a_changed_rate_publishes_a_new_version(self) -> None:
        area = _world()
        _run("--apply")
        item = WorkItem.objects.get(name="Cable Pulling")
        WorkItemRate.objects.filter(work_item=item).update(reference_rate_paise=1)

        output = _run("--apply")

        assert "1 rates published" in output
        current = WorkItemRate.objects.get(
            work_item=item, service_area=area, status=WorkItemRate.Status.PUBLISHED
        )
        assert (current.version, current.reference_rate_paise) == (2, 2_500)


class TestRefusals:
    def test_a_missing_sibling_refuses_and_writes_nothing(self) -> None:
        _world()
        Service.objects.filter(slug="bridal-event-makeup").update(slug="bridal-makeup-renamed")

        with pytest.raises(CommandError, match="bridal-event-makeup"):
            _run("--apply")
        assert not Service.objects.filter(slug__in=V1_SLUGS).exists()

    def test_a_missing_tile_refuses(self) -> None:
        _world()
        Subcategory.objects.filter(slug="cctv-technician").update(slug="cctv-renamed")

        with pytest.raises(CommandError, match="technician/cctv-technician"):
            _run("--apply")

    def test_a_hidden_tile_is_imported_and_named(self) -> None:
        _world()
        Subcategory.objects.filter(slug="bridal-events").update(is_active=False)

        output = _run("--apply")

        assert "beautician/bridal-events" in output
        assert Service.objects.filter(slug="bridesmaid-makeup").exists()

    def test_no_staff_user_refuses(self) -> None:
        _world()
        User.objects.filter(is_staff=True).update(is_staff=False)

        with pytest.raises(CommandError, match="staff user"):
            _run("--apply")
