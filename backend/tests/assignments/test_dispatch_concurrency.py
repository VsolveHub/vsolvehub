"""BE-07 — the races that decide dispatch, run against real PostgreSQL.

Nothing in this file is mocked. Each test opens two real connections and lets the
database arbitrate, because every one of these outcomes is decided by a lock, an
exclusion constraint or a transaction boundary — and a mock would only prove that the
test author's mental model is self-consistent.

Coverage note: the race "two partners accept the same unit simultaneously" is already
proven in `tests/assignments/test_partner_offer_commands.py` by
`test_a_second_partner_can_never_hold_a_live_offer_for_the_same_unit` (the schema forbids
two live offers per unit) and `test_concurrent_accepts_for_one_partner_capacity_produce_one_winner`
(the reachable race, decided by the GiST exclusion constraint). It is not duplicated here.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from http import HTTPStatus
from threading import Barrier, Event
from typing import Any

import pytest
from django.core.management import call_command
from django.db import close_old_connections, connection, connections, transaction
from django.utils import timezone

from apps.assignments.group_services import reconcile_group_dispatch
from apps.assignments.models import DispatchCommandAudit, PartnerOffer, Reservation
from apps.assignments.recovery_services import revoke_unit_offer
from apps.carts.models import BookingGroup
from apps.foundation.models import IdempotencyRecord
from apps.identity.models import Role, User, UserRole
from tests.assignments.test_dispatch_recovery_commands import _dispatch, _operations_client
from tests.assignments.test_group_dispatch import _partner_client
from tests.carts.test_fulfilment_planning import _partner

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"
RACERS = 2


def _operations_user_id(*, phone: str) -> Any:
    role, _created = Role.objects.get_or_create(
        code="operations",
        defaults={"name": "Operations", "is_system": True},
    )
    user = User.objects.create_user(phone_number=phone)
    UserRole.objects.create(user=user, role=role)
    return user.id


def test_a_revoke_and_an_accept_cannot_both_win_the_same_offer() -> None:
    """One offer, two commands, opposite intents, no application-level ordering.

    Both take `SELECT … FOR UPDATE` on the offer row, so PostgreSQL serialises them. What
    must never exist is the interleaving where the accept's reservation survives a revoke:
    a Partner holding capacity on an offer Operations withdrew.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="110", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="111", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="revoke-race")
    partner_client = _partner_client(offer.partner)
    operations_client = _operations_client(phone="+919812340110")
    barrier = Barrier(RACERS)

    def accept() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return partner_client.post(
                f"/api/v1/partner/offers/{offer.id}/accept/",
                HTTP_IDEMPOTENCY_KEY="race-accept",
            ).status_code
        finally:
            connections.close_all()

    def revoke() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return operations_client.post(
                f"/api/v1/operations/offers/{offer.id}/revoke/",
                {
                    "expected_unit_version": unit.version,
                    "reason": DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
                    "note": "",
                },
                format="json",
                HTTP_IDEMPOTENCY_KEY="race-revoke",
            ).status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=RACERS) as executor:
        outcomes = [
            future.result(timeout=30)
            for future in (executor.submit(accept), executor.submit(revoke))
        ]

    offer.refresh_from_db()
    assert HTTPStatus.OK in outcomes
    if offer.status == PartnerOffer.Status.REVOKED:
        # A revoked offer never leaves a live reservation behind.
        assert not Reservation.objects.filter(
            fulfilment_unit=unit,
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        ).exists()
    else:
        assert offer.status == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
        assert Reservation.objects.filter(fulfilment_unit=unit).count() == 1
    # Whichever lost, the audit records only commands that actually committed.
    assert DispatchCommandAudit.objects.count() <= 1


def test_an_accept_landing_exactly_as_the_offer_expires_resolves_one_way() -> None:
    """The 45-second boundary, contested rather than assumed.

    The offer expires at this instant and the reconcile sweep is running at this instant.
    Either outcome is correct; an accepted-and-expired offer, or a reservation with no
    accepted offer behind it, is not.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="112", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="113", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="expiry-race")
    group_id = unit.booking_group_id
    PartnerOffer.objects.filter(id=offer.id).update(expires_at=timezone.now())
    partner_client = _partner_client(offer.partner)
    barrier = Barrier(RACERS)

    def accept() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return partner_client.post(
                f"/api/v1/partner/offers/{offer.id}/accept/",
                HTTP_IDEMPOTENCY_KEY="expiry-accept",
            ).status_code
        finally:
            connections.close_all()

    def sweep() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            reconcile_group_dispatch(group_id=group_id)
            return 0
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=RACERS) as executor:
        for future in (executor.submit(accept), executor.submit(sweep)):
            future.result(timeout=30)

    offer.refresh_from_db()
    assert offer.status in (
        PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
        PartnerOffer.Status.EXPIRED,
    )
    reservations = Reservation.objects.filter(fulfilment_unit=unit)
    if offer.status == PartnerOffer.Status.EXPIRED:
        assert not reservations.filter(
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED)
        ).exists()
    else:
        assert reservations.count() == 1
    # At most one live offer for the unit, whichever way it went.
    assert (
        PartnerOffer.objects.filter(
            fulfilment_unit=unit,
            status__in=(
                PartnerOffer.Status.OFFERED,
                PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
            ),
        ).count()
        <= 1
    )


def test_a_payment_hold_release_and_the_expiry_sweep_do_not_double_release() -> None:
    """Two paths to freeing the same capacity, run at once.

    Operations releasing a payment-pending hold and the reconcile sweep finding that hold
    expired both end in a released reservation and a compensated group. Running together
    they must still release exactly once — a second `released_at` would mean the hold was
    freed twice and the group compensated on top of an already-compensated group.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="114", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="hold-race")
    group_id = unit.booking_group_id
    partner_client = _partner_client(offer.partner)
    assert (
        partner_client.post(
            f"/api/v1/partner/offers/{offer.id}/accept/",
            HTTP_IDEMPOTENCY_KEY="hold-accept",
        ).status_code
        == HTTPStatus.OK
    )
    PartnerOffer.objects.filter(id=offer.id).update(
        undo_deadline=timezone.now() - timedelta(seconds=1)
    )
    assert (
        partner_client.post(
            f"/api/v1/partner/offers/{offer.id}/commit/",
            HTTP_IDEMPOTENCY_KEY="hold-commit",
        ).status_code
        == HTTPStatus.OK
    )
    reservation = Reservation.objects.get(fulfilment_unit=unit)
    Reservation.objects.filter(id=reservation.id).update(expires_at=timezone.now())
    unit.refresh_from_db()
    operations_client = _operations_client(phone="+919812340114")
    barrier = Barrier(RACERS)

    def release() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            return operations_client.post(
                f"/api/v1/operations/reservations/{reservation.id}/release/",
                {
                    "expected_unit_version": unit.version,
                    "reason": DispatchCommandAudit.Reason.SAFETY_CONCERN,
                    "note": "",
                },
                format="json",
                HTTP_IDEMPOTENCY_KEY="hold-release",
            ).status_code
        finally:
            connections.close_all()

    def sweep() -> int:
        close_old_connections()
        try:
            barrier.wait(timeout=15)
            reconcile_group_dispatch(group_id=group_id)
            return 0
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=RACERS) as executor:
        for future in (executor.submit(release), executor.submit(sweep)):
            future.result(timeout=30)

    reservation.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    assert Reservation.objects.filter(fulfilment_unit=unit).count() == 1
    group = BookingGroup.objects.get(id=group_id)
    assert group.status in (
        BookingGroup.Status.REPLAN_REQUIRED,
        BookingGroup.Status.EXPIRED,
    )
    assert DispatchCommandAudit.objects.count() <= 1


def test_a_worker_killed_mid_command_commits_nothing_and_burns_no_key() -> None:
    """A real backend termination, not a raised exception standing in for one.

    The command does all of its writes, then the process holding the transaction is
    killed by PostgreSQL before `COMMIT`. Nothing may survive: not the revoked offer, not
    the audit row, and not a `COMPLETED` idempotency record — a burnt key would mean a
    retry replays a success that never happened.
    """
    call_command("seed_technician_catalog")
    _first = _partner(suffix="115", variant_slugs=("switch-socket-repair",))
    _second = _partner(suffix="116", variant_slugs=("switch-socket-repair",))
    unit, offer = _dispatch(phone=CUSTOMER, key="crash")
    actor_id = _operations_user_id(phone="+919812340115")
    ready = Event()
    killed = Event()
    backend_pids: list[int] = []

    def dying_worker() -> None:
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                row = cursor.fetchone()
                assert row is not None
                backend_pids.append(int(row[0]))
            try:
                with transaction.atomic():
                    revoke_unit_offer(
                        actor=User.objects.get(id=actor_id),
                        offer_id=offer.id,
                        expected_unit_version=unit.version,
                        reason=DispatchCommandAudit.Reason.PARTNER_UNREACHABLE,
                        note="",
                        idempotency_key="crash-key",
                    )
                    ready.set()
                    # Hold the transaction open, uncommitted, until the backend is killed.
                    killed.wait(timeout=20)
            except Exception:  # noqa: S110 - the backend death itself is the assertion
                pass
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(dying_worker)
        assert ready.wait(timeout=20)
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_terminate_backend(%s)", [backend_pids[0]])
        killed.set()
        future.result(timeout=30)

    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.OFFERED
    assert not DispatchCommandAudit.objects.exists()
    assert not IdempotencyRecord.objects.filter(
        key="crash-key",
        status=IdempotencyRecord.Status.COMPLETED,
    ).exists()
    assert PartnerOffer.objects.filter(fulfilment_unit=unit).count() == 1
