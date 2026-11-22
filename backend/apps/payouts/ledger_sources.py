"""What each ledger line was for: the booking, rental, project stage or correction behind it.

A Partner reading their statement needs "AC Service on 12 Nov" or "Canon camera, 22-24 Nov", not
"For the work ₹1,200". Every way money reaches the ledger is named here, so a new one shows up as
`OTHER` rather than silently as nothing:

- a home-service visit (`booking`) and a refund taken back from it;
- a rental (`rental_booking`) and its refund;
- a project or workforce stage payment, and the retention released after its warranty;
- a booking fee kept as travel compensation, and a share of a paid site visit;
- an Operations correction, a withdrawal fee, and that fee given back.

Names come from the records themselves (service and item names are what the Partner was booked
for), so nothing here is translated; the Partner app words the type in their language. Looked up
in batches per page, never per line, and only from records this Partner's lines already point at.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from typing import Any, Final
from uuid import UUID

from apps.carts.models import QuoteLine
from apps.commerce.models import Booking
from apps.payouts.models import PartnerLedgerEntry

HOME_VISIT: Final = "HOME_VISIT"
RENTAL: Final = "RENTAL"
PROJECT_STAGE: Final = "PROJECT_STAGE"
PROJECT_RETENTION: Final = "PROJECT_RETENTION"
BOOKING_FEE: Final = "BOOKING_FEE"
SITE_VISIT: Final = "SITE_VISIT"
ADJUSTMENT: Final = "ADJUSTMENT"
WITHDRAWAL_FEE: Final = "WITHDRAWAL_FEE"
WITHDRAWAL_FEE_REFUND: Final = "WITHDRAWAL_FEE_REFUND"
OTHER: Final = "OTHER"

SOURCE_TYPES: Final = (
    (HOME_VISIT, "Home-service visit"),
    (RENTAL, "Rental"),
    (PROJECT_STAGE, "Project or workforce stage"),
    (PROJECT_RETENTION, "Project retention released"),
    (BOOKING_FEE, "Booking fee kept as compensation"),
    (SITE_VISIT, "Site visit share"),
    (ADJUSTMENT, "Correction by Vsolve"),
    (WITHDRAWAL_FEE, "Withdrawal fee"),
    (WITHDRAWAL_FEE_REFUND, "Withdrawal fee refunded"),
    (OTHER, "Other"),
)


@dataclass(frozen=True, slots=True)
class LedgerSource:
    type: str
    #: The service or item name, empty when there is none (a correction with no booking).
    title: str = ""
    #: For a project stage: its number and the Partner's own label for it.
    stage_position: int | None = None
    stage_label: str = ""
    #: The day of the visit or stage, or the rental's first and last day.
    starts_on: date | None = None
    ends_on: date | None = None
    #: What the Partner app opens: one of these, by `type`.
    booking_id: UUID | None = None
    rental_booking_id: UUID | None = None
    engagement_id: UUID | None = None


def _booking_title(booking: Booking) -> str:
    """The booked service, as the Partner's job screen names it."""

    unit = booking.fulfilment_unit
    if unit is None:
        return ""
    labels = [line.label for line in unit.lines.all() if line.kind == QuoteLine.Kind.SERVICE]
    if not labels:
        return ""
    return labels[0] if len(labels) == 1 else f"{labels[0]} +{len(labels) - 1} more"


def _snapshot_id(entry: PartnerLedgerEntry, key: str) -> UUID | None:
    value = (entry.calculation_snapshot or {}).get(key)
    try:
        return UUID(str(value)) if value else None
    except ValueError:
        return None


def _service_name(requirement: Any) -> str:
    variant = getattr(requirement, "variant", None)
    service = getattr(variant, "service", None)
    return str(getattr(service, "name", "") or "")


class _Lookups:
    """Every record a page of lines points at, fetched once per kind."""

    def __init__(self, entries: list[PartnerLedgerEntry]) -> None:
        # Imported here: `requirements` imports `payouts`, so a module-level import would cycle.
        from apps.rental.models import RentalBooking  # noqa: PLC0415
        from apps.requirements.models import (  # noqa: PLC0415
            BookingFee,
            Engagement,
            EngagementStage,
            VisitPlanShare,
        )

        lines: list[PartnerLedgerEntry] = list(entries)
        lines += [entry.corrects for entry in entries if entry.corrects is not None]
        booking_ids = {line.booking_id for line in lines if line.booking_id}
        rental_ids = {line.rental_booking_id for line in lines if line.rental_booking_id}
        stage_ids = {_snapshot_id(line, "engagement_stage_id") for line in lines} - {None}
        engagement_ids = {_snapshot_id(line, "engagement_id") for line in lines} - {None}
        fee_ids = {_snapshot_id(line, "booking_fee_id") for line in lines} - {None}
        share_ids = {_snapshot_id(line, "visit_plan_share_id") for line in lines} - {None}

        self.bookings = {
            booking.id: booking
            for booking in Booking.objects.filter(id__in=booking_ids)
            .select_related("fulfilment_unit")
            .prefetch_related("fulfilment_unit__lines")
        }
        self.rentals = {
            rental.id: rental
            for rental in RentalBooking.objects.filter(id__in=rental_ids).select_related("asset")
        }
        self.stages = {
            stage.id: stage for stage in EngagementStage.objects.filter(id__in=stage_ids)
        }
        engagement_ids |= {stage.engagement_id for stage in self.stages.values()}
        self.engagements = {
            engagement.id: engagement
            for engagement in Engagement.objects.filter(id__in=engagement_ids).select_related(
                "requirement__variant__service"
            )
        }
        self.fees = {
            fee.id: fee
            for fee in BookingFee.objects.filter(id__in=fee_ids).select_related(
                "requirement__variant__service", "requirement__engagement"
            )
        }
        self.shares = {
            share.id: share
            for share in VisitPlanShare.objects.filter(id__in=share_ids).select_related(
                "plan__requirement__variant__service"
            )
        }

    def describe(self, entry: PartnerLedgerEntry) -> LedgerSource:  # noqa: PLR0911
        if entry.kind == PartnerLedgerEntry.Kind.FEE:
            return LedgerSource(type=WITHDRAWAL_FEE)
        if entry.kind == PartnerLedgerEntry.Kind.ADJUSTMENT and entry.reason.startswith(
            "withdrawal_fee_refund"
        ):
            return LedgerSource(type=WITHDRAWAL_FEE_REFUND)
        if entry.booking_id and entry.booking_id in self.bookings:
            booking = self.bookings[entry.booking_id]
            return LedgerSource(
                type=HOME_VISIT,
                title=_booking_title(booking),
                starts_on=booking.scheduled_start.date(),
                booking_id=booking.id,
            )
        if entry.rental_booking_id and entry.rental_booking_id in self.rentals:
            rental = self.rentals[entry.rental_booking_id]
            return LedgerSource(
                type=RENTAL,
                title=rental.asset.title if rental.asset else "",
                starts_on=rental.start_date,
                ends_on=rental.end_date,
                rental_booking_id=rental.id,
            )
        source = (entry.calculation_snapshot or {}).get("source")
        stage = self.stages.get(_snapshot_id(entry, "engagement_stage_id") or UUID(int=0))
        if source == "m2_engagement_stage" and stage is not None:
            engagement = self.engagements.get(stage.engagement_id)
            return LedgerSource(
                type=PROJECT_STAGE,
                title=_service_name(engagement.requirement) if engagement else "",
                stage_position=stage.position,
                stage_label=stage.label,
                starts_on=stage.scheduled_on,
                engagement_id=stage.engagement_id,
            )
        engagement = self.engagements.get(_snapshot_id(entry, "engagement_id") or UUID(int=0))
        if source == "m2_warranty_retention" and engagement is not None:
            return LedgerSource(
                type=PROJECT_RETENTION,
                title=_service_name(engagement.requirement),
                engagement_id=engagement.id,
            )
        fee = self.fees.get(_snapshot_id(entry, "booking_fee_id") or UUID(int=0))
        if source == "m2_booking_fee_forfeit" and fee is not None:
            linked = getattr(fee.requirement, "engagement", None)
            return LedgerSource(
                type=BOOKING_FEE,
                title=_service_name(fee.requirement),
                engagement_id=linked.id if linked is not None else None,
            )
        share = self.shares.get(_snapshot_id(entry, "visit_plan_share_id") or UUID(int=0))
        if source == "m2_visit_plan_share" and share is not None:
            return LedgerSource(type=SITE_VISIT, title=_service_name(share.plan.requirement))
        if entry.kind in (PartnerLedgerEntry.Kind.ADJUSTMENT, PartnerLedgerEntry.Kind.REVERSAL):
            corrected = entry.corrects if entry.corrects_id else None
            if corrected is not None and corrected.id != entry.id:
                base = self.describe(corrected)
                if entry.kind == PartnerLedgerEntry.Kind.REVERSAL:
                    return base
                return LedgerSource(
                    type=ADJUSTMENT,
                    title=base.title,
                    starts_on=base.starts_on,
                    ends_on=base.ends_on,
                    booking_id=base.booking_id,
                    rental_booking_id=base.rental_booking_id,
                    engagement_id=base.engagement_id,
                )
            if entry.kind == PartnerLedgerEntry.Kind.ADJUSTMENT:
                return LedgerSource(type=ADJUSTMENT)
        return LedgerSource(type=OTHER)


def describe_ledger_sources(entries: Iterable[PartnerLedgerEntry]) -> dict[UUID, LedgerSource]:
    """Each line's source, by line id. A handful of queries for the whole page."""

    lines = list(entries)
    if not lines:
        return {}
    lookups = _Lookups(lines)
    return {line.id: lookups.describe(line) for line in lines}
