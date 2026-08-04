"""Proposal 0009 — the Partner offer command must be retry-safe, typed and honest.

Accept, decline, undo and commit are the only commands a Partner uses to take or refuse
work, and they run on a phone, on mobile data, in someone's stairwell. A lost response is
the ordinary case, not the edge case. These tests hold the four things that makes true:

* one logical command runs once, no matter how many times its request arrives;
* a replay answers with the offer's current truth instead of a state-guard refusal;
* a key sent with a different command is a client bug and is refused as one;
* losing a slot to a concurrent reservation is reported as a loss, not as an expiry.

Every test runs against PostgreSQL, because the reservation race is decided by a
PostgreSQL exclusion constraint and nothing weaker can stand in for it.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from http import HTTPStatus
from threading import Barrier
from typing import Any

import pytest
from django.core.management import call_command
from django.db import IntegrityError, close_old_connections, connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.assignments.models import AssignmentAttempt, PartnerOffer, Reservation
from apps.carts.models import BookingGroup
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

FIRST_CUSTOMER = "+919876543210"
SECOND_CUSTOMER = "+919876543211"
EXPECTED_SUCCESSOR_OFFERS = 2
CONCURRENT_ACCEPTS = 2


def _live_offer(*, phone: str, key: str, slug: str = "switch-socket-repair") -> PartnerOffer:
    """Run one Customer from empty cart to dispatch and return the offer it produced."""
    customer = User.objects.create_user(phone_number=phone)
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    item = _add_item(client, slug=slug, cart_version=cart_version)
    plans = _plan(client, address_id=address.json()["id"], cart_version=int(item["version"]))
    quote = _quote(client, plans["plans"][0]["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    return PartnerOffer.objects.select_related("partner", "fulfilment_unit").get(
        fulfilment_unit__booking_group=group
    )


def _command(
    client: APIClient, offer: PartnerOffer, action: str, *, key: str
) -> tuple[int, dict[str, Any]]:
    response = client.post(
        f"/api/v1/partner/offers/{offer.id}/{action}/",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    return response.status_code, response.json()


def _error_code(body: dict[str, Any]) -> str:
    return str(body["error"]["code"])


def test_same_key_accept_replay_creates_exactly_one_reservation() -> None:
    """The proposal's core case: the Partner won the job, the response was lost."""
    call_command("seed_technician_catalog")
    partner = _partner(suffix="51", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="accept-replay")
    client = _partner_client(partner)

    first_status, first_body = _command(client, offer, "accept", key="accept-once")
    replay_status, replay_body = _command(client, offer, "accept", key="accept-once")

    assert first_status == replay_status == HTTPStatus.OK
    assert first_body["status"] == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    assert replay_body["status"] == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    assert replay_body["id"] == first_body["id"] == str(offer.id)
    assert replay_body["undo_deadline"] == first_body["undo_deadline"]
    assert Reservation.objects.filter(fulfilment_unit=offer.fulfilment_unit).count() == 1
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.ACCEPTED_PENDING_UNDO


def test_replay_answers_with_a_freshly_measured_server_instant() -> None:
    """A replay must not hand back a frozen clock.

    The undo window is 120 seconds. Replaying the stored response body would republish
    the `server_now` of the original request, and a client that calibrates from it would
    believe it has more of that window left than it does.
    """
    call_command("seed_technician_catalog")
    partner = _partner(suffix="52", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="fresh-instant")
    client = _partner_client(partner)

    _status, first = _command(client, offer, "accept", key="fresh-instant-accept")
    _replay_status, replay = _command(client, offer, "accept", key="fresh-instant-accept")

    first_now = parse_datetime(first["server_now"])
    replay_now = parse_datetime(replay["server_now"])
    assert first_now is not None
    assert replay_now is not None
    assert replay_now >= first_now
    undo_deadline = parse_datetime(replay["undo_deadline"])
    assert undo_deadline is not None
    assert replay_now < undo_deadline


def test_lost_response_recovery_returns_authoritative_truth_where_a_new_key_refuses() -> None:
    """The whole point of the proposal, stated as a contrast.

    Under the retried key the Partner is told they hold the job. Under a fresh key —
    which is what a client inventing its own retry would send — the state guard answers
    that the offer is gone. Both are the same offer at the same instant.
    """
    call_command("seed_technician_catalog")
    partner = _partner(suffix="53", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="lost-response")
    client = _partner_client(partner)

    _first_status, _first_body = _command(client, offer, "accept", key="lost-response-accept")
    recovered_status, recovered = _command(client, offer, "accept", key="lost-response-accept")
    reinvented_status, reinvented = _command(client, offer, "accept", key="a-different-key")

    assert recovered_status == HTTPStatus.OK
    assert recovered["status"] == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    assert recovered["undo_deadline"] is not None
    assert reinvented_status == HTTPStatus.BAD_REQUEST
    assert _error_code(reinvented) == "offer_invalid"
    assert Reservation.objects.filter(fulfilment_unit=offer.fulfilment_unit).count() == 1


def test_reusing_a_key_for_another_action_is_refused() -> None:
    call_command("seed_technician_catalog")
    partner = _partner(suffix="54", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="key-reuse")
    client = _partner_client(partner)

    accepted_status, _accepted = _command(client, offer, "accept", key="one-key")
    reused_status, reused = _command(client, offer, "undo", key="one-key")

    assert accepted_status == HTTPStatus.OK
    assert reused_status == HTTPStatus.CONFLICT
    assert _error_code(reused) == "idempotency_key_reused"
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    assert Reservation.objects.filter(status=Reservation.Status.TENTATIVE).count() == 1


def test_reusing_a_key_for_another_offer_is_refused() -> None:
    call_command("seed_technician_catalog")
    partner = _partner(suffix="55", variant_slugs=("switch-socket-repair",))
    first = _live_offer(phone=FIRST_CUSTOMER, key="reuse-first")
    second = _live_offer(phone=SECOND_CUSTOMER, key="reuse-second")
    assert first.partner_id == second.partner_id == partner.id
    client = _partner_client(partner)

    accepted_status, _accepted = _command(client, first, "accept", key="shared-key")
    reused_status, reused = _command(client, second, "accept", key="shared-key")

    assert accepted_status == HTTPStatus.OK
    assert reused_status == HTTPStatus.CONFLICT
    assert _error_code(reused) == "idempotency_key_reused"
    second.refresh_from_db()
    assert second.status == PartnerOffer.Status.OFFERED


def test_an_unfinished_command_reports_itself_as_in_progress() -> None:
    """A record left `PROCESSING` is what a crashed or still-running command looks like.

    The row is written by the server itself, then reset — so the fingerprint under test
    is the one the view actually produces, not one the test reconstructed.
    """
    call_command("seed_technician_catalog")
    partner = _partner(suffix="56", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="in-progress")
    client = _partner_client(partner)

    accepted_status, _accepted = _command(client, offer, "accept", key="in-flight")
    IdempotencyRecord.objects.filter(key="in-flight").update(
        status=IdempotencyRecord.Status.PROCESSING,
        response_status=None,
        response_body=None,
        completed_at=None,
    )
    retried_status, retried = _command(client, offer, "accept", key="in-flight")

    assert accepted_status == HTTPStatus.OK
    assert retried_status == HTTPStatus.CONFLICT
    assert _error_code(retried) == "idempotency_in_progress"
    assert retried["error"]["retryable"] is True
    assert Reservation.objects.filter(fulfilment_unit=offer.fulfilment_unit).count() == 1


def test_the_command_requires_an_idempotency_key() -> None:
    call_command("seed_technician_catalog")
    partner = _partner(suffix="57", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="missing-key")
    client = _partner_client(partner)

    response = client.post(f"/api/v1/partner/offers/{offer.id}/accept/")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    details = response.json()["error"]["details"]
    assert details["Idempotency-Key"]["code"] == "idempotency_key_required"
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not Reservation.objects.exists()


def test_an_action_outside_the_closed_set_is_refused_before_any_transition() -> None:
    call_command("seed_technician_catalog")
    partner = _partner(suffix="58", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="unknown-action")
    client = _partner_client(partner)

    status_code, body = _command(client, offer, "acccept", key="typo-key")

    assert status_code == HTTPStatus.BAD_REQUEST
    assert body["error"]["details"]["action"]["code"] == "offer_action_invalid"
    assert not IdempotencyRecord.objects.filter(key="typo-key").exists()
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED


def test_a_partner_cannot_command_another_partners_offer() -> None:
    call_command("seed_technician_catalog")
    candidates = [
        _partner(suffix="59", variant_slugs=("switch-socket-repair",)),
        _partner(suffix="60", variant_slugs=("switch-socket-repair",)),
    ]
    offer = _live_offer(phone=FIRST_CUSTOMER, key="authorization")
    # Candidate order is by Partner UUID, so which of the two holds the offer is not
    # fixed; the intruder is simply whichever one does not.
    intruder = next(item for item in candidates if item.id != offer.partner_id)

    status_code, _body = _command(_partner_client(intruder), offer, "accept", key="intruder-key")

    assert status_code == HTTPStatus.NOT_FOUND
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not Reservation.objects.exists()
    assert not IdempotencyRecord.objects.filter(key="intruder-key").exists()


def test_a_session_without_the_partner_role_is_denied() -> None:
    call_command("seed_technician_catalog")
    partner = _partner(suffix="61", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="permission")
    outsider = APIClient()
    outsider.force_authenticate(User.objects.get(phone_number=FIRST_CUSTOMER))

    response = outsider.post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="outsider-key",
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert _error_code(response.json()) == "permission_denied"
    assert offer.partner_id == partner.id
    assert not Reservation.objects.exists()


def test_duplicate_decline_replay_does_not_advance_dispatch_twice() -> None:
    call_command("seed_technician_catalog")
    first = _partner(suffix="62", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="63", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="decline-replay")
    client = _partner_client(offer.partner)

    declined_status, declined = _command(client, offer, "decline", key="decline-once")
    replay_status, replay = _command(client, offer, "decline", key="decline-once")

    assert declined_status == replay_status == HTTPStatus.OK
    assert declined["status"] == replay["status"] == PartnerOffer.Status.DECLINED
    assert declined["id"] == replay["id"] == str(offer.id)
    offer.refresh_from_db()
    successors = PartnerOffer.objects.filter(fulfilment_unit=offer.fulfilment_unit)
    assert successors.count() == EXPECTED_SUCCESSOR_OFFERS
    assert (
        AssignmentAttempt.objects.filter(fulfilment_unit=offer.fulfilment_unit).count()
        == EXPECTED_SUCCESSOR_OFFERS
    )
    assert successors.exclude(id=offer.id).get().partner_id != first.id
    assert not Reservation.objects.exists()


def test_duplicate_undo_replay_releases_exactly_one_reservation() -> None:
    call_command("seed_technician_catalog")
    _first = _partner(suffix="64", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="65", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="undo-replay")
    client = _partner_client(offer.partner)
    accepted_status, _accepted = _command(client, offer, "accept", key="undo-accept")
    assert accepted_status == HTTPStatus.OK

    undone_status, undone = _command(client, offer, "undo", key="undo-once")
    reservation = Reservation.objects.get(fulfilment_unit=offer.fulfilment_unit)
    released_at = reservation.released_at
    replay_status, replay = _command(client, offer, "undo", key="undo-once")

    assert undone_status == replay_status == HTTPStatus.OK
    assert undone["status"] == replay["status"] == PartnerOffer.Status.UNDONE
    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    assert reservation.released_at == released_at
    assert Reservation.objects.count() == 1
    assert (
        PartnerOffer.objects.filter(fulfilment_unit=offer.fulfilment_unit).count()
        == EXPECTED_SUCCESSOR_OFFERS
    )


def test_duplicate_commit_replay_does_not_extend_the_payment_hold_twice() -> None:
    call_command("seed_technician_catalog")
    _committing = _partner(suffix="66", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="commit-replay")
    client = _partner_client(offer.partner)
    accepted_status, _accepted = _command(client, offer, "accept", key="commit-accept")
    assert accepted_status == HTTPStatus.OK
    # The undo window has to have closed before a commit is legitimate; Celery owns this
    # deadline in production, so the test moves it rather than waiting two minutes.
    PartnerOffer.objects.filter(id=offer.id).update(
        undo_deadline=timezone.now() - timedelta(seconds=1)
    )

    committed_status, committed = _command(client, offer, "commit", key="commit-once")
    reservation = Reservation.objects.get(fulfilment_unit=offer.fulfilment_unit)
    committed_expiry = reservation.expires_at
    replay_status, replay = _command(client, offer, "commit", key="commit-once")

    assert committed_status == replay_status == HTTPStatus.OK
    assert committed["status"] == replay["status"] == PartnerOffer.Status.COMMITTED
    reservation.refresh_from_db()
    assert reservation.expires_at == committed_expiry
    assert Reservation.objects.count() == 1


def test_a_reservation_conflict_is_not_reported_as_an_expiry() -> None:
    """Two live offers, one Partner, one overlapping slot — the second is a real loss."""
    call_command("seed_technician_catalog")
    partner = _partner(suffix="67", variant_slugs=("switch-socket-repair",))
    first = _live_offer(phone=FIRST_CUSTOMER, key="conflict-first")
    second = _live_offer(phone=SECOND_CUSTOMER, key="conflict-second")
    assert first.partner_id == second.partner_id == partner.id
    assert first.fulfilment_unit is not None
    assert second.fulfilment_unit is not None
    assert first.fulfilment_unit.requested_start == second.fulfilment_unit.requested_start
    client = _partner_client(partner)

    won_status, _won = _command(client, first, "accept", key="conflict-win")
    lost_status, lost = _command(client, second, "accept", key="conflict-lose")

    assert won_status == HTTPStatus.OK
    assert lost_status == HTTPStatus.CONFLICT
    assert _error_code(lost) == "offer_reservation_conflict"
    assert lost["error"]["retryable"] is False
    assert Reservation.objects.count() == 1
    second.refresh_from_db()
    assert second.status == PartnerOffer.Status.OFFERED
    # The refused command must not burn its key: nothing happened, so a retry is allowed.
    assert not IdempotencyRecord.objects.filter(key="conflict-lose").exists()


def test_a_second_partner_can_never_hold_a_live_offer_for_the_same_unit() -> None:
    """Why the reservation race is contested by commands, not by rival Partners.

    Proposal 0009 frames the race as "two Partners accept offers for the same slot".
    The schema forbids that arrangement outright: a Fulfilment Unit carries at most one
    live offer, so no second Partner is ever in a position to accept it. Capacity in this
    model belongs to a Partner, so the reachable race is two concurrent commands
    contesting one Partner's calendar — which is what the concurrency test exercises.
    """
    call_command("seed_technician_catalog")
    _holder = _partner(suffix="68", variant_slugs=("switch-socket-repair",))
    rival = _partner(suffix="69", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="single-live-offer")

    with pytest.raises(IntegrityError), transaction.atomic():
        PartnerOffer.objects.create(
            fulfilment_unit=offer.fulfilment_unit,
            partner=rival,
            attempt=AssignmentAttempt.objects.create(
                fulfilment_unit=offer.fulfilment_unit,
                candidate=rival,
                rank=2,
                eligibility_snapshot={},
            ),
            expires_at=offer.expires_at,
        )


def test_concurrent_accepts_for_one_partner_capacity_produce_one_winner() -> None:
    """The real race, run through the HTTP command on two connections.

    Both requests pass the availability check before either commits, so nothing in
    application code can decide this. The PostgreSQL exclusion constraint does, and the
    loser must be told it lost a slot rather than that its offer expired.
    """
    call_command("seed_technician_catalog")
    partner = _partner(suffix="70", variant_slugs=("switch-socket-repair",))
    first = _live_offer(phone=FIRST_CUSTOMER, key="race-first")
    second = _live_offer(phone=SECOND_CUSTOMER, key="race-second")
    assert first.partner_id == second.partner_id == partner.id
    clients = [_partner_client(partner) for _index in range(CONCURRENT_ACCEPTS)]
    barrier = Barrier(CONCURRENT_ACCEPTS)

    def accept(client: APIClient, offer: PartnerOffer, key: str) -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            status_code, _body = _command(client, offer, "accept", key=key)
            return status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=CONCURRENT_ACCEPTS) as executor:
        futures = [
            executor.submit(accept, clients[0], first, "race-key-first"),
            executor.submit(accept, clients[1], second, "race-key-second"),
        ]
        outcomes = sorted(future.result(timeout=30) for future in futures)

    assert outcomes == [HTTPStatus.OK, HTTPStatus.CONFLICT]
    assert Reservation.objects.count() == 1
    accepted = PartnerOffer.objects.filter(status=PartnerOffer.Status.ACCEPTED_PENDING_UNDO)
    assert accepted.count() == 1
    assert PartnerOffer.objects.filter(status=PartnerOffer.Status.OFFERED).count() == 1


def test_the_loser_of_a_concurrent_accept_is_told_it_lost_a_slot() -> None:
    """The status code alone is not the contract; the code the Partner surface reads is."""
    call_command("seed_technician_catalog")
    partner = _partner(suffix="71", variant_slugs=("switch-socket-repair",))
    first = _live_offer(phone=FIRST_CUSTOMER, key="loser-first")
    second = _live_offer(phone=SECOND_CUSTOMER, key="loser-second")
    clients = [_partner_client(partner) for _index in range(CONCURRENT_ACCEPTS)]
    barrier = Barrier(CONCURRENT_ACCEPTS)

    def accept(client: APIClient, offer: PartnerOffer, key: str) -> tuple[int, dict[str, Any]]:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return _command(client, offer, "accept", key=key)
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=CONCURRENT_ACCEPTS) as executor:
        futures = [
            executor.submit(accept, clients[0], first, "loser-key-first"),
            executor.submit(accept, clients[1], second, "loser-key-second"),
        ]
        results = [future.result(timeout=30) for future in futures]

    losses = [body for status_code, body in results if status_code == HTTPStatus.CONFLICT]
    assert len(losses) == 1
    assert _error_code(losses[0]) == "offer_reservation_conflict"
    assert (
        losses[0]["error"]["message"] == "That appointment was just reserved by another Customer."
    )


def test_a_partner_role_without_a_partner_profile_is_denied() -> None:
    """A Partner-role session with no Partner profile is a permission failure, not a 400."""
    call_command("seed_technician_catalog")
    _partner(suffix="72", variant_slugs=("switch-socket-repair",))
    offer = _live_offer(phone=FIRST_CUSTOMER, key="no-profile")
    role = Role.objects.get(code="partner")
    profileless = User.objects.create_user(phone_number="+919876549999")
    UserRole.objects.create(user=profileless, role=role)

    response = force_role_client(user=profileless, role_code="partner").post(
        f"/api/v1/partner/offers/{offer.id}/accept/",
        HTTP_IDEMPOTENCY_KEY="no-profile-key",
    )

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert _error_code(response.json()) == "permission_denied"
    assert not Reservation.objects.exists()
