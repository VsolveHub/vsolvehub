"""Automatic post-payment Partner replacement.

The manual path already worked: Operations names a replacement, the offer commits, and
`recover_booking_partner` rewrites the Booking. What did not exist was anything that *starts*
that search on its own, anything that keeps trying after the first candidate says no, and any
outcome at all when nobody can be found.

The retry is where the existing engine actually breaks. `decline_or_undo_unit_offer` sets the
unit to `MATCHING` before chaining to the next candidate, and `_create_offer` then asks
`_blocks_offer_action` — which, on a `BOOKED` group, only lets a unit through when it still
looks like a recovery. One decline and the chain goes silent.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from psycopg.types.range import Range

from apps.assignments.group_services import (
    accept_unit_offer,
    commit_unit_offer,
    decline_or_undo_unit_offer,
)
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import FulfilmentUnit
from apps.commerce.models import Booking
from apps.fulfilment.recovery_services import (
    adopt_replacement_reservation,
    release_booking_partner,
    start_partner_recovery_offer,
)
from apps.partners.models import PartnerProfile
from tests.carts.test_fulfilment_planning import _partner
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

DEFAULT_SLUG = "switch-socket-repair"
_partner_counter = iter(range(6000, 9000))


def _replacement_partner() -> PartnerProfile:
    return _partner(suffix=f"{next(_partner_counter):04d}", variant_slugs=(DEFAULT_SLUG,))


def _released(key_prefix: str) -> BookedGroup:
    """A paid, booked visit whose Partner has just stepped back."""

    booked = create_booked_group(key_prefix=key_prefix)
    release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Something came up.",
        expected_version=booked.booking.version,
    )
    return booked


def test_a_declined_replacement_offer_still_reaches_the_next_candidate() -> None:
    """The retry chain the automatic search depends on.

    `decline_or_undo_unit_offer` already chains to the next candidate — but only if the unit
    still reads as a recovery when `_create_offer` checks. It sets `MATCHING` first, so it
    does not, and the replacement search dies after one refusal with nothing to show for it.
    """

    booked = _released("decline-chain")
    unit = booked.unit
    first = _replacement_partner()
    _second = _replacement_partner()
    offer = start_partner_recovery_offer(unit_id=unit.id, partner_id=first.id)

    decline_or_undo_unit_offer(offer_id=offer.id, partner=first, undo=False)

    assert PartnerOffer.objects.filter(
        fulfilment_unit=unit,
        status=PartnerOffer.Status.OFFERED,
    ).exists()


def test_a_unit_awaiting_recovery_keeps_saying_so_while_a_replacement_is_courted() -> None:
    """The unit's status is a projection of its Booking's, and must not drift off it.

    A replacement accepting writes `HELD`, declining writes `MATCHING`. Both describe a
    pre-payment unit looking for its first Partner, which this is not — and both make the
    next pass stop recognising the recovery.
    """

    booked = _released("recovery-projection")
    unit = booked.unit
    partner = _replacement_partner()
    offer = start_partner_recovery_offer(unit_id=unit.id, partner_id=partner.id)

    decline_or_undo_unit_offer(offer_id=offer.id, partner=partner, undo=False)

    unit.refresh_from_db()
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.RECOVERY_REQUIRED
    assert unit.status == FulfilmentUnit.Status.RECOVERY_REQUIRED


def test_a_directly_assigned_replacement_becomes_the_bookings_partner() -> None:
    """The advance route has no offer to hand over.

    `directly_assign` locks a Partner in and returns a `Reservation`; there is no accept or
    commit step to hang the Booking rewrite off, so the reservation itself has to be adoptable.
    """

    booked = _released("adopt-reservation")
    unit = booked.unit
    replacement = _replacement_partner()
    reservation = Reservation.objects.create(
        fulfilment_unit=unit,
        partner=replacement,
        occupied_range=Range(
            unit.requested_start,
            unit.requested_start + timedelta(minutes=unit.estimated_duration_minutes + 30),
            "[)",
        ),
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    recovered = adopt_replacement_reservation(
        booking_id=booked.booking.id, reservation_id=reservation.id
    )

    assert recovered.status == Booking.Status.CONFIRMED
    assert recovered.partner_id == replacement.id
    assert recovered.reservation_id == reservation.id
    reservation.refresh_from_db()
    # Confirmed, not left tentative: the money was captured at checkout, so there is no
    # payment window left for this hold to expire against.
    assert reservation.status == Reservation.Status.CONFIRMED
    unit.refresh_from_db()
    assert unit.status == FulfilmentUnit.Status.BOOKED


def test_adopting_the_same_reservation_twice_is_the_same_booking() -> None:
    booked = _released("adopt-replay")
    unit = booked.unit
    replacement = _replacement_partner()
    reservation = Reservation.objects.create(
        fulfilment_unit=unit,
        partner=replacement,
        occupied_range=Range(
            unit.requested_start,
            unit.requested_start + timedelta(minutes=unit.estimated_duration_minutes + 30),
            "[)",
        ),
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    first = adopt_replacement_reservation(
        booking_id=booked.booking.id, reservation_id=reservation.id
    )
    second = adopt_replacement_reservation(
        booking_id=booked.booking.id, reservation_id=reservation.id
    )

    assert first.id == second.id
    assert second.status == Booking.Status.CONFIRMED


def test_a_committed_replacement_offer_confirms_the_booking_on_its_own() -> None:
    """Nobody is left to press the second button.

    The manual flow worked because Operations called `recover_booking_partner` themselves after
    committing the offer. An automatic search has no operator, so committing has to be what
    finishes the recovery.
    """

    booked = _released("commit-finishes")
    unit = booked.unit
    replacement = _replacement_partner()
    offer = start_partner_recovery_offer(unit_id=unit.id, partner_id=replacement.id)
    accepted = accept_unit_offer(offer_id=offer.id, partner=replacement)
    accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
    accepted.save(update_fields=("undo_deadline",))

    commit_unit_offer(offer_id=accepted.id, partner=replacement)

    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.CONFIRMED
    assert booked.booking.partner_id == replacement.id
    unit.refresh_from_db()
    assert unit.status == FulfilmentUnit.Status.BOOKED


def test_release_leaves_the_booking_awaiting_recovery() -> None:
    """Guards the fixture itself, so a failure above is never a setup artefact."""

    booked = _released("release-baseline")
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.RECOVERY_REQUIRED
    assert timezone.now() - booked.booking.updated_at < timedelta(minutes=1)
