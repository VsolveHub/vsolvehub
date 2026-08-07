"""BE-2: what a compensated Booking Group must leave behind — nothing live.

The board framed this as "undo of one visit must not destroy its siblings". Against
the code that framing does not hold: `FulfilmentPlan.ConfirmationPolicy` has exactly
one member, `ALL_OR_NOTHING`, and `_sync_group_state` only reaches `PAYMENT_PENDING`
once *every* unit is Partner-committed. Under that policy a group with one
unstaffable visit genuinely cannot proceed, so compensating it is correct — and the
sibling-safe variant would strand the group at `PARTIALLY_HELD`, holding a Partner's
capacity until `expires_at` and then compensating it anyway.

What *was* broken is what compensation left behind. It released the reservations and
failed the units, but revoked only `OFFERED` and `ACCEPTED_PENDING_UNDO` offers — so
a `COMMITTED` sibling offer survived, still visible in the Partner's inbox (the list
does not filter `COMMITTED`), pointing at a released reservation and a failed unit.
And nothing told any of those Partners their work was gone, though
`partner.job_cancelled` has been a declared transactional purpose the whole time.

Fixed inside `_compensate_group`, so it holds at all four call sites: both branches
of `_create_offer`, and both in `directly_assign`.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.management import call_command
from django.db import transaction
from django.utils import timezone
from freezegun import freeze_time

from apps.assignments.group_services import (
    _compensate_group,
    accept_unit_offer,
    commit_unit_offer,
    decline_or_undo_unit_offer,
)
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.notifications.models import NotificationIntent
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer
from tests.assignments.test_group_dispatch import _partner_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"
CANCELLED_PURPOSE = "partner.job_cancelled"


def _live_offers(group: BookingGroup) -> list[PartnerOffer]:
    return list(
        PartnerOffer.objects.filter(
            fulfilment_unit__booking_group=group,
            status__in=(
                PartnerOffer.Status.OFFERED,
                PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
                PartnerOffer.Status.COMMITTED,
            ),
        )
    )


def _live_reservations(group: BookingGroup) -> list[Reservation]:
    return list(
        Reservation.objects.filter(
            fulfilment_unit__booking_group=group,
            status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
        )
    )


@freeze_time(FROZEN_NOW)
def test_compensation_leaves_no_committed_offer_behind() -> None:
    """The defect: a COMMITTED offer outliving the booking it was for.

    Undo is the route in. The sole qualified Partner accepts and commits, then undoes
    a later offer; redispatch finds nobody (they are excluded as ALREADY_ATTEMPTED
    for that unit, correctly — they just refused it), so the group is compensated.
    """

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="91", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-committed")
    group = offer.fulfilment_unit.booking_group
    accept_unit_offer(offer_id=offer.id, partner=partner)
    commit_unit_offer(offer_id=offer.id, partner=partner)
    assert PartnerOffer.objects.get(id=offer.id).status == PartnerOffer.Status.COMMITTED

    # Drive the group terminal the way a real dead-end does.
    group.refresh_from_db()
    # `_compensate_group` takes row locks; production only ever calls it from
    # inside an atomic block, so the test does too.
    with transaction.atomic():
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)

    group.refresh_from_db()
    assert group.status == BookingGroup.Status.REPLAN_REQUIRED
    assert _live_offers(group) == []
    assert _live_reservations(group) == []
    assert PartnerOffer.objects.get(id=offer.id).status == PartnerOffer.Status.REVOKED


@freeze_time(FROZEN_NOW)
def test_a_revoked_committed_offer_disappears_from_the_partner_inbox() -> None:
    """The user-visible half. COMMITTED is not filtered by the list endpoint, so
    before this fix the Partner kept seeing a job that no longer existed."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="92", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-inbox")
    group = offer.fulfilment_unit.booking_group
    accept_unit_offer(offer_id=offer.id, partner=partner)
    commit_unit_offer(offer_id=offer.id, partner=partner)
    client = _partner_client(partner)
    assert [row["id"] for row in client.get("/api/v1/partner/offers/").json()["results"]] == [
        str(offer.id)
    ]

    group.refresh_from_db()
    # `_compensate_group` takes row locks; production only ever calls it from
    # inside an atomic block, so the test does too.
    with transaction.atomic():
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)

    inbox = client.get("/api/v1/partner/offers/")
    assert inbox.status_code == HTTPStatus.OK
    assert inbox.json()["results"] == []


@freeze_time(FROZEN_NOW)
def test_a_partner_who_loses_committed_work_is_told() -> None:
    """`partner.job_cancelled` was a declared transactional purpose nothing ever fired."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="93", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-notified")
    unit = offer.fulfilment_unit
    group = unit.booking_group
    accept_unit_offer(offer_id=offer.id, partner=partner)

    group.refresh_from_db()
    # `_compensate_group` takes row locks; production only ever calls it from
    # inside an atomic block, so the test does too.
    with transaction.atomic():
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)

    intents = list(
        NotificationIntent.objects.filter(
            purpose=CANCELLED_PURPOSE,
            recipient_id=partner.user_id,
        )
    )
    assert len(intents) == 1
    assert intents[0].context == {
        "fulfilment_unit_id": str(unit.id),
        "requested_start": unit.requested_start.isoformat(),
        "reason": BookingGroup.Status.REPLAN_REQUIRED,
    }


@freeze_time(FROZEN_NOW)
def test_a_merely_offered_partner_is_not_told_their_job_was_cancelled() -> None:
    """They never took it. Telling them it was cancelled would be a lie."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="94", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-offered-only")
    group = offer.fulfilment_unit.booking_group
    assert offer.status == PartnerOffer.Status.OFFERED

    group.refresh_from_db()
    # `_compensate_group` takes row locks; production only ever calls it from
    # inside an atomic block, so the test does too.
    with transaction.atomic():
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)

    assert not NotificationIntent.objects.filter(
        purpose=CANCELLED_PURPOSE,
        recipient_id=partner.user_id,
    ).exists()
    # The offer is still revoked — it just does not come with a lie attached.
    assert PartnerOffer.objects.get(id=offer.id).status == PartnerOffer.Status.REVOKED


@freeze_time(FROZEN_NOW)
def test_undo_redispatches_to_a_second_partner_without_compensating() -> None:
    """The board's second acceptance criterion: the non-buggy path must not regress.

    With another qualified Partner available, undo redispatches to them and the group
    stays alive. Nothing here is compensated, and nobody is told a job was cancelled.
    """

    call_command("seed_technician_catalog")
    first = online_partner(suffix="95", variant_slugs=("switch-socket-repair",))
    second = online_partner(suffix="96", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-redispatch")
    group = offer.fulfilment_unit.booking_group
    offered_to = offer.partner
    other = second if offered_to == first else first
    accept_unit_offer(offer_id=offer.id, partner=offered_to)

    successor = decline_or_undo_unit_offer(offer_id=offer.id, partner=offered_to, undo=True)

    assert successor is not None
    assert successor.partner == other
    assert successor.status == PartnerOffer.Status.OFFERED
    group.refresh_from_db()
    assert group.status not in (
        BookingGroup.Status.REPLAN_REQUIRED,
        BookingGroup.Status.FAILED,
    )
    assert not NotificationIntent.objects.filter(purpose=CANCELLED_PURPOSE).exists()


@freeze_time(FROZEN_NOW)
def test_a_sole_partner_undo_still_compensates_the_group() -> None:
    """The board's third acceptance criterion, and the decision recorded.

    With nobody left to offer the unit to, the group cannot be fulfilled — and under
    `ALL_OR_NOTHING`, which is the only confirmation policy that exists, that means
    the booking cannot proceed. Compensation is the correct outcome, not the bug.
    What changed is that it now leaves nothing live behind and tells the Partner.
    """

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="97", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-sole")
    group = offer.fulfilment_unit.booking_group
    accept_unit_offer(offer_id=offer.id, partner=partner)

    successor = decline_or_undo_unit_offer(offer_id=offer.id, partner=partner, undo=True)

    assert successor is None
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.REPLAN_REQUIRED
    assert _live_offers(group) == []
    assert _live_reservations(group) == []
    assert all(unit.status == FulfilmentUnit.Status.FAILED for unit in group.units.all())


@freeze_time(FROZEN_NOW)
def test_compensation_is_idempotent_for_the_notification() -> None:
    """Compensation runs once per group, but the key makes a second call harmless."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="98", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="cascade-idempotent")
    group = offer.fulfilment_unit.booking_group
    accept_unit_offer(offer_id=offer.id, partner=partner)

    group.refresh_from_db()
    # `_compensate_group` takes row locks; production only ever calls it from
    # inside an atomic block, so the test does too.
    with transaction.atomic():
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)
    # A second pass finds no live reservations, so it notifies nobody a second time.
    with transaction.atomic():
        _compensate_group(group, terminal_status=BookingGroup.Status.REPLAN_REQUIRED)

    assert (
        NotificationIntent.objects.filter(
            purpose=CANCELLED_PURPOSE,
            recipient_id=partner.user_id,
        ).count()
        == 1
    )
    assert timezone.now() - FROZEN_NOW < timedelta(seconds=1)
