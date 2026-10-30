from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta
from http import HTTPStatus
from threading import Barrier
from typing import cast
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.db import close_old_connections, connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.carts.exceptions import QuoteExpiredApiError
from apps.carts.models import (
    BookingGroup,
    Cart,
    CartItem,
    FulfilmentPlanSet,
    Quote,
    ServiceCompatibilityRule,
)
from apps.carts.services import add_cart_item, create_checkout, update_cart_item
from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)

pytestmark = pytest.mark.django_db
TWO_SERVICES = 2
UPDATED_ITEM_VERSION = 2


def _address_payload() -> dict[str, object]:
    return {
        "label": "Home",
        "line1": "1 Vsolve Street",
        "line2": "",
        "landmark": "Near the park",
        "locality": "Khajaguda",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500032",
        "country_code": "IN",
        "latitude": "17.414053",
        "longitude": "78.353554",
        "source": "MANUAL",
        "is_default": True,
    }


def _preferred_start() -> datetime:
    zone = ZoneInfo("Asia/Kolkata")
    local_date = timezone.now().astimezone(zone).date() + timedelta(days=1)
    return datetime.combine(local_date, time(10), tzinfo=zone)


def _customer_context() -> tuple[APIClient, User, str, int]:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number="+919876543210")
    client = APIClient()
    client.force_authenticate(customer)
    cart = client.get("/api/v1/cart/")
    assert cart.status_code == HTTPStatus.OK
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    return client, customer, address.json()["id"], cart.json()["version"]


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
    assert response.status_code == HTTPStatus.CREATED
    return response.json()


def test_cart_derives_legacy_scope_quantity_from_the_canonical_quantity() -> None:
    call_command("seed_technician_catalog")
    client = APIClient()
    cart = client.get("/api/v1/cart/").json()
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")

    response = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": cart["version"],
            "variant_id": str(variant.id),
            "quantity": TWO_SERVICES,
            "scope": {},
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json()["items"][0]["quantity"] == TWO_SERVICES
    assert response.json()["items"][0]["scope"] == {"quantity": TWO_SERVICES}


def test_cart_rejects_conflicting_top_level_and_scope_quantities() -> None:
    call_command("seed_technician_catalog")
    client = APIClient()
    cart = client.get("/api/v1/cart/").json()
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")

    response = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": cart["version"],
            "variant_id": str(variant.id),
            "quantity": TWO_SERVICES,
            "scope": {"quantity": 1},
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["details"][0]["code"] == "cart_invalid"


def _partner(*, suffix: str, variant_slugs: tuple[str, ...]) -> PartnerProfile:
    area = ServiceArea.objects.get(slug="hyderabad-500032")
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    for variant in ServiceVariant.objects.filter(service__slug__in=variant_slugs):
        PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    starts_at = _preferred_start().astimezone(ZoneInfo(area.timezone))
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=area,
        weekday=starts_at.weekday(),
        starts_at=time(8),
        ends_at=time(20),
    )
    return partner


def _scheduling_groups(
    client: APIClient, *, address_id: str, cart_version: int
) -> list[dict[str, object]]:
    response = client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": address_id, "expected_cart_version": cart_version},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK, response.json()
    return cast(list[dict[str, object]], response.json()["groups"])


def _plan(
    client: APIClient,
    *,
    address_id: str,
    cart_version: int,
    starts_at: datetime | None = None,
) -> dict[str, object]:
    """Plans the cart, giving every published visit the same start.

    Real callers pick a time per visit; these tests are about the planner's
    structure rather than about scheduling, so they hand every group one time and
    keep the old single-start behaviour as the case under test.
    """
    when = _preferred_start() if starts_at is None else starts_at
    groups = _scheduling_groups(client, address_id=address_id, cart_version=cart_version)
    response = client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version,
            "preferred_starts": [
                {"group_key": group["key"], "starts_at": when.isoformat()} for group in groups
            ],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"plan-{cart_version}",
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return response.json()


def test_compatible_services_create_sequential_and_independent_alternatives() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(
        client,
        slug="fan-installation",
        cart_version=int(first["version"]),
    )
    # Two Partners, where this test used to seed one. The independent-visits
    # alternative splits the cart into two visits which — at the single preferred
    # start these tests hand every group — land back to back. One Partner cannot
    # take both: a reservation occupies the visit plus M1_TURNAROUND_MINUTES, so the
    # second visit overlaps the first's occupied range. Before BE-3,
    # `_has_cross_visit_conflict` compared bare durations, judged them
    # non-overlapping and published an alternative that collided at accept time
    # behind "another professional has accepted". Staffing it properly is what
    # makes this test about plan structure again rather than about that bug.
    _partner(
        suffix="11",
        variant_slugs=("switch-socket-repair", "fan-installation"),
    )
    _partner(
        suffix="13",
        variant_slugs=("switch-socket-repair", "fan-installation"),
    )

    plan_set = _plan(client, address_id=address_id, cart_version=int(second["version"]))

    assert [plan["structure"] for plan in plan_set["plans"]] == [
        "SINGLE_PARTNER_SEQUENTIAL",
        "INDEPENDENT_VISITS",
    ]
    recommended = plan_set["plans"][0]
    assert recommended["professional_count"] == 1
    assert recommended["visit_count"] == 1
    assert len(recommended["units"][0]["items"]) == TWO_SERVICES
    for plan in plan_set["plans"]:
        item_ids = [item["cart_item_id"] for unit in plan["units"] for item in unit["items"]]
        assert len(item_ids) == len(set(item_ids)) == TWO_SERVICES


def test_same_category_without_common_partner_does_not_combine() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(
        client,
        slug="fan-installation",
        cart_version=int(first["version"]),
    )
    _partner(suffix="11", variant_slugs=("switch-socket-repair",))
    _partner(suffix="12", variant_slugs=("fan-installation",))

    plan_set = _plan(client, address_id=address_id, cart_version=int(second["version"]))

    assert plan_set["plans"][0]["structure"] == "INDEPENDENT_VISITS"
    assert plan_set["plans"][0]["professional_count"] == TWO_SERVICES


def test_dependency_rule_orders_lines_even_when_cart_order_is_reversed() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="fan-installation", cart_version=version)
    second = _add_item(
        client,
        slug="switch-socket-repair",
        cart_version=int(first["version"]),
    )
    switch = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    fan = ServiceVariant.objects.get(service__slug="fan-installation")
    rule = ServiceCompatibilityRule.objects.get(
        left_variant_id__in=(switch.id, fan.id),
        right_variant_id__in=(switch.id, fan.id),
    )
    rule.dependency = (
        ServiceCompatibilityRule.Dependency.LEFT_BEFORE_RIGHT
        if rule.left_variant_id == switch.id
        else ServiceCompatibilityRule.Dependency.RIGHT_BEFORE_LEFT
    )
    rule.save(update_fields=("dependency",))
    _partner(
        suffix="11",
        variant_slugs=("switch-socket-repair", "fan-installation"),
    )

    plan_set = _plan(client, address_id=address_id, cart_version=int(second["version"]))

    slugs = [
        item["variant_snapshot"]["service_slug"]
        for item in plan_set["plans"][0]["units"][0]["items"]
    ]
    assert slugs == ["switch-socket-repair", "fan-installation"]


def test_explicit_cross_trade_compatibility_requires_distinct_parallel_capacity() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="tap-repair", cart_version=int(first["version"]))
    _partner(suffix="11", variant_slugs=("switch-socket-repair",))
    _partner(suffix="12", variant_slugs=("tap-repair",))

    plan_set = _plan(client, address_id=address_id, cart_version=int(second["version"]))

    assert plan_set["plans"][0]["structure"] == "COORDINATED_PARALLEL"
    assert plan_set["plans"][0]["professional_count"] == TWO_SERVICES
    starts = {unit["starts_at"] for unit in plan_set["plans"][0]["units"]}
    assert len(starts) == 1


def test_selected_plan_quote_is_immutable_and_checkout_materializes_group_units() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(
        client,
        slug="fan-installation",
        cart_version=int(first["version"]),
    )
    _partner(
        suffix="11",
        variant_slugs=("switch-socket-repair", "fan-installation"),
    )
    plan_set = _plan(client, address_id=address_id, cart_version=int(second["version"]))
    plan = plan_set["plans"][0]

    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="quote-selected-plan",
    )
    assert quote_response.status_code == HTTPStatus.CREATED
    quote = quote_response.json()
    assert quote["total"] == plan["total"]
    assert len(quote["units"]) == 1

    checkout = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="group-checkout",
    )
    assert checkout.status_code == HTTPStatus.CREATED, checkout.json()
    group = checkout.json()["booking_group"]
    assert group["confirmation_policy"] == "ALL_OR_NOTHING"
    assert len(group["units"]) == 1
    assert (
        len([line for line in group["units"][0]["lines"] if line["kind"] == "SERVICE"])
        == TWO_SERVICES
    )
    assert BookingGroup.objects.filter(id=group["id"], units__lines__isnull=False).exists()
    assert Quote.objects.get(id=quote["id"]).status == Quote.Status.CONSUMED


def test_cart_edit_invalidates_active_plan_and_preserves_quote_history() -> None:
    client, _customer, address_id, version = _customer_context()
    cart = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="11", variant_slugs=("switch-socket-repair",))
    plan_set = _plan(client, address_id=address_id, cart_version=int(cart["version"]))
    quote = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_set["plans"][0]["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="quote-before-cart-edit",
    ).json()
    item = cart["items"][0]

    updated = client.patch(
        f"/api/v1/cart/items/{item['id']}/",
        {
            "expected_cart_version": cart["version"],
            "expected_item_version": item["version"],
            "quantity": 2,
            "scope": {"quantity": 2},
        },
        format="json",
    )
    assert updated.status_code == HTTPStatus.OK

    historical = client.get(f"/api/v1/plan-quotes/{quote['id']}/")
    assert historical.status_code == HTTPStatus.OK
    assert historical.json()["status"] == "INVALIDATED"
    assert FulfilmentPlanSet.objects.get(id=plan_set["id"]).status == (
        FulfilmentPlanSet.Status.SELECTED
    )
    assert CartItem.objects.get(id=item["id"]).version == UPDATED_ITEM_VERSION


def test_cart_version_conflict_does_not_create_an_extra_item() -> None:
    client, _customer, _address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)

    conflict = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": version,
            "variant_id": str(ServiceVariant.objects.get(service__slug="fan-installation").id),
            "quantity": 1,
            "scope": {"quantity": 1},
        },
        format="json",
    )

    assert conflict.status_code == HTTPStatus.CONFLICT
    assert conflict.json()["error"]["code"] == "cart_version_conflict"
    assert len(first["items"]) == 1


def test_login_merge_preserves_nonduplicate_intent_and_requires_duplicate_decision() -> None:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number="+919876543210")
    variant = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    add_cart_item(
        user=customer,
        session_key="authenticated-cart",
        expected_cart_version=1,
        variant_id=variant.id,
        quantity=1,
        scope={"quantity": 1},
    )
    client = APIClient()
    anonymous_cart = client.get("/api/v1/cart/").json()
    anonymous_cart = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": anonymous_cart["version"],
            "variant_id": str(variant.id),
            "quantity": 1,
            "scope": {"quantity": 1},
        },
        format="json",
    ).json()
    session_item_id = anonymous_cart["items"][0]["id"]
    client.force_authenticate(customer)

    conflict = client.get("/api/v1/cart/")

    assert conflict.status_code == HTTPStatus.CONFLICT
    details = conflict.json()["error"]["details"]
    assert details["conflicts"][0]["kind"] == "EXACT_DUPLICATE"
    merged = client.post(
        "/api/v1/cart/merge/",
        {
            "expected_customer_cart_version": details["customer_cart_version"],
            "expected_session_cart_version": details["session_cart_version"],
            "decisions": [{"session_item_id": session_item_id, "action": "KEEP_BOTH"}],
        },
        format="json",
    )
    assert merged.status_code == HTTPStatus.OK
    assert len(merged.json()["items"]) == TWO_SERVICES


@pytest.mark.django_db(transaction=True)
def test_concurrent_cart_edit_and_checkout_have_one_serialized_truth() -> None:
    client, customer, address_id, version = _customer_context()
    cart_response = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="31", variant_slugs=("switch-socket-repair",))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(cart_response["version"]),
    )
    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_set["plans"][0]["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="quote-concurrent-confirmation",
    )
    assert quote_response.status_code == HTTPStatus.CREATED
    quote = Quote.objects.get(id=quote_response.json()["id"])
    cart = Cart.objects.get(id=cart_response["id"])
    item = CartItem.objects.get(id=cart_response["items"][0]["id"])
    barrier = Barrier(2)

    def checkout_worker() -> str:
        close_old_connections()
        try:
            barrier.wait()
            try:
                create_checkout(customer=customer, quote=quote)
            except QuoteExpiredApiError:
                return "STALE_REJECTED"
            return "CHECKOUT_WON"
        finally:
            connections.close_all()

    def edit_worker() -> str:
        close_old_connections()
        try:
            barrier.wait()
            update_cart_item(
                cart=cart,
                item_id=item.id,
                expected_cart_version=cart.version,
                expected_item_version=item.version,
                quantity=2,
                scope={"quantity": 2},
            )
            return "EDIT_COMMITTED"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        checkout_future = executor.submit(checkout_worker)
        edit_future = executor.submit(edit_worker)
        checkout_outcome = checkout_future.result(timeout=15)
        assert edit_future.result(timeout=15) == "EDIT_COMMITTED"

    cart.refresh_from_db()
    quote.refresh_from_db()
    assert cart.version == int(cart_response["version"]) + 1
    if checkout_outcome == "CHECKOUT_WON":
        assert quote.status == Quote.Status.CONSUMED
        assert BookingGroup.objects.filter(quote=quote).count() == 1
    else:
        assert checkout_outcome == "STALE_REJECTED"
        assert quote.status == Quote.Status.INVALIDATED
        assert not BookingGroup.objects.filter(quote=quote).exists()


def test_plan_quote_idempotent_replay_returns_active_quote() -> None:
    client, _customer, address_id, version = _customer_context()
    cart_response = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="41", variant_slugs=("switch-socket-repair",))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(cart_response["version"]),
    )
    plan_id = plan_set["plans"][0]["id"]
    response1 = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-1",
    )
    assert response1.status_code == HTTPStatus.CREATED
    quote1_id = response1.json()["id"]

    plan_set_obj = FulfilmentPlanSet.objects.get(id=plan_set["id"])
    assert plan_set_obj.status == FulfilmentPlanSet.Status.SELECTED

    # Replay with same idempotency key
    response2 = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-1",
    )
    assert response2.status_code == HTTPStatus.CREATED
    assert response2.json()["id"] == quote1_id

    # Call with a new idempotency key for the same plan while quote is ACTIVE
    response3 = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-2",
    )
    assert response3.status_code == HTTPStatus.CREATED
    assert response3.json()["id"] == quote1_id


def test_plan_quote_with_expired_quote_returns_stale_error() -> None:
    client, _customer, address_id, version = _customer_context()
    cart_response = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="42", variant_slugs=("switch-socket-repair",))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(cart_response["version"]),
    )
    plan_id = plan_set["plans"][0]["id"]
    response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-expire",
    )
    assert response.status_code == HTTPStatus.CREATED
    quote = Quote.objects.get(id=response.json()["id"])
    quote.status = Quote.Status.EXPIRED
    quote.expires_at = timezone.now() - timedelta(minutes=5)
    quote.save(update_fields=("status", "expires_at"))

    # Re-requesting quote when expired must return 409 conflict
    stale_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-expire-retry",
    )
    assert stale_response.status_code == HTTPStatus.CONFLICT
    assert "fulfilment_plan_stale" in str(stale_response.json())


def test_plan_quote_with_cart_version_change_invalidates() -> None:
    client, customer, address_id, version = _customer_context()
    cart_response = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="43", variant_slugs=("switch-socket-repair", "fan-installation"))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(cart_response["version"]),
    )
    plan_id = plan_set["plans"][0]["id"]
    response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-cart-change",
    )
    assert response.status_code == HTTPStatus.CREATED
    quote = Quote.objects.get(id=response.json()["id"])

    # Modify cart to bump version
    _add_item(client, slug="fan-installation", cart_version=int(cart_response["version"]))

    # Calling create quote again must fail with 409 conflict
    stale_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-cart-change-retry",
    )
    assert stale_response.status_code == HTTPStatus.CONFLICT
    assert "fulfilment_plan_stale" in str(stale_response.json())

    # Attempting checkout with stale quote raises QuoteExpiredApiError
    with pytest.raises(QuoteExpiredApiError):
        create_checkout(customer=customer, quote=quote)


def test_invalidated_plan_set_blocks_checkout() -> None:
    client, customer, address_id, version = _customer_context()
    cart_response = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="47", variant_slugs=("switch-socket-repair",))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(cart_response["version"]),
    )
    plan_id = plan_set["plans"][0]["id"]
    response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-key-invalidated",
    )
    assert response.status_code == HTTPStatus.CREATED
    quote = Quote.objects.get(id=response.json()["id"])
    quote.status = Quote.Status.INVALIDATED
    quote.save(update_fields=("status",))

    with pytest.raises(QuoteExpiredApiError):
        create_checkout(customer=customer, quote=quote)


def test_plan_quote_cannot_quote_different_plan_when_already_selected() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="fan-installation", cart_version=int(first["version"]))
    _partner(suffix="44", variant_slugs=("switch-socket-repair", "fan-installation"))
    _partner(suffix="45", variant_slugs=("switch-socket-repair", "fan-installation"))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(second["version"]),
    )
    assert len(plan_set["plans"]) >= 2
    plan0_id = plan_set["plans"][0]["id"]
    plan1_id = plan_set["plans"][1]["id"]

    response0 = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan0_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-plan-0",
    )
    assert response0.status_code == HTTPStatus.CREATED

    # Attempting to quote plan 1 when plan set is already SELECTED with plan 0 active quote
    response1 = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan1_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-plan-1",
    )
    assert response1.status_code == HTTPStatus.CONFLICT


def test_selected_plan_set_with_active_quote_allows_checkout() -> None:
    client, customer, address_id, version = _customer_context()
    cart_response = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="46", variant_slugs=("switch-socket-repair",))
    plan_set = _plan(
        client,
        address_id=address_id,
        cart_version=int(cart_response["version"]),
    )
    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_set["plans"][0]["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="idempotency-checkout-test",
    )
    assert quote_response.status_code == HTTPStatus.CREATED
    quote = Quote.objects.get(id=quote_response.json()["id"])

    plan_set_obj = FulfilmentPlanSet.objects.get(id=plan_set["id"])
    assert plan_set_obj.status == FulfilmentPlanSet.Status.SELECTED
    assert quote.status == Quote.Status.ACTIVE

    checkout = create_checkout(customer=customer, quote=quote)
    assert checkout is not None
    assert checkout.status == "CREATED"

