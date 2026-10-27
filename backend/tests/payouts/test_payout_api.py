"""The payout HTTP surface and the reconciliation sweep.

Two things only exist once there is a door: the reads Operations actually works from, and the
sweep that settles what the provider was unsure about. The domain rules underneath are covered
in `test_ledger_and_payout.py` and `test_payout_submission.py`.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole
from apps.payouts.models import (
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.services import (
    reserve_entry_for_batch,
    settle_booking_earning,
    submit_payout_item,
)
from apps.payouts.tasks import reconcile_payouts
from tests.fulfilment.conftest import BookedGroup, create_booked_group
from tests.helpers import force_role_client
from tests.payouts.test_ledger_and_payout import _deliver

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Reaches en route and arrival through shared helpers for a visit booked for tomorrow; the
    # clock gates on those steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]


def _user() -> User:
    return User.objects.create_user(phone_number=f"+919{uuid.uuid4().int % 10**9:09d}")


def _operations_client() -> tuple[APIClient, User]:
    user = _user()
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations"), user


def _partner_client(booked: BookedGroup) -> APIClient:
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=booked.partner.user, role=role, revoked_at=None)
    return force_role_client(user=booked.partner.user, role_code="partner")


def _earning(key: str) -> tuple[BookedGroup, PartnerLedgerEntry]:
    booked = create_booked_group(key_prefix=key)
    _deliver(booked, key=key)
    entry = settle_booking_earning(booking_id=booked.booking.id)
    assert entry is not None
    return booked, entry


def _verified_account(booked: BookedGroup) -> PartnerPayoutAccount:
    return PartnerPayoutAccount.objects.create(
        partner=booked.partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        provider_fund_account_id="fa_test",
        account_last4="4321",
        holder_name="Test Partner",
        verified_at=timezone.now(),
        effective_from=timezone.now() - timedelta(hours=1),
    )


def _batch(actor: User, reference: str, status: str = PayoutBatch.Status.APPROVED) -> PayoutBatch:
    return PayoutBatch.objects.create(
        reference=reference,
        status=status,
        period_start=timezone.now() - timedelta(days=7),
        period_end=timezone.now() + timedelta(days=1),
        proposed_by=actor,
    )


# --------------------------------------------------------------------------------------------
# Partner reads
# --------------------------------------------------------------------------------------------


def test_a_partner_ledger_page_carries_the_calculation_behind_each_line() -> None:
    """A Partner is entitled to see why they were paid what they were paid. Hiding it turns
    every payment question into a support ticket."""

    booked, entry = _earning("api-ledger")
    client = _partner_client(booked)

    body = client.get("/api/v1/partner/ledger/").json()

    assert set(body) >= {"next", "previous", "results"}
    row = next(item for item in body["results"] if item["id"] == str(entry.id))
    assert row["net_paise"] == entry.net_paise
    assert row["calculation_snapshot"]["settled_gross_paise"] == entry.gross_paise


def test_a_partner_with_no_payout_account_is_told_so_rather_than_shown_an_error() -> None:
    booked = create_booked_group(key_prefix="api-noaccount")
    client = _partner_client(booked)

    response = client.get("/api/v1/partner/payout-account/")

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_a_payout_account_publishes_when_it_becomes_usable() -> None:
    """`effective_from` is the honest explanation for why a freshly added account has not been
    paid into. Without it, a verified account with no money reads as a bug."""

    booked = create_booked_group(key_prefix="api-cooling")
    PartnerPayoutAccount.objects.create(
        partner=booked.partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        account_last4="9999",
        holder_name="Test Partner",
        verified_at=timezone.now(),
        effective_from=timezone.now() + timedelta(hours=24),
    )
    client = _partner_client(booked)

    body = client.get("/api/v1/partner/payout-account/").json()

    assert body["account_last4"] == "9999"
    assert body["is_payable_now"] is False
    assert body["effective_from"]


def test_the_masked_account_never_carries_a_full_number() -> None:
    booked = create_booked_group(key_prefix="api-masked")
    _verified_account(booked)
    client = _partner_client(booked)

    body = client.get("/api/v1/partner/payout-account/").json()

    assert body["account_last4"] == "4321"
    assert "account_number" not in body
    assert "provider_fund_account_id" not in body


# --------------------------------------------------------------------------------------------
# Operations reads and commands
# --------------------------------------------------------------------------------------------


def test_proposing_a_batch_sweeps_eligible_entries() -> None:
    booked, _entry = _earning("api-propose")
    _verified_account(booked)
    client, _actor = _operations_client()

    response = client.post(
        "/api/v1/operations/payout-batches/",
        {
            "reference": f"api-run-{uuid.uuid4().hex[:8]}",
            "period_start": (timezone.now() - timedelta(days=7)).isoformat(),
            "period_end": (timezone.now() + timedelta(days=1)).isoformat(),
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"propose-{uuid.uuid4()}",
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    body = response.json()
    assert body["status"] == PayoutBatch.Status.PENDING_APPROVAL
    assert body["item_count"] >= 1
    assert body["total_paise"] > 0


def test_the_batch_list_is_an_envelope_and_omits_items() -> None:
    """A run can hold hundreds of payouts, and a list of runs is not where anybody reads them."""

    client, actor = _operations_client()
    _batch(actor, f"api-list-{uuid.uuid4().hex[:8]}")

    body = client.get("/api/v1/operations/payout-batches/").json()

    assert set(body) >= {"next", "previous", "results"}
    assert body["results"]
    assert "items" not in body["results"][0]
    assert "item_count" in body["results"][0]


def test_unpayable_partners_are_reported_rather_than_silently_skipped() -> None:
    """A Partner left out of a run with no explanation is a support ticket waiting to happen."""

    booked, _entry = _earning("api-unpayable")
    client, _actor = _operations_client()

    body = client.get(
        "/api/v1/operations/unpayable-partners/",
        {
            "period_start": (timezone.now() - timedelta(days=7)).isoformat(),
            "period_end": (timezone.now() + timedelta(days=1)).isoformat(),
        },
    ).json()

    assert str(booked.partner.id) in body["partner_ids"]


def test_unpayable_partners_requires_a_period() -> None:
    client, _actor = _operations_client()

    response = client.get("/api/v1/operations/unpayable-partners/")

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_a_ledger_adjustment_without_a_step_up_is_refused() -> None:
    """An adjustment moves what a Partner is owed, so it carries the same gate as approval."""

    booked, entry = _earning("api-adjust")
    client, _actor = _operations_client()

    response = client.post(
        "/api/v1/operations/ledger-adjustments/",
        {
            "partner_id": str(booked.partner.id),
            "net_paise": -5000,
            "reason": "Correcting an overpayment.",
            "corrects_id": str(entry.id),
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"adjust-{uuid.uuid4()}",
    )

    assert response.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)
    assert not PartnerLedgerEntry.objects.filter(kind=PartnerLedgerEntry.Kind.REVERSAL).exists()


def test_a_batch_detail_lists_its_items() -> None:
    booked, entry = _earning("api-detail")
    _verified_account(booked)
    client, actor = _operations_client()
    batch = _batch(actor, f"api-detail-{uuid.uuid4().hex[:8]}")
    reserve_entry_for_batch(batch=batch, entry=entry)

    body = client.get(f"/api/v1/operations/payout-batches/{batch.id}/").json()

    assert body["item_count"] == 1
    assert body["items"][0]["ledger_entry_id"] == str(entry.id)
    assert body["items"][0]["status"] == PayoutBatchItem.Status.RESERVED
    assert body["server_now"]


def test_an_unknown_batch_is_a_not_found_rather_than_a_crash() -> None:
    client, _actor = _operations_client()

    response = client.get(f"/api/v1/operations/payout-batches/{uuid.uuid4()}/")

    assert response.status_code == HTTPStatus.NOT_FOUND


# --------------------------------------------------------------------------------------------
# Reconciliation sweep
# --------------------------------------------------------------------------------------------


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_the_sweep_settles_a_submitted_payout() -> None:
    booked, entry = _earning("api-sweep")
    _verified_account(booked)
    _actor = _user()
    batch = _batch(_actor, f"api-sweep-{uuid.uuid4().hex[:8]}")
    item = reserve_entry_for_batch(batch=batch, entry=entry)
    submit_payout_item(item_id=item.id)

    settled = reconcile_payouts()

    assert settled >= 1
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.PAID
    entry.refresh_from_db()
    assert entry.status == PartnerLedgerEntry.Status.PAID


@override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
def test_the_sweep_does_nothing_when_there_is_nothing_in_flight() -> None:
    """No provider call at all — the sweep must not wake a payout API up for an empty table."""

    assert reconcile_payouts() == 0
