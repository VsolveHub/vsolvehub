"""The deploy step publishes the Partner agreements, not only the schema.

A database that was only migrated had no published agreements, so `_required_consents_exist`
was False for everyone and no Partner application could ever be submitted.
"""

from collections.abc import Callable
from types import ModuleType
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command

from apps.partners.models import PartnerConsentDocument
from tests.test_server_clock_calibration import production_settings  # noqa: F401


def test_release_migrates_then_publishes_reference_data(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        "apps.foundation.management.commands.release.call_command",
        lambda name, **_kwargs: calls.append(name),
    )

    call_command("release")

    assert calls == ["migrate", "seed_partner_reference_data"]


@pytest.mark.django_db
def test_agreements_point_at_the_partner_sites_real_pages(settings: Any) -> None:
    settings.PARTNER_LEGAL_BASE_URL = "https://partner.example.test/"
    PartnerConsentDocument.objects.all().delete()

    call_command("seed_partner_reference_data")

    urls = set(
        PartnerConsentDocument.objects.filter(is_current=True).values_list(
            "document_url", flat=True
        )
    )
    assert urls == {
        "https://partner.example.test/terms",
        "https://partner.example.test/privacy",
    }


@pytest.mark.django_db
def test_a_published_agreement_is_never_replaced(settings: Any) -> None:
    # Receipts point at the live version; a deploy must not swap it underneath them.
    settings.PARTNER_LEGAL_BASE_URL = ""
    PartnerConsentDocument.objects.all().delete()
    call_command("seed_partner_reference_data")
    before = dict(
        PartnerConsentDocument.objects.filter(is_current=True).values_list("purpose", "id")
    )

    settings.PARTNER_LEGAL_BASE_URL = "https://partner.example.test"
    call_command("seed_partner_reference_data")

    after = dict(
        PartnerConsentDocument.objects.filter(is_current=True).values_list("purpose", "id")
    )
    assert after == before


@pytest.mark.parametrize("value", ["", "http://partner.example.test"])
def test_production_requires_an_https_partner_site(
    production_settings: Callable[..., ModuleType],  # noqa: F811
    value: str,
) -> None:
    with pytest.raises(ImproperlyConfigured, match="PARTNER_LEGAL_BASE_URL"):
        production_settings(PARTNER_LEGAL_BASE_URL=value)
