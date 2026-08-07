"""BE-3: the cross-visit conflict check must occupy time the way reservations do.

`_has_cross_visit_conflict` answers "can the eligible pool cover every visit at
once?" — but it only decides that correctly if it agrees with the rest of the system
about how long a Partner is *occupied* for. `_eligible_partner_ids`,
`accept_unit_offer`, `directly_assign` and the `Reservation` exclusion constraint all
widen a visit by `M1_TURNAROUND_MINUTES`. This check did not, so two exactly
back-to-back visits read as non-overlapping, the plan was accepted, and the
reservation collided at accept time behind "another professional has accepted".

Pure-function tests: `_has_cross_visit_conflict` takes plain tuples and touches no
database, so fabricating its input is both honest and the fastest way to pin the
boundary precisely.
"""

from datetime import datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from django.conf import settings

from apps.carts.planning import UnitInput, _has_cross_visit_conflict

ZONE = ZoneInfo("Asia/Kolkata")
BASE = datetime(2026, 8, 10, 17, 0, tzinfo=ZONE)
SOLE_PARTNER: tuple[UUID, ...] = (uuid4(),)
TWO_PARTNERS: tuple[UUID, ...] = (uuid4(), uuid4())


def _unit(*, starts_at: datetime, duration: int, eligible: tuple[UUID, ...]) -> UnitInput:
    """One planner unit input. Only fields 1, 2 and 5 are read by the check."""

    return ((), starts_at, duration, 0, 0, eligible)


def test_back_to_back_visits_conflict_for_a_sole_eligible_partner() -> None:
    """Unit B starts exactly when unit A's *duration* ends — inside the turnaround.

    A occupies 17:00-17:40 plus turnaround; B starts at 17:40. Only one Partner can
    do either, and they cannot travel in zero minutes, so this is a conflict.
    """

    units = [
        _unit(starts_at=BASE, duration=40, eligible=SOLE_PARTNER),
        _unit(starts_at=BASE + timedelta(minutes=40), duration=60, eligible=SOLE_PARTNER),
    ]

    assert _has_cross_visit_conflict(units) is True


def test_gap_shorter_than_the_turnaround_still_conflicts() -> None:
    gap = settings.M1_TURNAROUND_MINUTES - 1
    units = [
        _unit(starts_at=BASE, duration=40, eligible=SOLE_PARTNER),
        _unit(starts_at=BASE + timedelta(minutes=40 + gap), duration=60, eligible=SOLE_PARTNER),
    ]

    assert _has_cross_visit_conflict(units) is True


def test_gap_of_exactly_the_turnaround_does_not_conflict() -> None:
    """The boundary, held from the other side.

    Reservation ranges are half-open, matching the exclusion constraint: a visit
    beginning exactly when the previous one's occupied range ends is not an overlap.
    Getting this wrong in the conservative direction would turn the check into "any
    two same-day visits conflict" and refuse plans that staff perfectly well.
    """

    units = [
        _unit(starts_at=BASE, duration=40, eligible=SOLE_PARTNER),
        _unit(
            starts_at=BASE + timedelta(minutes=40 + settings.M1_TURNAROUND_MINUTES),
            duration=60,
            eligible=SOLE_PARTNER,
        ),
    ]

    assert _has_cross_visit_conflict(units) is False


def test_well_separated_visits_do_not_conflict() -> None:
    units = [
        _unit(starts_at=BASE, duration=40, eligible=SOLE_PARTNER),
        _unit(starts_at=BASE + timedelta(hours=5), duration=60, eligible=SOLE_PARTNER),
    ]

    assert _has_cross_visit_conflict(units) is False


def test_back_to_back_visits_are_fine_when_two_partners_are_eligible() -> None:
    """The check is about the *pool*, not about the clock alone."""

    units = [
        _unit(starts_at=BASE, duration=40, eligible=TWO_PARTNERS),
        _unit(starts_at=BASE + timedelta(minutes=40), duration=60, eligible=TWO_PARTNERS),
    ]

    assert _has_cross_visit_conflict(units) is False


def test_three_visits_form_a_clique_only_once_turnaround_is_counted() -> None:
    """Hall's condition on a clique the turnaround creates but bare durations do not.

    Occupied (30 + 20 turnaround): 17:00-17:50, 17:30-18:20, 17:45-18:35 — all three
    pairwise overlapping, so three units need three Partners and only two exist.
    On bare durations 17:00-17:30 and 17:30-18:00 do not overlap at all, there is no
    three-clique, and the old check waved this plan through.
    """

    units = [
        _unit(starts_at=BASE, duration=30, eligible=TWO_PARTNERS),
        _unit(starts_at=BASE + timedelta(minutes=30), duration=30, eligible=TWO_PARTNERS),
        _unit(starts_at=BASE + timedelta(minutes=45), duration=30, eligible=TWO_PARTNERS),
    ]

    assert _has_cross_visit_conflict(units) is True
