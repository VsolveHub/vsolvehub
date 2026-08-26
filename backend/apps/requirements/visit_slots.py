"""Candidate visit start times for one invited vendor, and the token that books one.

**This module exists because a browser must never compute availability.** The Customer checkout
already ships that rule as code — `features/checkout/view/slots-modal.tsx` renders exactly what
`POST /booking/windows/` returns and decides nothing — and revision 3's A5 flow needs the same
thing on the Partner side: a vendor picks a real slot, on a real grid, and the server owns which
starts exist. Without this read, `confirm_visit_slot` is a write with nothing to write against.

Two things it deliberately reuses rather than reproduces:

* **The grid itself.** `carts.availability.load_snapshot` plus
  `carts.services.build_arrival_window_grid` are the same four queries and the same slot loop the
  A1 checkout runs. A second grid would drift from the first the day one of them was edited, which
  is a bug this codebase has already shipped once.
* **The reservation table.** A booked visit is an `assignments.Reservation`, so the exclusion
  constraint that already stops two A1 bookings overlapping stops a visit overlapping a booking.
  "A visit and an A1 job cannot double-book" is therefore a database fact, not a code convention.

The grid is narrowed to **one Partner** — the invited vendor — because the question a vendor asks
is "when can *I* go", and publishing the whole area's capacity to them would hand every vendor a
live map of their competitors' diaries.
"""

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from itertools import pairwise
from typing import Any
from uuid import UUID

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from apps.carts.availability import load_snapshot
from apps.carts.services import BookingWindows, build_arrival_window_grid
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.requirements.exceptions import (
    PolicyUnavailableError,
    RequirementNotFoundError,
    VisitSlotExpiredError,
    VisitSlotUnavailableError,
)
from apps.requirements.models import (
    CustomerRequirement,
    SiteVisit,
    VendorInvitation,
    VisitPlan,
    VisitPlanShare,
)

#: Signed-token salt and version, mirroring `carts.services.WINDOW_SIGNING_SALT`. The version is
#: checked on redemption so a token issued before a change in what it carries is refused rather
#: than read with a missing field.
VISIT_SLOT_SIGNING_SALT = "m2.visit-slot"
VISIT_SLOT_SIGNING_VERSION = 1
CUSTOMER_VISIT_SLOT_SIGNING_SALT = "m2.customer-visit-slot"
CUSTOMER_VISIT_SLOT_SIGNING_VERSION = 1


@dataclass(frozen=True, slots=True)
class VisitSlotChoice:
    """A decoded slot token: the start it promised and the width it was drawn at."""

    starts_at: datetime
    duration_minutes: int


def visit_duration_minutes(requirement: CustomerRequirement) -> int:
    """How long a plan visit occupies the vendor. Fails closed while the owner has not set it."""
    configuration = requirement.configuration
    minutes = configuration.visit_duration_minutes if configuration is not None else None
    if not minutes:
        raise PolicyUnavailableError(
            "We have not set how long a visit takes for this service yet. Support can help.",
        )
    return int(minutes)


def sign_visit_slot(*, invitation_id: UUID, starts_at: datetime, duration_minutes: int) -> str:
    """Bind a slot to the invitation it was drawn for.

    Scoped to the invitation rather than to the requirement so a vendor cannot redeem a slot the
    grid drew for a competitor, and signed at all so a vendor cannot book 3am on a day the area is
    closed by posting a timestamp the grid never offered.
    """
    return signing.dumps(
        {
            "v": VISIT_SLOT_SIGNING_VERSION,
            "invitation_id": str(invitation_id),
            "starts_at": starts_at.isoformat(),
            "duration_minutes": int(duration_minutes),
        },
        salt=VISIT_SLOT_SIGNING_SALT,
        compress=True,
    )


def read_visit_slot(*, slot_id: str, invitation_id: UUID) -> VisitSlotChoice:
    """Decode a slot token, or refuse it.

    Every failure answers `m2_visit_slot_unavailable` — a tampered token, an expired one and a
    token for somebody else's enquiry are all "that time is not yours to take", and distinguishing
    them in the response would tell a prober which of the three they achieved.
    """
    try:
        payload = signing.loads(
            slot_id,
            salt=VISIT_SLOT_SIGNING_SALT,
            max_age=settings.M2_VISIT_SLOT_TOKEN_TTL_SECONDS,
        )
    except signing.SignatureExpired as exc:
        raise VisitSlotExpiredError() from exc
    except signing.BadSignature as exc:
        raise VisitSlotUnavailableError(
            "That time is no longer available. Refresh and pick another.",
        ) from exc
    if (
        not isinstance(payload, dict)
        or payload.get("v") != VISIT_SLOT_SIGNING_VERSION
        or payload.get("invitation_id") != str(invitation_id)
    ):
        raise VisitSlotUnavailableError(
            "That time is no longer available. Refresh and pick another.",
        )
    return VisitSlotChoice(
        starts_at=datetime.fromisoformat(str(payload["starts_at"])),
        duration_minutes=int(payload["duration_minutes"]),
    )


def sign_customer_visit_slot(
    *, requirement_id: UUID, starts_at: datetime, duration_minutes: int
) -> str:
    """Sign a candidate start for the Customer-owned requirement, never a free-form time."""

    return signing.dumps(
        {
            "v": CUSTOMER_VISIT_SLOT_SIGNING_VERSION,
            "requirement_id": str(requirement_id),
            "starts_at": starts_at.isoformat(),
            "duration_minutes": int(duration_minutes),
        },
        salt=CUSTOMER_VISIT_SLOT_SIGNING_SALT,
        compress=True,
    )


def read_customer_visit_slot(*, slot_id: str, requirement_id: UUID) -> VisitSlotChoice:
    """Redeem a Customer slot token without disclosing why an invalid token failed."""

    try:
        payload = signing.loads(
            slot_id,
            salt=CUSTOMER_VISIT_SLOT_SIGNING_SALT,
            max_age=settings.M2_VISIT_SLOT_TOKEN_TTL_SECONDS,
        )
        if (
            not isinstance(payload, dict)
            or payload.get("v") != CUSTOMER_VISIT_SLOT_SIGNING_VERSION
            or payload.get("requirement_id") != str(requirement_id)
        ):
            raise ValueError
        starts_at = datetime.fromisoformat(str(payload["starts_at"]))
        duration_minutes = int(payload["duration_minutes"])
        if timezone.is_naive(starts_at) or duration_minutes <= 0:
            raise ValueError
    except signing.SignatureExpired as exc:
        raise VisitSlotExpiredError() from exc
    except (signing.BadSignature, TypeError, ValueError) as exc:
        raise VisitSlotUnavailableError(
            "That time is no longer available. Refresh and choose another.",
        ) from exc
    return VisitSlotChoice(starts_at=starts_at, duration_minutes=duration_minutes)


def _customer_snapshot(requirement: CustomerRequirement, *, start: datetime, end: datetime) -> Any:
    area_id = requirement.service_area_id
    if area_id is None:
        raise VisitSlotUnavailableError(
            "Add a serviceable address before choosing visit times.",
        )
    area = ServiceArea.objects.prefetch_related(
        "operating_windows",
        "operating_exceptions",
    ).get(id=area_id)
    return load_snapshot(
        variant_ids={requirement.variant_id},
        area=area,
        horizon_start=start,
        horizon_end=end,
        destination=requirement.address,
    )


def candidate_customer_visit_starts(*, requirement: CustomerRequirement) -> BookingWindows:
    """Candidate starts shared by all currently eligible Partners for this Customer request."""

    duration = visit_duration_minutes(requirement)
    now = timezone.now()
    horizon_end = now + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS + 1)
    snapshot = _customer_snapshot(requirement, start=now, end=horizon_end)
    return build_arrival_window_grid(
        area=snapshot.area,
        snapshot=snapshot,
        duration=duration,
        now=now,
        window_id=lambda starts_at, _window_minutes: sign_customer_visit_slot(
            requirement_id=requirement.id,
            starts_at=starts_at,
            duration_minutes=duration,
        ),
    )


def _choices_do_not_overlap(choices: list[VisitSlotChoice]) -> bool:
    occupied = sorted(occupied_range_bounds(choice) for choice in choices)
    return all(previous[1] <= current[0] for previous, current in pairwise(occupied))


def _customer_choice_is_still_available(
    *, requirement: CustomerRequirement, choice: VisitSlotChoice
) -> bool:
    snapshot = _customer_snapshot(
        requirement,
        start=choice.starts_at,
        end=choice.starts_at + timedelta(minutes=choice.duration_minutes + 24 * 60),
    )
    return bool(
        snapshot.free_partner_ids(
            starts_at=choice.starts_at,
            duration_minutes=choice.duration_minutes,
        )
    )


@transaction.atomic
def choose_customer_visit_slots(
    *, requirement_id: UUID, actor: User, slot_ids: list[str]
) -> tuple[VisitPlanShare, ...]:
    """Store exactly one signed, non-overlapping Customer choice per visit-plan share."""

    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("address", "service_area", "configuration")
        .filter(pk=requirement_id, customer=actor)
        .first()
    )
    if requirement is None:
        raise RequirementNotFoundError()
    if requirement.status != CustomerRequirement.Status.DRAFT:
        raise VisitSlotUnavailableError("Only an unsent request can choose all visit times.")
    plan = VisitPlan.objects.select_for_update().filter(requirement=requirement).first()
    if plan is None or plan.status != VisitPlan.Status.CHOSEN:
        raise VisitSlotUnavailableError("Choose the number of estimates first.")
    if len(slot_ids) != plan.plan_size:
        raise VisitSlotUnavailableError(
            f"Choose exactly {plan.plan_size} visit time(s) for this plan.",
        )
    choices = [
        read_customer_visit_slot(slot_id=slot_id, requirement_id=requirement.id)
        for slot_id in slot_ids
    ]
    if len({choice.starts_at for choice in choices}) != len(choices) or not _choices_do_not_overlap(
        choices
    ):
        raise VisitSlotUnavailableError("Choose different, non-overlapping visit times.")
    if any(choice.starts_at <= timezone.now() for choice in choices):
        raise VisitSlotUnavailableError("One of those times has passed. Refresh and choose again.")
    if any(
        not _customer_choice_is_still_available(requirement=requirement, choice=choice)
        for choice in choices
    ):
        raise VisitSlotUnavailableError()

    shares = list(plan.shares.select_for_update().order_by("position"))
    for share, choice in zip(shares, choices, strict=True):
        share.requested_start = choice.starts_at
        share.duration_minutes = choice.duration_minutes
        share.matching_status = VisitPlanShare.MatchingStatus.SEARCHING
        share.save(
            update_fields=(
                "requested_start",
                "duration_minutes",
                "matching_status",
                "updated_at",
            )
        )
    return tuple(shares)


@transaction.atomic
def replace_customer_visit_slot(
    *, requirement_id: UUID, share_id: UUID, actor: User, slot_id: str
) -> VisitPlanShare:
    """Replace one exhausted slot without disturbing held or booked siblings."""

    requirement = (
        CustomerRequirement.objects.select_for_update(of=("self",))
        .select_related("address", "service_area", "configuration")
        .filter(pk=requirement_id, customer=actor)
        .first()
    )
    if requirement is None:
        raise RequirementNotFoundError()
    share = (
        VisitPlanShare.objects.select_for_update()
        .select_related("plan")
        .get(pk=share_id, plan__requirement=requirement)
    )
    if share.matching_status != VisitPlanShare.MatchingStatus.NO_PROFESSIONAL_FOUND:
        raise VisitSlotUnavailableError("Only an unmatched visit time can be replaced.")
    choice = read_customer_visit_slot(slot_id=slot_id, requirement_id=requirement.id)
    sibling_choices = [
        VisitSlotChoice(row.requested_start, int(row.duration_minutes))
        for row in share.plan.shares.exclude(pk=share.pk)
        if row.requested_start is not None and row.duration_minutes is not None
    ]
    if not _choices_do_not_overlap([*sibling_choices, choice]):
        raise VisitSlotUnavailableError("That time overlaps another visit in this plan.")
    if choice.starts_at <= timezone.now() or not _customer_choice_is_still_available(
        requirement=requirement,
        choice=choice,
    ):
        raise VisitSlotUnavailableError()
    share.requested_start = choice.starts_at
    share.duration_minutes = choice.duration_minutes
    share.matching_status = VisitPlanShare.MatchingStatus.SEARCHING
    share.save(
        update_fields=("requested_start", "duration_minutes", "matching_status", "updated_at")
    )
    return share


def candidate_visit_starts(*, invitation: VendorInvitation) -> BookingWindows:
    """The grid this vendor may confirm a visit on.

    Same payload shape as `POST /api/v1/booking/windows/`, on purpose: the Partner slot picker is
    the Customer slot picker with a different caller, and one shape means one renderer and one set
    of `unavailable_reason` values to explain.

    An ineligible vendor gets a grid rather than an error — every slot reads `NO_CAPACITY`, which
    is the truth ("your service, area or calendar does not cover this work") and is renderable,
    where a refusal on a read would leave the screen with nothing to say.
    """
    requirement = invitation.requirement
    area_id = requirement.service_area_id
    if area_id is None:
        raise VisitSlotUnavailableError(
            "This request has no serviceable area yet, so we cannot offer visit times.",
        )
    duration = visit_duration_minutes(requirement)
    now = timezone.now()
    area = ServiceArea.objects.prefetch_related(
        "operating_windows",
        "operating_exceptions",
    ).get(id=area_id)
    horizon_end = now + timedelta(days=settings.M1_SCHEDULED_MAX_DAYS + 1)
    snapshot = load_snapshot(
        variant_ids={requirement.variant_id},
        area=area,
        horizon_start=now,
        horizon_end=horizon_end,
        destination=requirement.address,
    )
    # Narrow the whole-area snapshot to the one invited vendor. `replace` keeps every prefetched
    # rule, exception and reservation, so this costs nothing extra and cannot disagree with the
    # grid the A1 flow would have drawn for the same Partner.
    scoped = replace(
        snapshot,
        partner_ids=tuple(
            partner_id for partner_id in snapshot.partner_ids if partner_id == invitation.partner_id
        ),
    )
    windows = build_arrival_window_grid(
        area=area,
        snapshot=scoped,
        duration=duration,
        now=now,
        window_id=lambda starts_at, _window_minutes: sign_visit_slot(
            invitation_id=invitation.id,
            starts_at=starts_at,
            duration_minutes=duration,
        ),
    )
    return remove_requirement_conflicts(windows=windows, requirement=requirement)


def remove_requirement_conflicts(
    *,
    windows: BookingWindows,
    requirement: CustomerRequirement,
    exclude_site_visit_id: UUID | None = None,
) -> BookingWindows:
    """Mark times already held by another plan visit as unavailable.

    The shared availability snapshot answers whether *this Partner* is free. A
    project plan asks a second question: whether the Customer is already meeting
    a different Partner for this same requirement. Both must be true before a
    slot is offered.
    """
    occupied = _occupied_plan_visit_ranges(
        requirement=requirement,
        exclude_site_visit_id=exclude_site_visit_id,
    )
    if not occupied:
        return windows

    days = tuple(
        replace(
            day,
            windows=tuple(
                replace(
                    window,
                    is_available=False,
                    unavailable_reason="NO_CAPACITY",
                    capacity=0,
                )
                if window.is_available
                and _overlaps_any(
                    occupied,
                    *occupied_range_bounds(
                        VisitSlotChoice(
                            starts_at=window.starts_at,
                            duration_minutes=windows.estimated_duration_minutes,
                        )
                    ),
                )
                else window
                for window in day.windows
            ),
        )
        for day in windows.days
    )
    return replace(windows, days=days)


def requirement_slot_is_still_free(
    *,
    requirement: CustomerRequirement,
    choice: VisitSlotChoice,
    exclude_site_visit_id: UUID | None = None,
) -> bool:
    """Whether this Customer project has no other live visit at this time.

    Confirmation and rescheduling hold the requirement row lock while calling
    this function. That serializes two different Partners racing for the same
    time; the second transaction sees the first visit and loses cleanly.
    """
    lower, upper = occupied_range_bounds(choice)
    return not _overlaps_any(
        _occupied_plan_visit_ranges(
            requirement=requirement,
            exclude_site_visit_id=exclude_site_visit_id,
        ),
        lower,
        upper,
    )


def _occupied_plan_visit_ranges(
    *,
    requirement: CustomerRequirement,
    exclude_site_visit_id: UUID | None,
) -> tuple[tuple[datetime, datetime], ...]:
    visits = SiteVisit.objects.filter(
        requirement=requirement,
        plan_share__isnull=False,
        scheduled_for__isnull=False,
        status__in=SiteVisit.SHARE_HOLDING_STATUSES,
    )
    if exclude_site_visit_id is not None:
        visits = visits.exclude(pk=exclude_site_visit_id)

    fallback_duration = visit_duration_minutes(requirement)
    ranges: list[tuple[datetime, datetime]] = []
    for visit in visits.only("scheduled_for", "duration_minutes"):
        if visit.scheduled_for is None:  # Narrowed above; keeps MyPy honest.
            continue
        ranges.append(
            occupied_range_bounds(
                VisitSlotChoice(
                    starts_at=visit.scheduled_for,
                    duration_minutes=visit.duration_minutes or fallback_duration,
                )
            )
        )
    return tuple(ranges)


def _overlaps_any(
    occupied: tuple[tuple[datetime, datetime], ...],
    lower: datetime,
    upper: datetime,
) -> bool:
    return any(
        lower < existing_upper and existing_lower < upper
        for existing_lower, existing_upper in occupied
    )


def slot_is_still_free(
    *,
    invitation: VendorInvitation,
    choice: VisitSlotChoice,
    exclude_site_visit_id: UUID | None = None,
) -> bool:
    """Re-ask the grid, at write time, whether this exact start is still bookable.

    The token proves the grid once drew this slot; it does not prove the slot is still free, and
    between drawing and booking the vendor may have taken an A1 job. The database's exclusion
    constraint is the final authority — this check exists so the ordinary case answers
    `m2_visit_slot_unavailable` with a message rather than an `IntegrityError`.
    """
    requirement = invitation.requirement
    area_id = requirement.service_area_id
    if area_id is None:
        return False
    area = ServiceArea.objects.prefetch_related(
        "operating_windows",
        "operating_exceptions",
    ).get(id=area_id)
    snapshot = load_snapshot(
        variant_ids={requirement.variant_id},
        area=area,
        horizon_start=choice.starts_at,
        horizon_end=choice.starts_at + timedelta(minutes=choice.duration_minutes + 24 * 60),
        destination=requirement.address,
    )
    free = snapshot.free_partner_ids(
        starts_at=choice.starts_at,
        duration_minutes=choice.duration_minutes,
    )
    return invitation.partner_id in free and requirement_slot_is_still_free(
        requirement=requirement,
        choice=choice,
        exclude_site_visit_id=exclude_site_visit_id,
    )


def occupied_range_bounds(choice: VisitSlotChoice) -> tuple[datetime, datetime]:
    """The instants a visit occupies, including the shared turnaround gap.

    `M1_TURNAROUND_MINUTES` is added for the same reason the A1 grid adds it: a Partner offered two
    jobs back to back with no travel time between them cannot make the second one.
    """
    turnaround = int(getattr(settings, "M1_TURNAROUND_MINUTES", 0))
    return (
        choice.starts_at,
        choice.starts_at + timedelta(minutes=choice.duration_minutes + turnaround),
    )


def as_wire(windows: BookingWindows) -> dict[str, Any]:
    """The grid as plain data, in the `booking/windows/` field order."""
    return {
        "server_now": windows.server_now,
        "visit_duration_minutes": windows.estimated_duration_minutes,
        "availability_is_preliminary": windows.availability_is_preliminary,
        "timezone": windows.timezone,
        "days": [
            {
                "date": day.date,
                "is_today": day.is_today,
                "slots": [
                    {
                        "id": window.id,
                        "starts_at": window.starts_at,
                        "ends_at": window.ends_at,
                        "is_available": window.is_available,
                        "unavailable_reason": window.unavailable_reason,
                    }
                    for window in day.windows
                ],
            }
            for day in windows.days
        ],
    }
