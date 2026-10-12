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
from tests.rental.test_cancel_booking import _booked, rental_world  # noqa: F401

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
