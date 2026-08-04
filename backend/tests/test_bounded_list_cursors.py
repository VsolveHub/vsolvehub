"""Proposal 0008 — typed, bounded cursor traversal on the two authorized list projections.

Both `/api/v1/booking-groups/` and `/api/v1/partner/offers/` already paginated at runtime
while publishing no query parameter, so a generated client was handed a `next` URL it was
structurally unable to send. These tests hold the published parameter to the behaviour the
proposal asks for: page two is reachable through the parameter rather than through a raw
fetch of the absolute link, a walk sees every authorized row exactly once, the cursor is a
position and never an authorization bypass, and an unusable cursor fails as a recoverable
refusal rather than as a stack trace.
"""

from datetime import timedelta
from http import HTTPStatus
from typing import Any, cast
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.assignments.models import AssignmentAttempt, PartnerOffer
from apps.assignments.views import PartnerOfferCursorPagination
from apps.carts.models import BookingGroup, FulfilmentUnit, PlanUnit, Quote, QuoteUnit
from apps.carts.views import BookingGroupCursorPagination
from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerProfile
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

BOOKING_GROUP_PAGE_SIZE = 25
PARTNER_OFFER_PAGE_SIZE = 50
TEST_PAGE_SIZE = 2
OWNED_RECORDS = 5
FOREIGN_RECORDS = 3
CONCURRENT_INSERTS = 3
MAX_WALKED_PAGES = 8
BOOKING_GROUPS_PATH = "/api/v1/booking-groups/"
PARTNER_OFFERS_PATH = "/api/v1/partner/offers/"

# Cursors a real client can arrive at: a truncated copy/paste, a stale value mangled in a
# URL, a hand-edited one. Each is decoded by a different branch of DRF's cursor reader, and
# the `p=garbage` case is the one that reached the database and raised rather than refusing.
UNUSABLE_CURSORS = (
    "not-a-real-cursor",  # never decodes: incorrect base64 padding
    "cD1nYXJiYWdl",  # decodes to `p=garbage`, then poisons the ordering comparison
    "bz1ub3QtYS1udW1iZXI=",  # decodes to `o=not-a-number`, an unusable page offset
    "//79",  # decodes to bytes that are not ASCII
)


def _quote(client: APIClient, plan_id: str, *, key: str) -> dict[str, Any]:
    response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return cast(dict[str, Any], response.json())


def _checkout(client: APIClient, quote_id: str, *, key: str) -> dict[str, Any]:
    response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return cast(dict[str, Any], response.json())


def _partner_client(partner: PartnerProfile) -> APIClient:
    role, _created = Role.objects.get_or_create(
        code="partner",
        defaults={"name": "Partner", "is_system": True},
    )
    UserRole.objects.get_or_create(user=partner.user, role=role)
    return force_role_client(user=partner.user, role_code="partner")


class Tenant:
    """One Customer, their first real Booking Group, and a Partner with a real inbox."""

    def __init__(
        self,
        *,
        client: APIClient,
        customer: User,
        group: BookingGroup,
        partner: PartnerProfile,
    ) -> None:
        self.client = client
        self.customer = customer
        self.group = group
        self.partner = partner
        self.partner_client = _partner_client(partner)


def _tenant(*, phone: str, partner_suffix: str, key_prefix: str) -> Tenant:
    """Run the real Customer flow once so every cloned row descends from real data."""

    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart = client.get("/api/v1/cart/")
    assert cart.status_code == HTTPStatus.OK
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug="switch-socket-repair", cart_version=cart.json()["version"])
    partner = _partner(suffix=partner_suffix, variant_slugs=("switch-socket-repair",))
    plan_set = _plan(client, address_id=address.json()["id"], cart_version=int(item["version"]))
    plan = cast(list[dict[str, Any]], plan_set["plans"])[0]
    quote = _quote(client, str(plan["id"]), key=f"{key_prefix}-quote")
    checkout = _checkout(client, str(quote["id"]), key=f"{key_prefix}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    return Tenant(client=client, customer=customer, group=group, partner=partner)


def _clone_booking_group(template: BookingGroup) -> BookingGroup:
    """Add one more Booking Group for the same Customer, from a real quote."""

    quote = Quote.objects.get(id=template.quote_id)
    quote.id = uuid4()
    quote.fulfilment_plan = None
    quote._state.adding = True
    quote.save()
    return BookingGroup.objects.create(
        customer_id=template.customer_id,
        quote=quote,
        address_id=template.address_id,
        confirmation_policy=template.confirmation_policy,
        status=template.status,
        expires_at=template.expires_at,
    )


def _clone_partner_offer(*, group: BookingGroup, partner: PartnerProfile) -> PartnerOffer:
    """Add one more live unit-scoped offer for the same Partner, from real plan data."""

    template_unit = group.units.order_by("position").first()
    assert template_unit is not None
    template_offer = PartnerOffer.objects.filter(fulfilment_unit=template_unit).first()
    assert template_offer is not None
    position = 1 + max(
        FulfilmentUnit.objects.filter(booking_group=group).values_list("position", flat=True)
    )

    quote_unit = QuoteUnit.objects.get(id=template_unit.quote_unit_id)
    plan_unit = PlanUnit.objects.get(id=quote_unit.plan_unit_id)
    plan_unit.id = uuid4()
    plan_unit.position = position
    plan_unit._state.adding = True
    plan_unit.save()

    quote_unit.id = uuid4()
    quote_unit.position = position
    quote_unit.plan_unit = plan_unit
    quote_unit._state.adding = True
    quote_unit.save()

    unit = FulfilmentUnit.objects.create(
        booking_group=group,
        quote_unit=quote_unit,
        service_area=template_unit.service_area,
        position=position,
        requested_start=template_unit.requested_start,
        arrival_window_minutes=template_unit.arrival_window_minutes,
        estimated_duration_minutes=template_unit.estimated_duration_minutes,
        total_paise=template_unit.total_paise,
        currency=template_unit.currency,
    )
    attempt = AssignmentAttempt.objects.create(fulfilment_unit=unit, candidate=partner, rank=1)
    return PartnerOffer.objects.create(
        fulfilment_unit=unit,
        partner=partner,
        attempt=attempt,
        status=PartnerOffer.Status.OFFERED,
        expires_at=timezone.now() + timedelta(seconds=45),
        partner_projection_snapshot=template_offer.partner_projection_snapshot,
    )


def _cursor_of(next_link: str | None) -> str | None:
    """Read the `cursor` value out of `next` the way a typed client must.

    The frontend boundary rules forbid raw-fetching the absolute link, so the only
    supported traversal is re-sending this value as the declared query parameter.
    """

    if next_link is None:
        return None
    values = parse_qs(urlparse(next_link).query).get("cursor")
    assert values, f"`next` carried no cursor parameter: {next_link}"
    return values[0]


def _walk(client: APIClient, path: str) -> list[dict[str, Any]]:
    """Follow `next` to exhaustion using only the published query parameter."""

    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    pages = 0
    while True:
        response = client.get(path, {"cursor": cursor} if cursor else {})
        assert response.status_code == HTTPStatus.OK, response.json()
        page = response.json()
        rows.extend(page["results"])
        pages += 1
        assert pages <= MAX_WALKED_PAGES, "cursor traversal did not terminate"
        cursor = _cursor_of(page["next"])
        if cursor is None:
            return rows


def _identifiers(rows: list[dict[str, Any]]) -> list[str]:
    return [str(row["id"]) for row in rows]


def _bounded_test_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    """Shrink both published bounds so a handful of rows still spans several pages."""

    monkeypatch.setattr(BookingGroupCursorPagination, "page_size", TEST_PAGE_SIZE)
    monkeypatch.setattr(PartnerOfferCursorPagination, "page_size", TEST_PAGE_SIZE)


def test_published_page_sizes_stay_server_bounded_and_deterministically_ordered() -> None:
    """Requirement 4 — publishing `cursor` must not also open a client page-size lever."""

    assert BookingGroupCursorPagination.page_size == BOOKING_GROUP_PAGE_SIZE
    assert BookingGroupCursorPagination.page_size_query_param is None
    assert BookingGroupCursorPagination.ordering == ("-created_at", "-id")
    assert PartnerOfferCursorPagination.page_size == PARTNER_OFFER_PAGE_SIZE
    assert PartnerOfferCursorPagination.page_size_query_param is None
    assert PartnerOfferCursorPagination.ordering == ("-created_at", "-id")


def test_a_client_cannot_widen_a_page_through_an_unpublished_parameter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    for _ in range(OWNED_RECORDS - 1):
        _clone_booking_group(tenant.group)

    response = tenant.client.get(BOOKING_GROUPS_PATH, {"page_size": "1000", "limit": "1000"})

    assert response.status_code == HTTPStatus.OK
    assert len(response.json()["results"]) == TEST_PAGE_SIZE


def test_customer_booking_group_cursor_walk_returns_every_group_exactly_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    for _ in range(OWNED_RECORDS - 1):
        _clone_booking_group(tenant.group)
    expected = {
        str(value)
        for value in BookingGroup.objects.filter(customer=tenant.customer).values_list(
            "id", flat=True
        )
    }
    assert len(expected) == OWNED_RECORDS

    first_page = tenant.client.get(BOOKING_GROUPS_PATH)
    assert first_page.status_code == HTTPStatus.OK
    assert len(first_page.json()["results"]) == TEST_PAGE_SIZE
    assert first_page.json()["next"] is not None

    second_page = tenant.client.get(
        BOOKING_GROUPS_PATH, {"cursor": _cursor_of(first_page.json()["next"])}
    )
    assert second_page.status_code == HTTPStatus.OK
    assert len(second_page.json()["results"]) == TEST_PAGE_SIZE
    assert not set(_identifiers(second_page.json()["results"])) & set(
        _identifiers(first_page.json()["results"])
    )

    walked = _identifiers(_walk(tenant.client, BOOKING_GROUPS_PATH))
    assert len(walked) == len(set(walked)) == OWNED_RECORDS
    assert set(walked) == expected


def test_customer_booking_group_pages_stay_in_one_deterministic_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    for _ in range(OWNED_RECORDS - 1):
        _clone_booking_group(tenant.group)

    walked = _walk(tenant.client, BOOKING_GROUPS_PATH)

    created = [parse_datetime(str(row["created_at"])) for row in walked]
    assert created == sorted(created, reverse=True)
    assert _identifiers(walked) == _identifiers(_walk(tenant.client, BOOKING_GROUPS_PATH))


def test_booking_group_cursor_never_reaches_another_customers_groups(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Requirement 5 — the cursor is a position in an owned list, not a key to one."""

    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    owner = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    other = _tenant(phone="+919876500022", partner_suffix="82", key_prefix="cursor-other")
    for _ in range(OWNED_RECORDS - 1):
        _clone_booking_group(owner.group)
    for _ in range(FOREIGN_RECORDS - 1):
        _clone_booking_group(other.group)
    foreign = {
        str(value)
        for value in BookingGroup.objects.filter(customer=other.customer).values_list(
            "id", flat=True
        )
    }

    stolen = _cursor_of(owner.client.get(BOOKING_GROUPS_PATH).json()["next"])
    replayed = other.client.get(BOOKING_GROUPS_PATH, {"cursor": stolen})

    assert replayed.status_code == HTTPStatus.OK
    assert set(_identifiers(replayed.json()["results"])).issubset(foreign)
    assert not set(_identifiers(_walk(owner.client, BOOKING_GROUPS_PATH))) & foreign


def test_partner_offer_cursor_walk_returns_every_offer_exactly_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    for _ in range(OWNED_RECORDS - 1):
        _clone_partner_offer(group=tenant.group, partner=tenant.partner)
    expected = {
        str(value)
        for value in PartnerOffer.objects.filter(partner=tenant.partner).values_list(
            "id", flat=True
        )
    }
    assert len(expected) == OWNED_RECORDS

    first_page = tenant.partner_client.get(PARTNER_OFFERS_PATH)
    assert first_page.status_code == HTTPStatus.OK
    assert len(first_page.json()["results"]) == TEST_PAGE_SIZE
    assert first_page.json()["next"] is not None

    second_page = tenant.partner_client.get(
        PARTNER_OFFERS_PATH, {"cursor": _cursor_of(first_page.json()["next"])}
    )
    assert second_page.status_code == HTTPStatus.OK
    assert len(second_page.json()["results"]) == TEST_PAGE_SIZE
    assert not set(_identifiers(second_page.json()["results"])) & set(
        _identifiers(first_page.json()["results"])
    )

    walked = _walk(tenant.partner_client, PARTNER_OFFERS_PATH)
    identifiers = _identifiers(walked)
    assert len(identifiers) == len(set(identifiers)) == OWNED_RECORDS
    assert set(identifiers) == expected
    created = [parse_datetime(str(row["created_at"])) for row in walked]
    assert created == sorted(created, reverse=True)


def test_partner_offer_cursor_never_reaches_another_partners_offers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Requirement 5 — a Partner inbox stays their own inbox at every page."""

    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    owner = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    other = _tenant(phone="+919876500022", partner_suffix="82", key_prefix="cursor-other")
    for _ in range(OWNED_RECORDS - 1):
        _clone_partner_offer(group=owner.group, partner=owner.partner)
    for _ in range(FOREIGN_RECORDS - 1):
        _clone_partner_offer(group=other.group, partner=other.partner)
    foreign = {
        str(value)
        for value in PartnerOffer.objects.filter(partner=other.partner).values_list("id", flat=True)
    }

    stolen = _cursor_of(owner.partner_client.get(PARTNER_OFFERS_PATH).json()["next"])
    replayed = other.partner_client.get(PARTNER_OFFERS_PATH, {"cursor": stolen})

    assert replayed.status_code == HTTPStatus.OK
    assert set(_identifiers(replayed.json()["results"])).issubset(foreign)
    assert not set(_identifiers(_walk(owner.partner_client, PARTNER_OFFERS_PATH))) & foreign


@pytest.mark.parametrize("cursor", UNUSABLE_CURSORS)
def test_an_unusable_cursor_is_refused_rather_than_crashing(cursor: str) -> None:
    """Requirement 6 — a stale or mangled cursor must be a recoverable client refusal.

    A `NotFound` on a collection URL is indistinguishable from a routing failure, and a
    position that reaches the ordering comparison as free text raises instead of refusing.
    Both are published as one 400 the client can act on by resetting to page one.
    """

    call_command("seed_technician_catalog")
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")

    for client, path in (
        (tenant.client, BOOKING_GROUPS_PATH),
        (tenant.partner_client, PARTNER_OFFERS_PATH),
    ):
        response = client.get(path, {"cursor": cursor})
        assert response.status_code == HTTPStatus.BAD_REQUEST, response.json()
        assert response.json()["error"]["code"] == "cursor_invalid"
        assert response.json()["error"]["retryable"] is False


def test_a_blank_cursor_is_refused_by_the_published_minimum_length() -> None:
    """`minLength: 1` is published, so a blank value is out of contract rather than absent."""

    call_command("seed_technician_catalog")
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")

    for client, path in (
        (tenant.client, BOOKING_GROUPS_PATH),
        (tenant.partner_client, PARTNER_OFFERS_PATH),
    ):
        response = client.get(path, {"cursor": ""})
        assert response.status_code == HTTPStatus.BAD_REQUEST, response.json()
        assert response.json()["error"]["details"]["cursor"]


def test_rows_inserted_mid_walk_neither_duplicate_nor_skip_the_remaining_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The property cursor pagination exists to provide, stated as a test.

    Rows arriving at the head of a newest-first list while a walk is in flight must not
    shift the unread tail. A `next` link taken before the inserts must still return the
    rows that followed it, each exactly once, and must not replay a page already read.
    """

    call_command("seed_technician_catalog")
    _bounded_test_pages(monkeypatch)
    tenant = _tenant(phone="+919876500011", partner_suffix="81", key_prefix="cursor-owner")
    for _ in range(OWNED_RECORDS - 1):
        _clone_booking_group(tenant.group)
    original = {
        str(value)
        for value in BookingGroup.objects.filter(customer=tenant.customer).values_list(
            "id", flat=True
        )
    }

    first_page = tenant.client.get(BOOKING_GROUPS_PATH).json()
    seen = _identifiers(first_page["results"])
    cursor = _cursor_of(first_page["next"])

    inserted = {str(_clone_booking_group(tenant.group).id) for _ in range(CONCURRENT_INSERTS)}

    while cursor is not None:
        page = tenant.client.get(BOOKING_GROUPS_PATH, {"cursor": cursor}).json()
        seen.extend(_identifiers(page["results"]))
        cursor = _cursor_of(page["next"])

    assert len(seen) == len(set(seen)), "cursor traversal replayed a row"
    assert set(seen) == original, "cursor traversal skipped a row that existed when it began"
    assert not set(seen) & inserted
