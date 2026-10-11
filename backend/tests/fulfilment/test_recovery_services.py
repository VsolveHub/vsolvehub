"""Partner release and post-booking recovery: `create_manual_unit_offer` reoffers the
`RECOVERY_REQUIRED` unit to a replacement Partner, and `recover_booking_partner` rewrites the
*same* Booking row in place once that replacement's offer commits."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.assignments.group_services import accept_unit_offer, commit_unit_offer
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking
from apps.fulfilment.cancellation import cancel_booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.recovery_services import (
    recover_booking_partner,
    release_booking_partner,
    start_partner_recovery_offer,
)
from apps.fulfilment.serializers import OperationsBookingSerializer
from apps.fulfilment.services import (
    BookingVersionConflictApiError,
    mark_arrived,
    mark_en_route,
)
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from tests.carts.test_fulfilment_planning import _partner
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

_operator_counter = iter(range(1, 10_000))
_partner_counter = iter(range(1, 10_000))


def _operator() -> User:
    return User.objects.create_user(phone_number=f"+91984{next(_operator_counter):07d}")


def _replacement_partner(slug: str) -> PartnerProfile:
    return _partner(suffix=f"{next(_partner_counter):04d}", variant_slugs=(slug,))


def _committed_replacement_offer(*, unit_id, partner: PartnerProfile) -> PartnerOffer:
    """Drive a manual offer all the way to `COMMITTED`, the same way Operations would: the
    replacement Partner accepts, then (once the undo window has passed) the offer commits."""

    offer = start_partner_recovery_offer(unit_id=unit_id, partner_id=partner.id)
    accepted = accept_unit_offer(offer_id=offer.id, partner=partner)
    accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
    accepted.save(update_fields=("undo_deadline",))
    return commit_unit_offer(offer_id=accepted.id, partner=partner)


# --- release_booking_partner -------------------------------------------------------------------


def test_release_booking_partner_moves_confirmed_to_recovery_required() -> None:
    booked = create_booked_group(key_prefix="release-happy")
    booking = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="I can no longer make this slot.",
        expected_version=booked.booking.version,
    )
    assert booking.status == Booking.Status.RECOVERY_REQUIRED
    booked.unit.refresh_from_db()
    assert booked.unit.status == FulfilmentUnit.Status.RECOVERY_REQUIRED
    reservation = Reservation.objects.get(id=booked.booking.reservation_id)
    assert reservation.status == Reservation.Status.RELEASED


def test_release_booking_partner_frees_the_time_slot_for_a_replacement() -> None:
    booked = create_booked_group(key_prefix="release-frees-slot")
    release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Vehicle broke down.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    offer = start_partner_recovery_offer(unit_id=booked.unit.id, partner_id=replacement.id)
    assert offer.status == PartnerOffer.Status.OFFERED
    assert offer.fulfilment_unit_id == booked.unit.id


def test_release_booking_partner_by_another_partner_is_refused() -> None:
    booked = create_booked_group(key_prefix="release-wrong-partner")
    other = create_booked_group(slugs=("tap-repair",), key_prefix="release-wrong-partner-other")
    with pytest.raises(PermissionError):
        release_booking_partner(
            booking_id=booked.booking.id,
            partner_id=other.partner.id,
            reason="Not my job.",
            expected_version=booked.booking.version,
        )


def test_release_booking_partner_requires_a_reason() -> None:
    booked = create_booked_group(key_prefix="release-blank-reason")
    with pytest.raises(BookingCommandInvalidApiError):
        release_booking_partner(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            reason="   ",
            expected_version=booked.booking.version,
        )


def test_release_booking_partner_en_route_and_arrived_are_also_releasable() -> None:
    booked = create_booked_group(key_prefix="release-en-route")
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    released = release_booking_partner(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        reason="Medical emergency on site.",
        expected_version=booking.version,
    )
    assert released.status == Booking.Status.RECOVERY_REQUIRED


def test_release_booking_partner_wrong_version_is_a_typed_conflict() -> None:
    booked = create_booked_group(key_prefix="release-version-conflict")
    with pytest.raises(BookingVersionConflictApiError):
        release_booking_partner(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            reason="Cannot make it.",
            expected_version=booked.booking.version + 1,
        )


def test_release_booking_partner_replay_is_idempotent() -> None:
    booked = create_booked_group(key_prefix="release-replay")
    first = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Cannot make it.",
        expected_version=booked.booking.version,
    )
    second = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Cannot make it.",
        expected_version=first.version,
    )
    assert second.status == Booking.Status.RECOVERY_REQUIRED
    assert second.version == first.version


def test_release_booking_partner_from_a_non_releasable_status_is_refused() -> None:
    booked = create_booked_group(key_prefix="release-not-releasable")
    cancel_booking(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
        reason="Changed my mind.",
    )
    booked.booking.refresh_from_db()
    with pytest.raises(BookingCommandInvalidApiError):
        release_booking_partner(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            reason="Too late, already cancelled.",
            expected_version=booked.booking.version,
        )


def test_release_booking_partner_replay_ignores_the_original_reason_and_version() -> None:
    """A second `release_booking_partner` call for an already-`RECOVERY_REQUIRED` Booking is a
    pure idempotent replay: it returns the authoritative result without re-validating the reason
    or the caller's now-stale version, exactly like offer accept/decline (BE-07)."""

    booked = create_booked_group(key_prefix="release-replay-stale")
    first = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Cannot make it.",
        expected_version=booked.booking.version,
    )
    second = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="   ",
        expected_version=first.version + 5,
    )
    assert second.version == first.version


# --- start_partner_recovery_offer ----------------------------------------------------------------


def test_start_partner_recovery_offer_names_a_specific_replacement() -> None:
    booked = create_booked_group(key_prefix="offer-manual-pick")
    release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned to another job.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    offer = start_partner_recovery_offer(unit_id=booked.unit.id, partner_id=replacement.id)
    assert offer.partner_id == replacement.id
    assert offer.status == PartnerOffer.Status.OFFERED


def test_start_partner_recovery_offer_does_not_disturb_the_booked_group_status() -> None:
    booked = create_booked_group(key_prefix="offer-group-untouched")
    release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned to another job.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    start_partner_recovery_offer(unit_id=booked.unit.id, partner_id=replacement.id)
    booked.group.refresh_from_db()
    assert booked.group.status == BookingGroup.Status.BOOKED


# --- recover_booking_partner ---------------------------------------------------------------------


def test_recover_booking_partner_rewrites_the_booking_in_place() -> None:
    booked = create_booked_group(key_prefix="recover-happy")
    original_booking_id = booked.booking.id
    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    offer = _committed_replacement_offer(unit_id=booked.unit.id, partner=replacement)

    recovered = recover_booking_partner(
        booking_id=released.id,
        offer_id=offer.id,
        operator=_operator(),
        expected_version=released.version,
    )
    assert recovered.id == original_booking_id
    assert recovered.status == Booking.Status.CONFIRMED
    assert recovered.partner_id == replacement.id
    assert recovered.reservation_id == offer.reservation_id


def test_recover_booking_partner_replay_is_idempotent() -> None:
    booked = create_booked_group(key_prefix="recover-replay")
    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    offer = _committed_replacement_offer(unit_id=booked.unit.id, partner=replacement)

    first = recover_booking_partner(
        booking_id=released.id,
        offer_id=offer.id,
        operator=_operator(),
        expected_version=released.version,
    )
    second = recover_booking_partner(
        booking_id=released.id,
        offer_id=offer.id,
        operator=_operator(),
        expected_version=first.version,
    )
    assert second.version == first.version
    assert second.partner_id == first.partner_id


def test_recover_booking_partner_without_a_committed_offer_is_refused() -> None:
    booked = create_booked_group(key_prefix="recover-not-committed")
    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    offer = start_partner_recovery_offer(unit_id=booked.unit.id, partner_id=replacement.id)

    with pytest.raises(BookingCommandInvalidApiError):
        recover_booking_partner(
            booking_id=released.id,
            offer_id=offer.id,
            operator=_operator(),
            expected_version=released.version,
        )


def test_recover_booking_partner_from_a_non_recovery_required_booking_is_refused() -> None:
    booked = create_booked_group(key_prefix="recover-not-required")
    other = create_booked_group(slugs=("tap-repair",), key_prefix="recover-not-required-other")
    release_booking_partner(
        booking_id=other.booking.id,
        partner_id=other.partner.id,
        reason="Reassigned.",
        expected_version=other.booking.version,
    )
    replacement = _replacement_partner("tap-repair")
    other_offer = _committed_replacement_offer(unit_id=other.unit.id, partner=replacement)

    with pytest.raises(BookingCommandInvalidApiError):
        recover_booking_partner(
            booking_id=booked.booking.id,
            offer_id=other_offer.id,
            operator=_operator(),
            expected_version=booked.booking.version,
        )


def test_recover_booking_partner_offer_for_a_different_unit_is_refused() -> None:
    booked = create_booked_group(key_prefix="recover-wrong-unit")
    other = create_booked_group(slugs=("tap-repair",), key_prefix="recover-wrong-unit-other")
    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned.",
        expected_version=booked.booking.version,
    )
    release_booking_partner(
        booking_id=other.booking.id,
        partner_id=other.partner.id,
        reason="Reassigned.",
        expected_version=other.booking.version,
    )
    replacement = _replacement_partner("tap-repair")
    other_unit_offer = _committed_replacement_offer(unit_id=other.unit.id, partner=replacement)

    with pytest.raises(BookingCommandInvalidApiError):
        recover_booking_partner(
            booking_id=released.id,
            offer_id=other_unit_offer.id,
            operator=_operator(),
            expected_version=released.version,
        )


def test_recover_booking_partner_wrong_version_is_a_typed_conflict() -> None:
    booked = create_booked_group(key_prefix="recover-version-conflict")
    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    # Accepted, deliberately not committed. Committing is now what *finishes* a recovery — the
    # Booking is already CONFIRMED by the time a committed offer exists — so calling this
    # command afterwards is an idempotent no-op rather than a conflict. The version guard
    # still protects an operator acting on a stale view, which is what this asserts.
    offer = start_partner_recovery_offer(unit_id=booked.unit.id, partner_id=replacement.id)
    accept_unit_offer(offer_id=offer.id, partner=replacement)

    with pytest.raises(BookingVersionConflictApiError):
        recover_booking_partner(
            booking_id=released.id,
            offer_id=offer.id,
            operator=_operator(),
            expected_version=released.version + 1,
        )


def test_full_release_and_recovery_round_trip_keeps_one_booking_row() -> None:
    booked = create_booked_group(key_prefix="recover-round-trip")
    original_booking_id = booked.booking.id
    old_partner_id = booked.partner.id

    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=old_partner_id,
        reason="Personal emergency.",
        expected_version=booked.booking.version,
    )
    replacement = _replacement_partner("switch-socket-repair")
    offer = _committed_replacement_offer(unit_id=booked.unit.id, partner=replacement)
    recovered = recover_booking_partner(
        booking_id=original_booking_id,
        offer_id=offer.id,
        operator=_operator(),
        expected_version=released.version,
    )

    assert Booking.objects.filter(fulfilment_unit_id=booked.unit.id).count() == 1
    assert recovered.id == original_booking_id
    assert recovered.partner_id == replacement.id
    assert recovered.partner_id != old_partner_id
    assert recovered.status == Booking.Status.CONFIRMED


# --- OperationsBooking.replacement_offer_id ------------------------------------------------------


def test_ops_booking_names_the_committed_replacement_offer_only_while_recovery_is_needed() -> None:
    """The console offers "Confirm replacement" from this field instead of a pasted offer id."""
    booked = create_booked_group(key_prefix="recover-field")
    assert OperationsBookingSerializer(booked.booking).data["replacement_offer_id"] is None

    released = release_booking_partner(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        reason="Reassigned.",
        expected_version=booked.booking.version,
    )
    released.refresh_from_db()
    assert OperationsBookingSerializer(released).data["replacement_offer_id"] is None

    replacement = _replacement_partner("switch-socket-repair")
    offer = _committed_replacement_offer(unit_id=booked.unit.id, partner=replacement)
    released.refresh_from_db()
    assert OperationsBookingSerializer(released).data["replacement_offer_id"] == str(offer.id)

    recovered = recover_booking_partner(
        booking_id=released.id,
        offer_id=offer.id,
        operator=_operator(),
        expected_version=released.version,
    )
    assert OperationsBookingSerializer(recovered).data["replacement_offer_id"] is None
