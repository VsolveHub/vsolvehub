"""`POST /api/v1/cart/suggestions/` — what one Partner could add to an existing visit.

The heading on this section promises "the same professional can do this in the
same visit". These tests exist to keep that promise true: only variants carrying
an active `SAME_PARTNER_SEQUENTIAL` rule may appear, and an empty answer stays
empty rather than being padded with popular services.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.carts.models import Cart, ServiceCompatibilityRule
from apps.carts.planning import cart_suggestion_service_ids
from apps.catalog.models import Service, ServiceVariant
from apps.identity.models import User

pytestmark = pytest.mark.django_db


def _client_with_cart(phone: str | None = None) -> tuple[APIClient, User | None]:
    call_command("seed_technician_catalog")
    client = APIClient()
    user: User | None = None
    if phone is not None:
        user = User.objects.create_user(phone_number=phone)
        client.force_authenticate(user)
    client.get("/api/v1/cart/")
    return client, user


def _add_item(client: APIClient, *, slug: str, cart_version: int) -> dict[str, object]:
    variant = ServiceVariant.objects.get(service__slug=slug)
    response = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": cart_version,
            "variant_id": str(variant.id),
            "quantity": 1,
            "scope": {"quantity": 1},
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return response.json()


def _service_id(slug: str) -> object:
    return Service.objects.get(slug=slug).id


def test_suggests_a_service_the_same_partner_can_add() -> None:
    client, user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])

    suggested = cart_suggestion_service_ids(cart=Cart.objects.get(customer=user))

    assert _service_id("fan-installation") in suggested


def test_parallel_only_partners_are_not_suggested() -> None:
    """PARALLEL_ALLOWED means a *second* professional — a second visit, not the same one."""
    client, user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])

    suggested = cart_suggestion_service_ids(cart=Cart.objects.get(customer=user))

    assert _service_id("tap-repair") not in suggested


def test_services_already_in_the_cart_are_not_suggested() -> None:
    client, user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    first = _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])
    _add_item(client, slug="fan-installation", cart_version=int(first["version"]))

    suggested = cart_suggestion_service_ids(cart=Cart.objects.get(customer=user))

    assert _service_id("switch-socket-repair") not in suggested
    assert _service_id("fan-installation") not in suggested


def test_a_retired_rule_stops_suggesting() -> None:
    client, user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])
    switch = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    fan = ServiceVariant.objects.get(service__slug="fan-installation")
    rule = ServiceCompatibilityRule.objects.get(
        left_variant_id__in=(switch.id, fan.id),
        right_variant_id__in=(switch.id, fan.id),
    )
    rule.effective_to = timezone.now() - timedelta(minutes=1)
    rule.save(update_fields=("effective_to",))

    suggested = cart_suggestion_service_ids(cart=Cart.objects.get(customer=user))

    assert _service_id("fan-installation") not in suggested


def test_an_empty_cart_suggests_nothing() -> None:
    client, user = _client_with_cart("+919876543210")
    client.get("/api/v1/cart/")

    assert cart_suggestion_service_ids(cart=Cart.objects.get(customer=user)) == ()


def test_api_returns_service_cards() -> None:
    client, _user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    item = _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])

    response = client.post("/api/v1/cart/suggestions/", {}, format="json")

    assert response.status_code == HTTPStatus.OK, response.json()
    body = response.json()
    assert body["cart_version"] == int(item["version"])
    slugs = {card["slug"] for card in body["suggestions"]}
    assert "fan-installation" in slugs
    card = next(entry for entry in body["suggestions"] if entry["slug"] == "fan-installation")
    assert card["starting_price"]["amount_paise"] > 0
    assert card["name"]


def test_api_returns_an_empty_list_rather_than_substituting() -> None:
    """No fallback. An honest empty answer, which the client renders as nothing."""
    client, _user = _client_with_cart("+919876543210")
    client.get("/api/v1/cart/")

    response = client.post("/api/v1/cart/suggestions/", {}, format="json")

    assert response.status_code == HTTPStatus.OK
    assert response.json()["suggestions"] == []


def test_anonymous_carts_get_suggestions_too() -> None:
    client, _user = _client_with_cart()
    cart = client.get("/api/v1/cart/").json()
    _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])

    response = client.post("/api/v1/cart/suggestions/", {}, format="json")

    assert response.status_code == HTTPStatus.OK
    assert "fan-installation" in {card["slug"] for card in response.json()["suggestions"]}


def test_a_paused_service_is_never_suggested() -> None:
    """The catalog's publishability gate applies here, not just to the catalog."""
    client, _user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])
    assert "fan-installation" in {
        card["slug"]
        for card in client.post("/api/v1/cart/suggestions/", {}, format="json").json()[
            "suggestions"
        ]
    }

    Service.objects.filter(slug="fan-installation").update(status=Service.Status.PAUSED)

    response = client.post("/api/v1/cart/suggestions/", {}, format="json")

    assert response.status_code == HTTPStatus.OK
    assert "fan-installation" not in {card["slug"] for card in response.json()["suggestions"]}


def test_suggestions_are_capped() -> None:
    """A cart page shows a strip, not a catalog. The cap is part of the contract."""
    client, user = _client_with_cart("+919876543210")
    cart = client.get("/api/v1/cart/").json()
    _add_item(client, slug="switch-socket-repair", cart_version=cart["version"])

    suggested = cart_suggestion_service_ids(cart=Cart.objects.get(customer=user), limit=1)

    assert len(suggested) == 1
