"""BE-07 — Operations must be able to revoke, release and recover, safely.

`REVOKED` existed only as a `PartnerOffer.Status` value that group compensation wrote in
bulk. There was no way for an Operations agent to revoke one offer, free one Partner's
held slot, or push one stuck unit back into dispatch — and therefore no authorization,
no replay protection and no audit trail on any of it.

These are consequential commands: revoking an offer takes work away from a Partner who
may already be driving to it. So each one is scoped to Operations, guarded by the unit's
version so a stale console cannot act on a decision it never saw, replayable exactly once
under a stable key, and evidenced by an immutable audit row naming the actor and reason.
"""

from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.foundation.models import IdempotencyRecord
from apps.identity.models import Role, User, UserRole
from tests.assignments.test_group_dispatch import _checkout, _partner_client, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _partner,
    _plan,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"
# A revoke leaves the revoked offer in place and creates exactly one successor offer.
OFFER_COUNT_AFTER_ONE_REVOKE = 2


def _dispatch(*, phone: str, key: str) -> tuple[FulfilmentUnit, PartnerOffer]:
    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug="switch-socket-repair", cart_version=cart_version)
    plans = _plan(client, address_id=address.json()["id"], cart_version=int(item["version"]))
    quote = _quote(client, plans["plans"][0]["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    unit = FulfilmentUnit.objects.get(booking_group=group)
    return unit, PartnerOffer.objects.select_related("partner").get(fulfilment_unit=unit)


def _operations_client(*, phone: str) -> APIClient:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return force_role_client(user=user, role_code="operations")


def _revoke(
    client: APIClient, offer: PartnerOffer, *, version: int, key: str
) -> tuple[int, dict[str, Any]]:
    response = client.post(
        f"/api/v1/operations/offers/{offer.id}/revoke/",
        {
            "expected_unit_version": version,
            "reason": DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
            "note": "No answer on three calls.",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    return response.status_code, response.json()


def test_revoking_a_live_offer_frees_the_unit_and_writes_one_audit_row() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="90", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="91", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke")
    client = _operations_client(phone="+919812340090")

    status_code, body = _revoke(client, offer, version=unit.version, key="revoke-once")

    assert status_code == HTTPStatus.OK
    assert body["status"] == PartnerOffer.Status.REVOKED
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.REVOKED
    # The unit is not abandoned: dispatch moves to the next candidate.
    successor = PartnerOffer.objects.exclude(id=offer.id).get(fulfilment_unit=unit)
    assert successor.partner_id != offer.partner_id
    audit = DispatchCommandAudit.objects.get(fulfilment_unit=unit)
    assert audit.command == DispatchCommandAudit.Command.REVOKE_OFFER
    assert audit.reason == DispatchCommandAudit.Reason.PARTNER_UNREACHABLE
    assert audit.offer_id == offer.id
    assert audit.before_state["offer_status"] == PartnerOffer.Status.OFFERED
    assert audit.after_state["offer_status"] == PartnerOffer.Status.REVOKED


def test_replaying_a_revoke_under_the_same_key_audits_exactly_once() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="92", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="93", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-replay")
    client = _operations_client(phone="+919812340092")

    first_status, first_body = _revoke(client, offer, version=unit.version, key="revoke-key")
    replay_status, replay_body = _revoke(client, offer, version=unit.version, key="revoke-key")

    assert first_status == replay_status == HTTPStatus.OK
    assert first_body["status"] == replay_body["status"] == PartnerOffer.Status.REVOKED
    assert DispatchCommandAudit.objects.count() == 1
    assert PartnerOffer.objects.filter(fulfilment_unit=unit).count() == OFFER_COUNT_AFTER_ONE_REVOKE


def test_a_stale_unit_version_refuses_the_revoke_and_publishes_the_current_one() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="94", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-stale")
    client = _operations_client(phone="+919812340094")

    status_code, body = _revoke(client, offer, version=unit.version + 5, key="stale-key")

    assert status_code == HTTPStatus.CONFLICT
    assert body["error"]["code"] == "dispatch_version_conflict"
    assert body["error"]["details"]["current_version"] == unit.version
    assert body["error"]["retryable"] is True
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not DispatchCommandAudit.objects.exists()
    # A refused command must not burn its key: nothing happened, so a retry is allowed.
    assert not IdempotencyRecord.objects.filter(key="stale-key").exists()


def test_a_partner_session_cannot_revoke_its_own_offer() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="95", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-authz")

    response = _partner_client(offer.partner).post(
        f"/api/v1/operations/offers/{offer.id}/revoke/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
            "note": "",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="partner-revoke",
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not DispatchCommandAudit.objects.exists()


def test_releasing_a_held_reservation_returns_the_unit_to_matching() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="96", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="97", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="release")
    accepted = _partner_client(offer.partner).post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="release-accept",
    )
    assert accepted.status_code == HTTPStatus.OK
    reservation = Reservation.objects.get(fulfilment_unit=unit)
    unit.refresh_from_db()
    client = _operations_client(phone="+919812340096")

    response = client.post(
        f"/api/v1/operations/reservations/{reservation.id}/release/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.SAFETY_CONCERN,
            "note": "Reported unsafe site.",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="release-once",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == Reservation.Status.RELEASED
    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.REVOKED
    unit.refresh_from_db()
    assert unit.status == FulfilmentUnit.Status.MATCHING
    assert DispatchCommandAudit.objects.get().command == (
        DispatchCommandAudit.Command.RELEASE_RESERVATION
    )


def test_releasing_a_payment_pending_hold_compensates_the_whole_group() -> None:
    """All-or-nothing is the Booking Group's contract, and a release cannot break it.

    Once the group is `PAYMENT_PENDING` every unit is held and the Customer has been asked
    to pay. Freeing one unit's capacity and leaving the rest held would sell the Customer a
    booking that can no longer be delivered, so the release compensates the group to
    `REPLAN_REQUIRED` instead of silently producing a partial one.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="98", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="release-payment")
    accepted = _partner_client(offer.partner).post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="payment-accept",
    )
    assert accepted.status_code == HTTPStatus.OK
    PartnerOffer.objects.filter(id=offer.id).update(
        undo_deadline=timezone.now() - timedelta(seconds=1)
    )
    committed = _partner_client(offer.partner).post(
        f"/api/v1/partner/offers/{offer.id}/commit/",
        HTTP_IDEMPOTENCY_KEY="payment-commit",
    )
    assert committed.status_code == HTTPStatus.OK
    reservation = Reservation.objects.get(fulfilment_unit=unit)
    unit.refresh_from_db()

    response = _operations_client(phone="+919812340098").post(
        f"/api/v1/operations/reservations/{reservation.id}/release/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.SAFETY_CONCERN,
            "note": "",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="payment-release",
    )

    assert response.status_code == HTTPStatus.OK
    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    group = BookingGroup.objects.get(units=unit)
    assert group.status == BookingGroup.Status.REPLAN_REQUIRED


def test_recovering_a_unit_with_a_lapsed_offer_re_dispatches_it() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="99", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="100", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="recover")
    # A lapsed offer with no sweep behind it is exactly the stuck state Operations is
    # called about: the Partner never answered and the unit is holding no one.
    PartnerOffer.objects.filter(id=offer.id).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    unit.refresh_from_db()

    response = _operations_client(phone="+919812340099").post(
        f"/api/v1/operations/fulfilment-units/{unit.id}/recover/",
        {
            "expected_unit_version": unit.version,
            "reason": DispatchCommandAudit.Reason.STUCK_DISPATCH,
            "note": "",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="recover-once",
    )

    assert response.status_code == HTTPStatus.OK
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.EXPIRED
    successor = PartnerOffer.objects.exclude(id=offer.id).get(fulfilment_unit=unit)
    assert successor.status == PartnerOffer.Status.OFFERED
    assert response.json()["live_offer_id"] == str(successor.id)
    audit = DispatchCommandAudit.objects.get()
    assert audit.command == DispatchCommandAudit.Command.RECOVER_UNIT
    assert audit.reason == DispatchCommandAudit.Reason.STUCK_DISPATCH


def test_an_audit_row_cannot_be_rewritten() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="101", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="102", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="immutable")
    client = _operations_client(phone="+919812340101")
    status_code, _body = _revoke(client, offer, version=unit.version, key="immutable-key")
    assert status_code == HTTPStatus.OK

    audit = DispatchCommandAudit.objects.get()
    audit.note = "rewritten"

    with pytest.raises(ValueError, match="immutable"):
        audit.save(update_fields=("note",))
