"""The public promo-banner read: which banners are live, and for which category."""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.management import CommandError, call_command
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Category, PromoBanner

pytestmark = pytest.mark.django_db

URL = "/api/v1/promo-banners/"


def _category(slug: str, *, is_active: bool = True) -> Category:
    return Category.objects.create(slug=slug, name=slug.title(), is_active=is_active)


def _titles(response: object) -> list[str]:
    return [row["title"] for row in response.json()]  # type: ignore[attr-defined]


def test_returns_site_wide_and_own_category_banners_only() -> None:
    electrician = _category("electrician")
    plumber = _category("plumber")
    PromoBanner.objects.create(title="Everywhere", display_order=0)
    PromoBanner.objects.create(title="Sparks", category=electrician, display_order=1)
    PromoBanner.objects.create(title="Pipes", category=plumber, display_order=2)

    response = APIClient().get(URL, {"category": "electrician"})

    assert response.status_code == HTTPStatus.OK
    assert _titles(response) == ["Everywhere", "Sparks"]
    assert response.json()[1]["category_slug"] == "electrician"


def test_without_a_category_only_site_wide_banners_show() -> None:
    PromoBanner.objects.create(title="Everywhere")
    PromoBanner.objects.create(title="Sparks", category=_category("electrician"))

    assert _titles(APIClient().get(URL)) == ["Everywhere"]


def test_switched_off_and_out_of_window_banners_are_hidden() -> None:
    now = timezone.now()
    PromoBanner.objects.create(title="Off", is_active=False)
    PromoBanner.objects.create(title="Not yet", starts_at=now + timedelta(days=1))
    PromoBanner.objects.create(title="Over", ends_at=now - timedelta(minutes=1))
    PromoBanner.objects.create(
        title="Live", starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=1)
    )

    assert _titles(APIClient().get(URL)) == ["Live"]


def test_an_inactive_category_hides_its_banners() -> None:
    PromoBanner.objects.create(title="Hidden", category=_category("events", is_active=False))

    assert _titles(APIClient().get(URL, {"category": "events"})) == []


def test_a_window_that_ends_before_it_starts_is_rejected() -> None:
    now = timezone.now()
    with transaction.atomic(), pytest.raises(IntegrityError):
        PromoBanner.objects.create(
            title="Backwards", starts_at=now, ends_at=now - timedelta(hours=1)
        )


@override_settings(DEBUG=True)
def test_demo_seed_is_idempotent() -> None:
    _category("electrician")

    call_command("seed_promo_banners", dev_only=True)
    call_command("seed_promo_banners", dev_only=True)

    assert PromoBanner.objects.filter(category__slug="electrician").count() == 1


@override_settings(DEBUG=True)
def test_demo_seed_needs_the_dev_only_flag() -> None:
    _category("electrician")

    with pytest.raises(CommandError):
        call_command("seed_promo_banners")
