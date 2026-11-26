"""`import_catalog_v2`: eight construction trades by the day and the Event & Media services.

Builds the smallest world the command needs (the two live sibling services it copies settings
from, the helpers' wage floor and day rate, one area and one staff user) and checks what the
command writes, that a preview writes nothing and that a rerun changes nothing. The media domain
is never called: every test decides which photos "are uploaded".
"""

import re
from collections.abc import Callable
from datetime import date
from email.message import Message
from io import StringIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import User
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.models import MinimumWageFloor, Skill
from apps.requirements.management.commands import import_catalog_v2
from apps.requirements.management.commands.import_catalog_v2 import (
    EVENT_SERVICES,
    EVENT_TILES,
    TRADES,
    scaled_overtime_paise,
)
from apps.requirements.models import RateCard
from apps.requirements.rate_cards import publish_rate_card

pytestmark = pytest.mark.django_db

A3 = ServiceVariant.BookingArchetype.A3_TIME_BLOCK
A5 = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
TRADE_SLUGS = [trade.slug for trade in TRADES]
EVENT_SLUGS = [row.slug for row in EVENT_SERVICES]
PICTURE_LIST = (
    Path(__file__).resolve().parents[3] / "exports/2026-11-15-catalog-pictures/V2-pictures.md"
)
HELPER_FLOOR_PAISE = 60_000
GOOD_TO_KNOW = "You pay the crew directly after each day."
#: Kept before the autouse fixture below replaces it, so `TestPhotoCheck` can test the real one.
ORIGINAL_PHOTO_IS_LIVE = import_catalog_v2.photo_is_live


@pytest.fixture(autouse=True)
def every_photo_uploaded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(import_catalog_v2, "photo_is_live", lambda _url: True)


def _uploaded_only(monkeypatch: pytest.MonkeyPatch, rule: Callable[[str], bool]) -> None:
    monkeypatch.setattr(import_catalog_v2, "photo_is_live", rule)


def _world() -> ServiceArea:
    staff = User.objects.create_user(phone_number="+919812300101", full_name="Ops")
    staff.is_staff = True
    staff.save(update_fields=["is_staff"])
    area = ServiceArea.objects.create(slug="hyderabad-500032", name="Hyderabad", state_code="TS")

    construction = Category.objects.create(slug="construction", name="Construction")
    labour = Subcategory.objects.create(
        category=construction, slug="construction-labour", name="Construction labour"
    )
    helper_skill = Skill.objects.create(code="construction-helper", name="Construction helper")
    helpers = Service.objects.create(
        subcategory=labour,
        slug="construction-helpers",
        name="Construction helpers",
        short_description="Helpers.",
        icon_key="workforce",
        status=Service.Status.ACTIVE,
    )
    ServicePolicy.objects.create(
        service=helpers, kind=ServicePolicy.Kind.GOOD_TO_KNOW, text=GOOD_TO_KNOW, display_order=1
    )
    helpers_variant = ServiceVariant.objects.create(
        service=helpers,
        code="standard",
        name="Helpers by the day",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=A3,
        required_skill_code="construction-helpers",
        tax_category_code="services-standard",
    )
    M2VariantConfiguration.objects.create(
        variant=helpers_variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema={"questions": [{"code": "work_type", "kind": "SELECT"}]},
        registration_question_schema={"questions": [{"code": "crew_capacity"}]},
        a3_preset_question_schema={"questions": [{"code": "floor_number"}]},
        wage_floor_skill=helper_skill,
        material_fulfilment_mode=M2VariantConfiguration.MaterialFulfilmentMode.NOT_APPLICABLE,
        crew_wave_size=3,
        booking_fee_free_cancel_hours=12,
    )
    ServiceAreaService.objects.create(service_area=area, variant=helpers_variant, is_active=True)
    MinimumWageFloor.objects.create(
        state_code="TS",
        skill=helper_skill,
        floor_paise_per_day=HELPER_FLOOR_PAISE,
        effective_from=date(2026, 1, 1),
        source_reference="Test floor.",
    )
    publish_rate_card(
        service_area_id=area.id,
        skill_id=helper_skill.id,
        worker_day_wage_paise=70_000,
        supervision_margin_paise=15_000,
        booking_fee_paise=5_000,
        standard_day_hours=8,
        overtime_hourly_paise=12_000,
        inclusions=["Helpers card."],
        add_on_rates={"no_lift_per_worker_day": 7_500},
        effective_from=date(2026, 1, 1),
        actor=None,
    )

    events = Category.objects.create(slug="events", name="Events")
    decor = Subcategory.objects.create(
        category=events, slug="lighting-decor", name="Lighting & decor", display_order=20
    )
    decor_service = Service.objects.create(
        subcategory=decor,
        slug="event-lighting-decor",
        name="Event lighting & decor",
        short_description="Decor.",
        icon_key="service",
        status=Service.Status.ACTIVE,
    )
    decor_variant = ServiceVariant.objects.create(
        service=decor_service,
        code="standard",
        name="Decor, priced per event",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=A5,
        required_skill_code="event-lighting-decor",
        tax_category_code="services-standard",
    )
    M2VariantConfiguration.objects.create(
        variant=decor_variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema={"questions": [{"code": "occasion", "kind": "SELECT"}]},
        pricing_skill_code="event-decorator",
        material_fulfilment_mode=M2VariantConfiguration.MaterialFulfilmentMode.CUSTOMER_PROCURES,
        first_quote_sla_hours=24,
        max_quotes=3,
        commission_basis_points=1_500,
    )
    ServiceAreaService.objects.create(service_area=area, variant=decor_variant, is_active=True)
    return area


def _run(*flags: str) -> str:
    out = StringIO()
    call_command("import_catalog_v2", *flags, stdout=out)
    return out.getvalue()


def _picture_list_paths() -> set[str]:
    return set(re.findall(r"`((?:catalog|tiles)-v2/[^`]+\.jpeg)`", PICTURE_LIST.read_text("utf-8")))


class TestTheSheet:
    def test_eight_trades_and_eighty_four_event_services_with_unique_slugs(self) -> None:
        assert len(TRADES) == 8
        assert len(EVENT_SERVICES) == 84
        assert len(EVENT_TILES) == 8
        slugs = TRADE_SLUGS + EVENT_SLUGS
        assert len(set(slugs)) == len(slugs)
        assert {"advanced-video-editing", "advanced-photo-editing"} <= set(EVENT_SLUGS)

    def test_every_file_name_is_the_one_the_picture_list_gives(self) -> None:
        listed = _picture_list_paths()
        ours = {
            *(f"catalog-v2/{trade.photo}" for trade in TRADES),
            *(f"catalog-v2/{row.photo}" for row in EVENT_SERVICES),
            *(f"tiles-v2/{tile.picture}" for tile in EVENT_TILES),
        }
        assert ours <= listed
        # What the list has and V2 does not import: the two tiles already live, and the two
        # consultation rows that are the visit every priced-on-site booking starts with.
        assert {
            path
            for path in listed - ours
            if "/decoration/" not in path and "/catering/" not in path
        } == {
            "catalog-v2/event-media/dj-sound/site-visit-consultation.jpeg",
            "catalog-v2/event-media/event-management/event-consultation.jpeg",
        }

    def test_every_card_states_its_range(self) -> None:
        for row in EVENT_SERVICES:
            assert "₹" in row.short_description, row.slug
            assert row.low < row.high, row.slug
        printing = next(row for row in EVENT_SERVICES if row.name == "Photo Printing")
        assert "₹10–50 per photo" in printing.short_description  # noqa: RUF001

    def test_overtime_scales_with_the_wage_to_the_nearest_ten_rupees(self) -> None:
        helpers = RateCard(overtime_hourly_paise=12_000, worker_day_wage_paise=70_000)
        assert scaled_overtime_paise(sibling=helpers, wage_paise=90_000) == 15_000
        assert scaled_overtime_paise(sibling=helpers, wage_paise=60_000) == 10_000
        assert scaled_overtime_paise(sibling=helpers, wage_paise=70_000) == 12_000


class TestPhotoCheck:
    """`photo_is_live` itself, with the network replaced by a recording stand-in."""

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[Request]:
        requests: list[Request] = []

        class _Response:
            status = 200

            def __enter__(self) -> "_Response":
                return self

            def __exit__(self, *_exc: object) -> None:
                return None

        def fake_urlopen(request: Request, timeout: int) -> _Response:
            assert timeout == import_catalog_v2.PHOTO_CHECK_TIMEOUT_SECONDS
            requests.append(request)
            return _Response()

        monkeypatch.setattr(import_catalog_v2, "urlopen", fake_urlopen)
        return requests

    def test_it_asks_with_its_own_name_because_cloudflare_refuses_python_urllib(
        self, sent: list[Request]
    ) -> None:
        url = "https://media.vsolvehub.com/Images/catalog-v2/construction-labour/mason.jpeg"
        assert ORIGINAL_PHOTO_IS_LIVE(url) is True

        (request,) = sent
        assert request.get_method() == "HEAD"
        assert request.get_header("User-agent") == import_catalog_v2.PHOTO_CHECK_USER_AGENT
        assert "python-urllib" not in request.get_header("User-agent", "").lower()

    def test_a_refused_or_unreachable_file_counts_as_not_uploaded(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def refuse(request: Request, **_kwargs: object) -> None:
            raise HTTPError(request.full_url, 403, "Forbidden", Message(), None)

        monkeypatch.setattr(import_catalog_v2, "urlopen", refuse)
        assert ORIGINAL_PHOTO_IS_LIVE("https://media.vsolvehub.com/x.jpeg") is False

    def test_only_https_is_ever_asked(self, sent: list[Request]) -> None:
        assert ORIGINAL_PHOTO_IS_LIVE("file:///etc/passwd") is False
        assert sent == []


class TestPreview:
    def test_a_preview_writes_nothing(self) -> None:
        _world()
        output = _run()

        assert "Preview only" in output
        assert not Service.objects.filter(slug__in=TRADE_SLUGS + EVENT_SLUGS).exists()
        assert not Subcategory.objects.filter(slug="photography").exists()
        assert RateCard.objects.count() == 1
        assert MinimumWageFloor.objects.count() == 1


class TestTrades:
    def test_every_trade_is_hired_by_the_day_with_its_photo_and_areas(self) -> None:
        area = _world()
        _run("--apply")

        for trade in TRADES:
            service = Service.objects.get(slug=trade.slug)
            assert service.subcategory.slug == "construction-labour"
            assert service.status == Service.Status.ACTIVE
            variant = ServiceVariant.objects.get(service=service, code="standard")
            assert variant.booking_archetype == A3
            assert variant.required_skill_code == trade.slug
            assert ServiceAreaService.objects.filter(
                variant=variant, service_area=area, is_active=True
            ).exists()
            cover = ServiceMedia.objects.get(service=service, kind=ServiceMedia.Kind.COVER)
            assert cover.url.endswith(f"/Images/catalog-v2/{trade.photo}")
            assert variant.image_url == cover.url

    def test_the_booking_screen_gets_the_work_people_and_days(self) -> None:
        _world()
        _run("--apply")

        questions = ServiceQuestion.objects.filter(
            variant__service__slug="mason", is_active=True
        ).order_by("display_order")
        assert [question.code for question in questions] == [
            "work_type",
            "worker_count",
            "duration_days",
        ]
        assert questions[1].prompt == "Masons"
        options = ServiceQuestionOption.objects.filter(
            question=questions[0], is_active=True
        ).order_by("display_order")
        assert [option.label for option in options][:3] == [
            "Brick Work",
            "Block Work",
            "Plastering Work",
        ]
        assert options.count() == 10

    def test_the_configuration_is_the_helpers_with_the_trades_own_rules(self) -> None:
        _world()
        _run("--apply")

        configuration = M2VariantConfiguration.objects.get(
            variant__service__slug="welding-worker", status=M2VariantConfiguration.Status.ACTIVE
        )
        assert configuration.wage_floor_skill is not None
        assert configuration.wage_floor_skill.code == "welding-worker"
        assert configuration.a3_preset_question_schema == {"questions": []}
        schema_codes = [q["code"] for q in configuration.question_schema["questions"]]
        assert schema_codes == ["work_type", "worker_count", "duration_days"]
        work = configuration.question_schema["questions"][0]
        assert work["options"][0]["label"] == "Gate Welding"
        # Copied from construction-helpers.
        assert configuration.crew_wave_size == 3
        assert configuration.booking_fee_free_cancel_hours == 12
        assert configuration.registration_question_schema == {
            "questions": [{"code": "crew_capacity"}]
        }

    def test_the_day_rate_is_the_sheets_wage_with_the_helpers_margin_and_fee(self) -> None:
        area = _world()
        output = _run("--apply")

        card = RateCard.objects.get(service_area=area, skill__code="mason")
        assert card.worker_day_wage_paise == 90_000
        assert card.supervision_margin_paise == 15_000
        assert card.booking_fee_paise == 5_000
        assert card.customer_day_rate_paise == 110_000
        assert card.standard_day_hours == 8
        assert card.overtime_hourly_paise == 15_000
        assert card.add_on_rates == {}
        assert card.inclusions[0] == "One 8-hour working day per mason."
        assert card.published_by is not None
        assert "Mason | wage Rs 900 (sheet up to Rs 1800)" in output
        assert "Day rates: 8 published, 0 kept" in output

    def test_a_trade_without_a_floor_borrows_the_unskilled_one_marked_as_copied(self) -> None:
        _world()
        _run("--apply")

        floor = MinimumWageFloor.objects.get(state_code="TS", skill__code="concrete-labour")
        assert floor.floor_paise_per_day == HELPER_FLOOR_PAISE
        assert floor.effective_from == date(2026, 1, 1)
        assert "Copied from construction-helper" in floor.source_reference

    def test_a_trade_that_has_a_floor_keeps_it(self) -> None:
        _world()
        mason = Skill.objects.create(code="mason", name="Mason")
        MinimumWageFloor.objects.create(
            state_code="TS",
            skill=mason,
            floor_paise_per_day=80_000,
            effective_from=date(2026, 1, 1),
            source_reference="Gazette.",
        )
        output = _run("--apply")

        floors = MinimumWageFloor.objects.filter(skill=mason)
        assert [floor.source_reference for floor in floors] == ["Gazette."]
        assert "7 wage floors copied" in output

    def test_a_wage_below_the_trades_floor_publishes_no_rate_but_keeps_the_service(self) -> None:
        _world()
        concrete = Skill.objects.create(code="concrete-labour", name="Concrete Labour")
        MinimumWageFloor.objects.create(
            state_code="TS",
            skill=concrete,
            floor_paise_per_day=65_000,
            effective_from=date(2026, 1, 1),
        )
        output = _run("--apply")

        assert Service.objects.filter(slug="concrete-labour").exists()
        assert not RateCard.objects.filter(skill=concrete).exists()
        assert "no day rate: Concrete Labour in hyderabad-500032" in output

    def test_no_helpers_rate_in_an_area_blocks_that_areas_rates(self) -> None:
        _world()
        RateCard.objects.all().delete()
        output = _run("--apply")

        assert not RateCard.objects.exists()
        assert "has no day rate here to take the margin and fee from" in output
        assert Service.objects.filter(slug__in=TRADE_SLUGS).count() == 8

    def test_day_hire_settings_the_helpers_lack_are_named(self) -> None:
        _world()
        output = _run("--apply")

        # The world sets crew_wave_size and booking_fee_free_cancel_hours and nothing else.
        assert "day-hire settings empty" in output
        assert "crew_offer_timeout_seconds" in output
        assert "crew_wave_size," not in output

    def test_the_page_says_what_is_included_and_how_the_crew_is_paid(self) -> None:
        _world()
        _run("--apply")

        def lines(kind: str) -> list[str]:
            return list(
                ServicePolicy.objects.filter(
                    service__slug="scaffolding-worker", kind=kind, is_active=True
                )
                .order_by("display_order")
                .values_list("text", flat=True)
            )

        assert lines(ServicePolicy.Kind.INCLUDED) == [
            "One full working day per scaffolding worker.",
            "The work you pick when you book: Scaffolding Erection, Scaffolding Dismantling "
            "and Scaffolding Maintenance.",
        ]
        assert lines(ServicePolicy.Kind.EXCLUDED)[0].startswith("Materials and consumables.")
        assert lines(ServicePolicy.Kind.GOOD_TO_KNOW) == [GOOD_TO_KNOW]


class TestEventMedia:
    def test_eight_tiles_join_the_events_category_with_their_pictures(self) -> None:
        _world()
        _run("--apply")

        tiles = Subcategory.objects.filter(
            category__slug="events", slug__in=[tile.slug for tile in EVENT_TILES]
        ).order_by("display_order")
        assert [tile.name for tile in tiles] == [tile.name for tile in EVENT_TILES]
        assert all(tile.display_order > 20 for tile in tiles)
        photography = tiles.get(slug="photography")
        assert photography.image_url.endswith(
            "/Images/Service%20Cover/tiles-v2/event-media/photography.jpeg"
        )

    def test_every_service_is_priced_on_site_with_the_siblings_settings(self) -> None:
        area = _world()
        _run("--apply")

        assert Service.objects.filter(slug__in=EVENT_SLUGS).count() == 84
        variant = ServiceVariant.objects.get(service__slug="wedding-photography")
        assert variant.booking_archetype == A5
        assert variant.required_skill_code == "wedding-photography"
        assert Skill.objects.filter(code="wedding-photography", is_active=True).exists()
        assert ServiceAreaService.objects.filter(variant=variant, service_area=area).exists()
        configuration = M2VariantConfiguration.objects.get(
            variant=variant, status=M2VariantConfiguration.Status.ACTIVE
        )
        assert configuration.question_schema == {"questions": []}
        assert configuration.pricing_skill_code == ""
        assert configuration.commission_basis_points == 1_500
        assert configuration.first_quote_sla_hours == 24
        service = Service.objects.get(slug="wedding-photography")
        assert service.subcategory.slug == "photography"
        assert "₹20,000–80,000 per event" in service.short_description  # noqa: RUF001

    def test_a_photo_not_uploaded_yet_is_left_out_and_linked_on_a_rerun(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _world()
        _uploaded_only(monkeypatch, lambda url: "/catalog-v2/event-media/" not in url)
        output = _run("--apply")

        assert not ServiceMedia.objects.filter(service__slug__in=EVENT_SLUGS).exists()
        assert ServiceVariant.objects.get(service__slug="magician-show").image_url == ""
        assert "event-media/photography/ (17)" in output
        assert ServiceMedia.objects.filter(service__slug__in=TRADE_SLUGS).count() == 8

        _uploaded_only(monkeypatch, lambda _url: True)
        _run("--apply")

        cover = ServiceMedia.objects.get(service__slug="magician-show")
        assert cover.url.endswith(
            "/Images/catalog-v2/event-media/entertainment-services/magician-show.jpeg"
        )

    def test_a_photo_that_later_fails_to_open_is_not_unlinked(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _world()
        _run("--apply")
        _uploaded_only(monkeypatch, lambda _url: False)

        _run("--apply")

        assert ServiceMedia.objects.filter(service__slug="mason").exists()
        assert ServiceVariant.objects.get(service__slug="mason").image_url.endswith(
            "/construction-labour/mason.jpeg"
        )
        assert Subcategory.objects.get(slug="photography").image_url != ""


class TestRerun:
    def test_a_rerun_changes_nothing(self) -> None:
        _world()
        _run("--apply")
        counts = (
            RateCard.objects.count(),
            MinimumWageFloor.objects.count(),
            ServiceMedia.objects.count(),
            ServiceQuestion.objects.filter(is_active=True).count(),
            ServiceQuestionOption.objects.filter(is_active=True).count(),
            ServicePolicy.objects.filter(is_active=True).count(),
            Subcategory.objects.count(),
        )

        output = _run("--apply")

        assert "Construction trades: 0 new, 8 updated" in output
        assert "Day rates: 0 published, 8 kept" in output
        assert "Event & Media tiles: 0 new, 8 updated" in output
        assert "Event & Media services: 0 new, 84 updated" in output
        assert counts == (
            RateCard.objects.count(),
            MinimumWageFloor.objects.count(),
            ServiceMedia.objects.count(),
            ServiceQuestion.objects.filter(is_active=True).count(),
            ServiceQuestionOption.objects.filter(is_active=True).count(),
            ServicePolicy.objects.filter(is_active=True).count(),
            Subcategory.objects.count(),
        )

    def test_a_rerun_keeps_what_operations_paused_or_hid(self) -> None:
        _world()
        _run("--apply")
        Service.objects.filter(slug="mason").update(status=Service.Status.PAUSED)
        Subcategory.objects.filter(slug="dj-sound").update(is_active=False)

        output = _run("--apply")

        assert Service.objects.get(slug="mason").status == Service.Status.PAUSED
        assert not Subcategory.objects.get(slug="dj-sound").is_active
        assert "events/dj-sound" in output


class TestRefusals:
    def test_a_missing_sibling_refuses_and_writes_nothing(self) -> None:
        _world()
        Service.objects.filter(slug="construction-helpers").update(slug="helpers-renamed")

        with pytest.raises(CommandError, match="construction-helpers"):
            _run("--apply")
        assert not Service.objects.filter(slug__in=TRADE_SLUGS + EVENT_SLUGS).exists()

    def test_a_missing_events_category_refuses(self) -> None:
        _world()
        Category.objects.filter(slug="events").update(slug="events-renamed")

        with pytest.raises(CommandError, match="events"):
            _run("--apply")

    def test_no_staff_user_refuses(self) -> None:
        _world()
        User.objects.filter(is_staff=True).update(is_staff=False)

        with pytest.raises(CommandError, match="staff user"):
            _run("--apply")
