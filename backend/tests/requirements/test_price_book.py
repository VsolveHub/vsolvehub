"""The vendor price book, wired (2026-08-29): bands at submission, custom lines inline, and
the shopping list an estimate hands the Customer.

Owner decisions under test: a Partner's unsaved rate defaults to the city reference; a
custom item goes out with the estimate (no review queue, no share cap); materials are the
Customer's to buy, so the list carries quantities and never money.
"""

from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners import permissions
from apps.partners.models import PartnerProfile, PartnerServiceArea, PartnerSkill, Skill
from apps.requirements import price_book
from apps.requirements.exceptions import CustomTitleScreenedError, RateOutsideBandError
from apps.requirements.management.commands.seed_m2_demo import _question_schema
from apps.requirements.models import PartnerRateItem, WorkItem
from apps.requirements.views.price_book import PartnerPriceBookView

pytestmark = pytest.mark.django_db

REFERENCE_RATE = 150_00
FLOOR = 120_00
CEILING = 195_00
SAVED_RATE = 180_00


def _actor() -> User:
    return User.objects.create_user(phone_number="+919812345680", full_name="Ops")


def _area() -> ServiceArea:
    return ServiceArea.objects.create(slug="hyderabad-500032", name="Hyderabad")


def _skill() -> Skill:
    return Skill.objects.create(code="electrician", name="Electrician")


def _partner(skill: Skill) -> PartnerProfile:
    user = User.objects.create_user(phone_number="+919812345681", full_name="Ravi K")
    partner = PartnerProfile.objects.create(user=user, display_name="Ravi K")
    PartnerSkill.objects.create(partner=partner, skill=skill, is_active=True)
    return partner


def _policy(actor: User) -> None:
    price_book.activate_guardrail_policy(
        actor=actor,
        version=1,
        approval_reference="test",
        effective_from=timezone.now() - timezone.timedelta(days=1),
        default_band_below_bps=2_000,
        default_band_above_bps=3_000,
        misc_cap_bps=1_000,
        margin_cap_bps=2_500,
        custom_share_cap_bps=2_000,
    )


def _light_point(skill: Skill, area: ServiceArea, actor: User) -> WorkItem:
    item = WorkItem.objects.create(
        skill=skill,
        name="Light point",
        unit="each",
        group="Points",
        material_recipe=[
            {
                "title": "1.5 sq mm FR copper wire",
                "spec": "ISI",
                "unit": "m",
                "per_unit": "24",
                "pack_size": "90",
                "pack_unit": "coil (90 m)",
            },
            {"title": "6A modular switch", "spec": "", "unit": "no", "per_unit": "1"},
        ],
        bundle_quantities={"1bhk": 6},
    )
    price_book.publish_reference_rate(
        actor=actor,
        work_item_id=item.id,
        service_area_id=area.id,
        reference_rate_paise=REFERENCE_RATE,
    )
    return item


class TestPriceBookRead:
    def test_an_unsaved_rate_defaults_to_the_city_reference(self) -> None:
        actor, area, skill = _actor(), _area(), _skill()
        _policy(actor)
        item = _light_point(skill, area, actor)
        partner = _partner(skill)

        [entry] = price_book.price_book_for_partner(partner=partner, service_area=area)

        assert entry.work_item == item
        assert entry.partner_rate_paise == REFERENCE_RATE
        assert entry.partner_is_active is True
        assert entry.is_default_rate is True
        assert (entry.floor_paise, entry.ceiling_paise) == (FLOOR, CEILING)

    def test_a_saved_rate_replaces_the_default(self) -> None:
        actor, area, skill = _actor(), _area(), _skill()
        _policy(actor)
        item = _light_point(skill, area, actor)
        partner = _partner(skill)
        PartnerRateItem.objects.create(partner=partner, work_item=item, rate_paise=SAVED_RATE)

        [entry] = price_book.price_book_for_partner(partner=partner, service_area=area)

        assert entry.partner_rate_paise == SAVED_RATE
        assert entry.is_default_rate is False


class TestGuardrailsAtSubmission:
    def test_a_catalog_line_inside_the_band_is_annotated(self) -> None:
        actor, area, skill = _actor(), _area(), _skill()
        _policy(actor)
        item = _light_point(skill, area, actor)

        result = price_book.validate_quote_guardrails(
            service_area=area,
            item_lines=[
                {
                    "work_item_id": str(item.id),
                    "title": "whatever the client sent",
                    "unit": "each",
                    "quantity": "4",
                    "rate_paise": 160_00,
                    "amount_paise": 640_00,
                }
            ],
        )

        [line] = result.item_lines
        assert result.policy_version == 1
        assert line["title"] == "Light point"
        assert line["category"] == "Points"
        assert line["is_custom"] is False
        assert (line["band_floor_paise"], line["band_ceiling_paise"]) == (FLOOR, CEILING)

    def test_a_catalog_line_outside_the_band_is_refused(self) -> None:
        actor, area, skill = _actor(), _area(), _skill()
        _policy(actor)
        item = _light_point(skill, area, actor)

        with pytest.raises(RateOutsideBandError):
            price_book.validate_quote_guardrails(
                service_area=area,
                item_lines=[
                    {
                        "work_item_id": str(item.id),
                        "title": "Light point",
                        "unit": "each",
                        "quantity": "1",
                        "rate_paise": CEILING + 1,
                        "amount_paise": CEILING + 1,
                    }
                ],
            )

    def test_a_custom_line_goes_through_without_review_or_cap(self) -> None:
        # No policy is even needed for an all-custom estimate.
        area = _area()

        result = price_book.validate_quote_guardrails(
            service_area=area,
            item_lines=[
                {
                    "title": "Extra chasing behind the kitchen slab",
                    "unit": "job",
                    "quantity": "1",
                    "rate_paise": 2_500_00,
                    "amount_paise": 2_500_00,
                }
            ],
        )

        assert result.policy_version is None
        assert result.item_lines[0]["is_custom"] is True

    def test_a_custom_title_carrying_a_phone_number_is_screened(self) -> None:
        with pytest.raises(CustomTitleScreenedError):
            price_book.validate_quote_guardrails(
                service_area=_area(),
                item_lines=[
                    {
                        "title": "Call 9876543210 for the rest",
                        "unit": "job",
                        "quantity": "1",
                        "rate_paise": 100_00,
                        "amount_paise": 100_00,
                    }
                ],
            )


class TestShoppingList:
    def test_recipes_aggregate_and_round_up_to_packs(self) -> None:
        actor, area, skill = _actor(), _area(), _skill()
        item = _light_point(skill, area, actor)

        rows = price_book.shopping_list_for_lines(
            [{"work_item_id": str(item.id), "quantity": Decimal("4")}]
        )

        wire, switches = rows
        # 4 points x 24 m = 96 m → two 90 m coils, never 1.07 of a coil.
        assert wire["title"] == "1.5 sq mm FR copper wire"
        assert (wire["quantity"], wire["unit"]) == ("2", "coil (90 m)")
        assert wire["note"] == "about 96 m"
        assert (switches["title"], switches["quantity"], switches["unit"]) == (
            "6A modular switch",
            "4",
            "no",
        )
        assert all("paise" not in key for row in rows for key in row)

    def test_custom_lines_contribute_nothing(self) -> None:
        assert price_book.shopping_list_for_lines([{"title": "Custom", "quantity": "3"}]) == []


class TestCatalogueSurfacesOnTheVariant:
    """The A5 electrician services no longer ask what the visit answers."""

    def test_a_variant_with_no_questions_still_publishes_a_schema(self) -> None:
        assert _question_schema(()) == {"questions": []}

    def test_service_fixture_shape(self) -> None:
        # Guards the test module's own helpers against a catalogue refactor.
        category = Category.objects.create(slug="electrician", name="Electrician")
        subcategory = Subcategory.objects.create(category=category, slug="x", name="X")
        service = Service.objects.create(
            subcategory=subcategory,
            slug="full-home-rewiring",
            name="Full home rewiring",
            short_description="Test.",
            status=Service.Status.ACTIVE,
        )
        variant = ServiceVariant.objects.create(
            service=service,
            code="standard",
            name="Rewiring, priced on site",
            pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
            booking_archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
            required_skill_code="electrician",
            tax_category_code="services-standard",
        )
        assert variant.booking_archetype == "A5_CUSTOM_PROJECT"


class TestPriceBookEndpoint:
    def test_the_view_publishes_every_entry_field(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # The view builds its payload dict by hand; a field added to the serializer and not to
        # that dict answered `500` on the rate-card screen (2026-08-29). Drive the view itself.
        monkeypatch.setattr(permissions, "has_active_session_role", lambda **_kw: True)
        actor, area, skill = _actor(), _area(), _skill()
        _policy(actor)
        _light_point(skill, area, actor)
        partner = _partner(skill)
        PartnerServiceArea.objects.create(partner=partner, service_area=area, is_active=True)

        raw = APIRequestFactory().get("/api/v1/partner/price-book/")
        force_authenticate(raw, user=partner.user)
        request = Request(raw)
        request.user = partner.user

        response = PartnerPriceBookView().get(request)

        assert response.status_code == status.HTTP_200_OK
        [entry] = response.data["items"]
        assert entry["is_default_rate"] is True
        assert entry["partner_rate_paise"] == REFERENCE_RATE
        assert entry["work_item"]["group"] == "Points"
