"""Lists that grow with use come back one page at a time (contract 1.71.0)."""

from http import HTTPStatus

import pytest
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from apps.identity.models import Role, UserRole
from apps.rental.models import RentalAsset
from apps.rental.services import create_asset, moderate_asset, submit_asset
from apps.stay.services import public_properties
from apps.wallet.models import WalletTransaction
from apps.wallet.services import credit_wallet, get_or_create_wallet
from common.pagination import (
    BROWSE_MAX_PAGE_SIZE,
    BROWSE_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    browse_window,
    filter_statuses,
)
from tests.helpers import force_role_client
from tests.rental.test_cancel_booking import (  # noqa: F401
    _booked,
    _customer_client,
    rental_world,
)

User = get_user_model()
#: Rows past one full page, so the second page is short and has no `next`.
EXTRA = 3
factory = APIRequestFactory()


def _request(query: str = "") -> Request:
    return Request(factory.get(f"/x{query}"))


# --- helpers ------------------------------------------------------------------------------------


def test_browse_window_defaults_and_clamps() -> None:
    assert browse_window(_request()) == (BROWSE_PAGE_SIZE, 0)
    assert browse_window(_request("?limit=10&offset=30")) == (10, 30)
    assert browse_window(_request("?limit=9999")) == (BROWSE_MAX_PAGE_SIZE, 0)
    assert browse_window(_request("?limit=abc&offset=-5")) == (BROWSE_PAGE_SIZE, 0)


@pytest.mark.django_db
def test_filter_statuses_accepts_several_and_refuses_unknown() -> None:
    qs = RentalAsset.objects.all()
    assert filter_statuses(qs, _request(), RentalAsset.Status.values) is qs
    narrowed = filter_statuses(qs, _request("?status=active,retired"), RentalAsset.Status.values)
    assert "IN" in str(narrowed.query)
    with pytest.raises(serializers.ValidationError):
        filter_statuses(qs, _request("?status=NOPE"), RentalAsset.Status.values)


# --- a customer list ----------------------------------------------------------------------------


@pytest.mark.django_db
def test_wallet_transactions_page_newest_first_and_follow_next() -> None:
    user = User.objects.create_user(phone_number="+919876599001")
    wallet = get_or_create_wallet(user)
    for _ in range(DEFAULT_PAGE_SIZE + EXTRA):
        credit_wallet(wallet=wallet, amount_paise=100, kind=WalletTransaction.Kind.TOP_UP)
    client = APIClient()
    client.force_authenticate(user)

    first = client.get("/api/v1/customer/wallet/transactions/").json()
    assert len(first["results"]) == DEFAULT_PAGE_SIZE
    assert first["next"]
    created = [row["created_at"] for row in first["results"]]
    assert created == sorted(created, reverse=True)

    second = client.get(first["next"]).json()
    assert len(second["results"]) == EXTRA
    assert second["next"] is None
    ids = {row["id"] for row in first["results"]} | {row["id"] for row in second["results"]}
    assert len(ids) == DEFAULT_PAGE_SIZE + EXTRA


@pytest.mark.django_db
def test_a_blank_cursor_is_refused() -> None:
    user = User.objects.create_user(phone_number="+919876599002")
    client = APIClient()
    client.force_authenticate(user)
    response = client.get("/api/v1/customer/wallet/transactions/", {"cursor": " "})
    assert response.status_code == HTTPStatus.BAD_REQUEST


# --- Operations filters -------------------------------------------------------------------------


def _ops_client():
    ops_user = User.objects.create(phone_number="+919922240003", full_name="Ops Pages")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=ops_user, role=role, revoked_at=None)
    return force_role_client(user=ops_user, role_code="operations")


@pytest.mark.django_db
def test_ops_rental_bookings_search_by_customer_and_owner(rental_world):  # noqa: F811
    booking = _booked(rental_world)
    client = _ops_client()

    by_customer = client.get("/api/v1/ops/rentals/bookings", {"q": "Customer Cancel"}).data
    assert [row["id"] for row in by_customer["results"]] == [str(booking.id)]
    by_owner = client.get("/api/v1/ops/rentals/bookings", {"q": "owner cancel co"}).data
    assert [row["id"] for row in by_owner["results"]] == [str(booking.id)]
    by_id = client.get("/api/v1/ops/rentals/bookings", {"q": str(booking.id)}).data
    assert [row["id"] for row in by_id["results"]] == [str(booking.id)]
    nobody = client.get("/api/v1/ops/rentals/bookings", {"q": "zzz-no-match"}).data
    assert nobody["results"] == []


@pytest.mark.django_db
def test_ops_rental_listings_filter_the_review_queue(rental_world):  # noqa: F811
    _booked(rental_world)  # one approved asset
    client = _ops_client()

    pending = client.get("/api/v1/ops/rentals", {"moderation_status": "pending"}).data
    approved = client.get("/api/v1/ops/rentals", {"moderation_status": "APPROVED"}).data
    assert pending["results"] == []
    assert len(approved["results"]) == 1
    bad = client.get("/api/v1/ops/rentals", {"moderation_status": "nope"})
    assert bad.status_code == HTTPStatus.BAD_REQUEST


# --- public browse ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_rental_browse_is_never_unbounded(rental_world):  # noqa: F811
    for index in range(BROWSE_PAGE_SIZE + EXTRA):
        asset = create_asset(
            partner=rental_world["partner"],
            variant_id=rental_world["variant"].id,
            title=f"Drill {index}",
            daily_rate_paise=50000,
            deposit_paise=100000,
        )
        submit_asset(asset=asset, partner=rental_world["partner"])
        moderate_asset(asset=asset, actor=rental_world["owner"], action="APPROVE", reason="ok")
    client = APIClient()

    first = client.get("/api/v1/rentals").json()
    assert len(first) == BROWSE_PAGE_SIZE
    rest = client.get("/api/v1/rentals", {"offset": BROWSE_PAGE_SIZE}).json()
    assert {row["id"] for row in first}.isdisjoint({row["id"] for row in rest})
    assert len(first) + len(rest) == BROWSE_PAGE_SIZE + EXTRA


@pytest.mark.django_db
def test_ops_listings_filter_by_status_on_the_server() -> None:
    client = _ops_client()
    ok = client.get("/api/v1/ops/listings", {"status": "PUBLISHED,DRAFT", "q": "plumber"})
    assert ok.status_code == HTTPStatus.OK
    assert ok.data["results"] == []
    assert client.get("/api/v1/ops/listings", {"status": "NOPE"}).status_code == (
        HTTPStatus.BAD_REQUEST
    )


@pytest.mark.django_db
def test_my_applications_filter_by_job() -> None:
    user = User.objects.create_user(phone_number="+919876599003")
    client = APIClient()
    client.force_authenticate(user)
    none = client.get(
        "/api/v1/my/listing-applications", {"listing": "00000000-0000-0000-0000-000000000000"}
    )
    assert none.status_code == HTTPStatus.OK
    assert none.data["results"] == []
    bad = client.get("/api/v1/my/listing-applications", {"listing": "nope"})
    assert bad.status_code == HTTPStatus.BAD_REQUEST


# --- rental lists (contract 1.79.0: paged again after a regression) -----------------------------


def _paged(response) -> dict:
    """A paged list answers with the shared envelope, never a bare array."""
    assert response.status_code == HTTPStatus.OK, response.json()
    body = response.json()
    assert set(body) >= {"next", "previous", "results"}
    return body


@pytest.mark.django_db
def test_my_rentals_page_and_filter_on_the_server(rental_world):  # noqa: F811
    booking = _booked(rental_world)  # PENDING_PAYMENT
    client = _customer_client(rental_world["customer"])

    everything = _paged(client.get("/api/v1/me/rentals"))
    assert [row["id"] for row in everything["results"]] == [str(booking.id)]
    assert everything["next"] is None
    several = _paged(client.get("/api/v1/me/rentals", {"status": "CONFIRMED,PENDING_PAYMENT"}))
    assert [row["id"] for row in several["results"]] == [str(booking.id)]
    other = _paged(client.get("/api/v1/me/rentals", {"status": "RETURNED"}))
    assert other["results"] == []
    assert client.get("/api/v1/me/rentals", {"status": "NOPE"}).status_code == (
        HTTPStatus.BAD_REQUEST
    )
    assert client.get("/api/v1/me/rentals", {"cursor": " "}).status_code == (HTTPStatus.BAD_REQUEST)


@pytest.mark.django_db
def test_partner_rental_bookings_page_and_take_several_statuses(rental_world):  # noqa: F811
    booking = _booked(rental_world)
    client = force_role_client(user=rental_world["owner"], role_code="partner")

    page = _paged(
        client.get("/api/v1/partner/rentals/bookings", {"status": "PENDING_PAYMENT,CONFIRMED"})
    )
    assert [row["id"] for row in page["results"]] == [str(booking.id)]
    refused = client.get("/api/v1/partner/rentals/bookings", {"status": "NOPE"})
    assert refused.status_code == HTTPStatus.BAD_REQUEST


@pytest.mark.django_db
def test_ops_rental_bookings_list_is_back_and_paged(rental_world):  # noqa: F811
    # The admin screen and dashboard kept calling this endpoint after it was removed.
    booking = _booked(rental_world)

    page = _paged(_ops_client().get("/api/v1/ops/rentals/bookings"))

    assert [row["id"] for row in page["results"]] == [str(booking.id)]
    assert page["results"][0]["partner_name"]


@pytest.mark.django_db
def test_ops_rental_listings_take_several_moderation_states(rental_world):  # noqa: F811
    _booked(rental_world)  # one approved asset

    page = _paged(
        _ops_client().get("/api/v1/ops/rentals", {"moderation_status": "PENDING,APPROVED"})
    )

    assert len(page["results"]) == 1


@pytest.mark.django_db
def test_rental_browse_honours_limit_and_newest_first(rental_world):  # noqa: F811
    for _ in range(EXTRA):
        _booked(rental_world)  # an approved asset each
    client = APIClient()

    two = client.get("/api/v1/rentals", {"limit": 2}).json()
    assert len(two) == 2  # noqa: PLR2004
    created = [row["created_at"] for row in client.get("/api/v1/rentals").json()]
    assert created == sorted(created, reverse=True)


# --- stay browse: offset pages need a unique final sort key -------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("sort", ["newest", "price_asc", "price_desc", "rating_desc"])
def test_every_stay_sort_ends_in_id(sort: str) -> None:
    # Rows created in the same instant (a bulk import) would otherwise swap places between
    # requests, so one offset page could repeat a stay and the next could skip one.
    query = public_properties(sort=sort).query
    assert query.order_by[-1] == "-id"
