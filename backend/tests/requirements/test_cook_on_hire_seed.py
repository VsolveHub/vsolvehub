"""Cook-on-hire's two products stay joined at one boundary and one labour-only trade."""

from datetime import date

import pytest

from apps.catalog.models import M2VariantConfiguration
from apps.requirements import financials
from apps.requirements.management.commands.seed_m2_demo import (
    A3_DAY_SEEDS,
    A5_PROJECT_SEEDS,
    HOUSE_FUNCTION_COOK_TEAM_DAY_PAISE,
    HOUSE_FUNCTION_GUEST_LIMIT,
    RATE_CARD_BOOKING_FEE_PAISE,
)
from apps.requirements.management.commands.seed_price_book_demo import (
    CATALOG,
    EVENT_COOK_ITEMS,
)
from apps.requirements.models import RateCard

from .conftest import M2World


def test_house_function_cook_is_one_hidden_team_at_the_published_boundary() -> None:
    seed = next(day for day in A3_DAY_SEEDS if day.slug == "house-function-cook")
    questions = {question[0]: question for question in seed.questions}

    assert questions["worker_count"][4] == 1
    assert questions["guest_band"][5][-1][0] == f"50-{HOUSE_FUNCTION_GUEST_LIMIT}"
    assert "cook_count" not in questions
    assert seed.worker_day_wage_paise == HOUSE_FUNCTION_COOK_TEAM_DAY_PAISE
    assert seed.supervision_margin_paise == 0


def test_event_cook_starts_at_the_same_boundary_and_customer_procures_materials() -> None:
    seed = next(project for project in A5_PROJECT_SEEDS if project.slug == "event-cook")
    questions = {question[0]: question for question in seed.questions}

    assert questions["guest_band"][5][0][0] == f"{HOUSE_FUNCTION_GUEST_LIMIT}-150"
    assert seed.pricing_skill == "event-cook"
    assert (
        seed.material_fulfilment_mode
        == M2VariantConfiguration.MaterialFulfilmentMode.CUSTOMER_PROCURES
    )


def test_event_cook_price_book_is_labour_only_with_real_recipes() -> None:
    catalog = dict(CATALOG)

    assert catalog["event-cook"] is EVENT_COOK_ITEMS
    assert {item.unit for item in EVENT_COOK_ITEMS} <= financials.ALLOWED_UNITS
    assert [item.reference_rate_paise for item in EVENT_COOK_ITEMS] == [
        45_00,
        65_00,
        25_00,
        1_200_00,
        2_500_00,
        700_00,
    ]
    assert all(item.recipe for item in EVENT_COOK_ITEMS[:5])
    assert EVENT_COOK_ITEMS[-1].recipe == ()
    assert EVENT_COOK_ITEMS[0].bundles == {"small": 75, "medium": 150, "large": 300}


@pytest.mark.django_db
def test_rate_card_allows_the_master_cook_to_be_the_zero_margin_supervisor(world: M2World) -> None:
    card = RateCard.objects.create(
        service_area=world.area,
        skill=world.skill,
        worker_day_wage_paise=500_000,
        supervision_margin_paise=0,
        booking_fee_paise=5_000,
        customer_day_rate_paise=505_000,
        standard_day_hours=8,
        overtime_hourly_paise=50_000,
        effective_from=date(2026, 9, 10),
    )

    assert card.supervision_margin_paise == 0
    assert card.customer_day_rate_paise == (
        HOUSE_FUNCTION_COOK_TEAM_DAY_PAISE + RATE_CARD_BOOKING_FEE_PAISE
    )
