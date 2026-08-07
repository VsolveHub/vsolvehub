"""The priced Technician and Beautician task catalog.

A seed is data, so these tests check the properties that make the data *bookable* rather than
re-asserting every row. A price of zero, a missing skill code or a duplicated slug all fail
quietly at seed time and loudly at checkout.
"""

import pytest
from django.core.management import call_command
from django.db.models import Count

from apps.catalog.management.commands.seed_task_catalog import CATALOG
from apps.catalog.models import A1VariantConfiguration, Category, Service, ServiceVariant
from apps.partners.models import Skill
from apps.pricing.models import TaskRate

pytestmark = pytest.mark.django_db

EXPECTED_TRADES = 41


def _seeded_slugs() -> set[str]:
    return {task.slug for entry in CATALOG for trade in entry[5] for task in trade.tasks}


def test_every_seeded_task_is_priced_and_dispatchable() -> None:
    """Price, duration and skill code are what a task visit cannot be booked without."""

    call_command("seed_task_catalog")

    for variant in ServiceVariant.objects.filter(service__slug__in=_seeded_slugs()):
        rate = TaskRate.objects.get(variant=variant, is_active=True)
        assert rate.unit_price_paise > 0, variant.service.slug
        # A positive marginal duration is a database constraint, and a zero base would mean a
        # visit with no travel-in time at all.
        assert rate.marginal_duration_minutes > 0, variant.service.slug
        assert rate.base_duration_minutes > 0, variant.service.slug
        assert variant.required_skill_code, variant.service.slug
        assert variant.booking_archetype == ServiceVariant.BookingArchetype.A1_TASK_VISIT


def test_slugs_are_unique_across_trades() -> None:
    """ "Screen Replacement" and "Camera Repair" appear under two trades each in the source list.

    `Service.slug` is globally unique, so an unprefixed import would have silently collapsed one
    trade's task into another's.
    """

    call_command("seed_task_catalog")

    duplicates = Service.objects.values("slug").annotate(count=Count("id")).filter(count__gt=1)
    assert list(duplicates) == []
    assert Service.objects.filter(slug="mobile-screen-replacement").exists()
    assert Service.objects.filter(slug="computer-screen-replacement").exists()


def test_the_seed_leaves_the_m1_six_alone() -> None:
    """`seed_technician_catalog` is the fixture the rest of the suite is built on.

    Run in the documented order, the six M1 services must survive untouched — same slugs, same
    prices. A reused slug or a re-priced rate here would silently rewrite every other test's
    expectations.
    """

    call_command("seed_technician_catalog")
    before = dict(
        TaskRate.objects.filter(is_active=True).values_list("task_code", "unit_price_paise")
    )

    call_command("seed_task_catalog")

    after = dict(
        TaskRate.objects.filter(is_active=True).values_list("task_code", "unit_price_paise")
    )
    for task_code, price in before.items():
        assert after[task_code] == price, task_code
    assert Service.objects.filter(
        slug="switch-socket-repair", status=Service.Status.ACTIVE
    ).exists()


def test_every_trade_becomes_a_partner_skill() -> None:
    """Dispatch matches `required_skill_code` against `PartnerSkill`.

    A trade with no matching `Skill` row is a trade no Partner can ever be approved for, so every
    one of its services would be permanently unstaffable while looking perfectly bookable.
    """

    call_command("seed_task_catalog")
    call_command("seed_partner_reference_data")

    skill_codes = set(Skill.objects.filter(is_active=True).values_list("code", flat=True))
    trade_codes = {trade.slug for entry in CATALOG for trade in entry[5]}

    assert trade_codes <= skill_codes
    assert len(trade_codes) == EXPECTED_TRADES


def test_each_task_carries_an_active_scope_and_safety_configuration() -> None:
    """`current_item_inputs` refuses to quote without one, so a missing config is an unbookable
    service that still renders in the catalog."""

    call_command("seed_task_catalog")

    for variant in ServiceVariant.objects.filter(service__slug__in=_seeded_slugs()):
        configuration = A1VariantConfiguration.objects.get(
            variant=variant, status=A1VariantConfiguration.Status.ACTIVE
        )
        assert configuration.required_equipment, variant.service.slug
        assert configuration.out_of_scope_rules, variant.service.slug
        assert configuration.scope_schema["questions"], variant.service.slug


def test_all_four_categories_are_seeded_active() -> None:
    call_command("seed_task_catalog")

    for slug in ("technician", "beautician", "home-services", "pet-services"):
        assert Category.objects.filter(slug=slug, is_active=True).exists(), slug


def test_recurring_and_survey_priced_work_is_not_sold_as_a_task_visit() -> None:
    """The filter that matters most, because these fail *after* somebody has paid.

    A maid placement or a house move cannot be delivered by "one professional, one visit, this
    price" — dispatch would staff it, the customer would be charged, and nobody could honour it.
    They belong to other booking models, so they are absent rather than approximated.
    """

    call_command("seed_task_catalog")

    for excluded in (
        "full-time-maid",
        "part-time-maid",
        "live-in-maid",
        "elder-care-attendant",
        "nanny-service",
        "house-shifting",
        "office-shifting",
        "household-storage",
        "dog-boarding",
        "pet-pickup-drop",
        "annual-home-maintenance-contract",
    ):
        assert not Service.objects.filter(slug=excluded).exists(), excluded
