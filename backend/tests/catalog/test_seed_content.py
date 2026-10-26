"""Which "how this visit works" template a service is given.

The template is customer-facing promise text, so the failure mode is quiet: a wrong template
seeds fine and then tells a demolition crew's customer about "treatment on skin with an open
wound". These tests pin the routing rather than the wording.
"""

import pytest
from django.core.management import call_command

from apps.catalog.management.commands.load_catalog_dump import Command as LoadCatalogDump
from apps.catalog.management.commands.seed_task_catalog import CATALOG
from apps.catalog.models import Service, ServicePolicy
from apps.catalog.seed_content import (
    CLEANING,
    PERSONAL_CARE,
    REPAIR,
    SERVICE_CONTENT_OVERRIDES,
    content_for_service,
    content_for_trade,
)

CLEANING_JOBS_IN_REPAIR_TRADES = (
    "ac-deep-cleaning",
    "ac-jet-wash",
    "plumber-chamber-cleaning",
    "gas-burner-cleaning",
)


def _task_slugs() -> set[str]:
    return {task.slug for entry in CATALOG for trade in entry[5] for task in trade.tasks}


@pytest.mark.parametrize(
    "skill",
    ["construction-helpers", "home-demolition", "event-catering", "central-ac-ducting", ""],
)
def test_a_trade_without_a_template_gets_none_not_personal_care(skill: str) -> None:
    assert content_for_trade(skill) is None


def test_personal_care_is_only_for_beauty_trades() -> None:
    assert content_for_trade("waxing") is PERSONAL_CARE
    assert content_for_trade("bridal-event-makeup") is PERSONAL_CARE
    assert content_for_trade("electrician") is REPAIR


@pytest.mark.parametrize("slug", CLEANING_JOBS_IN_REPAIR_TRADES)
def test_cleaning_jobs_sold_by_repair_trades_get_the_cleaning_template(slug: str) -> None:
    assert SERVICE_CONTENT_OVERRIDES[slug] is CLEANING
    assert content_for_service(slug, "ac-technician") is CLEANING


def test_every_task_catalog_trade_still_has_a_template() -> None:
    """Removing the fallback must not strip lines from any A1 task service."""

    trades = {trade.dispatch_skill for entry in CATALOG for trade in entry[5]}
    assert [skill for skill in sorted(trades) if content_for_trade(skill) is None] == []


@pytest.mark.django_db
def test_seeded_ac_deep_cleaning_publishes_cleaning_lines_not_repair_ones() -> None:
    call_command("seed_task_catalog")

    texts = set(
        ServicePolicy.objects.filter(service__slug="ac-deep-cleaning", is_active=True).values_list(
            "text", flat=True
        )
    )
    assert set(CLEANING.included) <= texts
    assert not texts & set(REPAIR.included)


@pytest.mark.django_db
def test_loading_the_dump_keeps_authored_lines_on_a_service_with_no_template() -> None:
    """The M2 day-hire lines from `seed_m2_demo` survive a later catalogue load."""

    call_command("seed_task_catalog")
    # Any seeded service without an override; the skill passed below is what has no template.
    service = (
        Service.objects.exclude(slug__in=SERVICE_CONTENT_OVERRIDES)
        .filter(slug__in=_task_slugs())
        .first()
    )
    assert service is not None
    ServicePolicy.objects.filter(service=service).update(is_active=False)
    authored = ServicePolicy.objects.create(
        service=service,
        kind=ServicePolicy.Kind.INCLUDED,
        title="",
        text="One 8-hour shift per worker, including a 30-minute break.",
        display_order=99,
        is_active=True,
    )

    LoadCatalogDump()._seed_policies(
        service, {"variants": [{"skill_code": "construction-helpers"}]}
    )

    authored.refresh_from_db()
    assert authored.is_active
    assert not ServicePolicy.objects.filter(
        service=service, is_active=True, text__icontains="open wound"
    ).exists()
