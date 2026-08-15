"""Limits, guards and lock helpers shared by the unit-scoped and group-wide commands.

The boundary: nothing here decides an outcome. These are the input guards a caller's `reason`
and `idempotency_key` must survive before either command writes, and the two read helpers that
map locked `Booking` rows back onto their Fulfilment Units. Both cancellation and reschedule
import from this module; this module imports from no sibling, so the arrows stay one-way.
"""

from collections.abc import Iterable
from uuid import UUID

from apps.carts.models import FulfilmentUnit
from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError

#: Matches `commerce.Booking.cancellation_reason`'s column width. Checked at the command
#: boundary so an over-long reason is a typed refusal, not a `DataError` from the driver —
#: `tests/fulfilment/test_group_cancellation.py` fails if the two ever drift apart.
MAX_CANCELLATION_REASON_CHARS = 240

#: What a caller's group-cancellation key may be, so the derived per-unit key still fits.
#:
#: `cancel_booked_group` appends `":{unit.id}"` — a colon plus a 36-character UUID — before the
#: key reaches `commerce.Refund.idempotency_key`, which is `max_length=128`. Without this guard a
#: 92-character caller key is a `DataError` raised by the driver mid-transaction rather than a
#: typed refusal the client can act on, and `_retry_key` can add a few characters more on top.
_UNIT_KEY_SUFFIX_CHARS = 1 + 36 + 4  # colon, UUID, and room for a retry suffix
MAX_GROUP_IDEMPOTENCY_KEY_CHARS = 128 - _UNIT_KEY_SUFFIX_CHARS


def _guard_cancellation_reason(reason: str) -> None:
    if len(reason) > MAX_CANCELLATION_REASON_CHARS:
        raise BookingCommandInvalidApiError(
            reason=(
                f"A cancellation reason cannot be longer than "
                f"{MAX_CANCELLATION_REASON_CHARS} characters."
            )
        )


def _guard_group_idempotency_key(idempotency_key: str) -> None:
    if len(idempotency_key) > MAX_GROUP_IDEMPOTENCY_KEY_CHARS:
        raise BookingCommandInvalidApiError(
            reason=(
                f"An idempotency key for a group cancellation cannot be longer than "
                f"{MAX_GROUP_IDEMPOTENCY_KEY_CHARS} characters."
            )
        )


def _by_unit_id(bookings: Iterable[Booking]) -> dict[UUID, Booking]:
    """`Booking.fulfilment_unit` is nullable in the schema (the legacy Checkout-scoped path left
    it unset), so a Booking that is not attached to a unit is skipped rather than assumed."""

    return {
        booking.fulfilment_unit_id: booking
        for booking in bookings
        if booking.fulfilment_unit_id is not None
    }


def _locked_group_bookings(units: list[FulfilmentUnit]) -> dict[UUID, Booking]:
    """`FulfilmentUnit.booking` is a nullable reverse one-to-one, so it can never be joined into
    the unit lock — PostgreSQL refuses `FOR UPDATE` on the nullable side of an outer join. Lock
    the Booking rows in their own inner-join-safe statement instead."""

    return _by_unit_id(
        Booking.objects.select_for_update()
        .select_related("customer")
        .filter(fulfilment_unit__in=units)
        # Ordered by the Booking's own column, not through a join: a deterministic lock
        # acquisition order without dragging a second table into the `FOR UPDATE`.
        .order_by("id")
    )
