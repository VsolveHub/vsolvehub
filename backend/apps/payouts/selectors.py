"""Which ledger entries can be paid, and what a Partner's balance is made of.

One module answers both, because they must agree: a payout run, a Withdraw tap and the balance a
Partner reads all apply the same three rules.

* **Cleared.** A visit's earning is not payable before `clears_at`, the end of the Customer's
  quality-dispute window. Corrections and refunds carry no `clears_at` and count at once.
* **Not on hold.** An earning whose booking (or rental booking) has an `ACTIVE`
  `PartnerEarningHold` is frozen, whether the hold came before the earning or after it.
* **Refunds subtract.** Reversals are stored negative and are never held or delayed, so they
  reduce what is paid now rather than waiting for an earning to cancel against.

    withdrawable = cleared earnings - refunds - held - in flight

In-flight money is already `RESERVED`, outside the unpaid statuses, so it never counts twice.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from django.db.models import Exists, OuterRef, Q, QuerySet, Sum
from django.db.models.functions import Coalesce

from apps.payouts.models import PartnerEarningHold, PartnerLedgerEntry

#: Ledger statuses whose money is neither paid nor reserved for a payout.
UNPAID_STATUSES = (PartnerLedgerEntry.Status.AVAILABLE, PartnerLedgerEntry.Status.RELEASED)

#: True on an entry annotated by `with_hold_flags` when an active hold freezes it.
ON_HOLD = Q(booking_on_hold=True) | Q(rental_on_hold=True)


def _active_holds() -> QuerySet[PartnerEarningHold]:
    return PartnerEarningHold.objects.filter(status=PartnerEarningHold.Status.ACTIVE)


def with_hold_flags(entries: QuerySet[PartnerLedgerEntry]) -> QuerySet[PartnerLedgerEntry]:
    """Annotate each entry with whether an active hold on its booking freezes it."""

    return entries.annotate(
        booking_on_hold=Exists(_active_holds().filter(booking_id=OuterRef("booking_id"))),
        rental_on_hold=Exists(
            _active_holds().filter(rental_booking_id=OuterRef("rental_booking_id"))
        ),
    )


def cleared(now: datetime) -> Q:
    return Q(clears_at__isnull=True) | Q(clears_at__lte=now)


def payable_entries(
    *,
    partner_id: UUID,
    now: datetime,
    created_from: datetime | None = None,
    created_before: datetime | None = None,
) -> QuerySet[PartnerLedgerEntry]:
    """Every entry one transfer to this Partner would carry right now.

    Earnings that are cleared and not on hold, optionally limited to a run's period, plus every
    unpaid deduction whatever its date: a refund known today comes off today's transfer, not a
    later one that may never come.
    """

    earning = Q(net_paise__gt=0) & cleared(now) & ~ON_HOLD
    if created_from is not None:
        earning &= Q(created_at__gte=created_from)
    if created_before is not None:
        earning &= Q(created_at__lt=created_before)
    return with_hold_flags(
        PartnerLedgerEntry.objects.filter(partner_id=partner_id, status__in=UNPAID_STATUSES)
    ).filter(earning | Q(net_paise__lt=0))


def partners_with_payable_earnings(
    *, now: datetime, created_from: datetime, created_before: datetime
) -> list[UUID]:
    """Partners with at least one cleared, unheld earning in the period, in a stable order."""

    ids = (
        with_hold_flags(
            PartnerLedgerEntry.objects.filter(
                status__in=UNPAID_STATUSES,
                net_paise__gt=0,
                created_at__gte=created_from,
                created_at__lt=created_before,
            )
        )
        .filter(cleared(now))
        .exclude(ON_HOLD)
        .values_list("partner_id", flat=True)
        .distinct()
    )
    return sorted(set(ids), key=str)


@dataclass(frozen=True, slots=True)
class PartnerBalance:
    """A Partner's money, split so every unpaid rupee is in exactly one place."""

    #: Payable now: cleared, not on hold, refunds subtracted. Negative when refunds exceed what
    #: has cleared, which is the honest number — that much will come off the next earnings.
    available_paise: int
    #: Earned, waiting out the Customer's dispute window.
    clearing_paise: int
    #: Frozen by a dispute or case, or not yet released by its own workflow.
    held_paise: int
    #: In a payout that has been reserved or sent and not yet settled.
    reserved_paise: int
    paid_paise: int

    @property
    def pending_paise(self) -> int:
        """Earned but not yet payable: on hold or still clearing."""

        return self.held_paise + self.clearing_paise

    @property
    def withdrawable_paise(self) -> int:
        return max(self.available_paise, 0)


def partner_balance(*, partner_id: UUID, now: datetime) -> PartnerBalance:
    unpaid = Q(status__in=UNPAID_STATUSES)
    earning = unpaid & Q(net_paise__gt=0)
    sums: dict[str, Any] = {
        "available": Q(unpaid & Q(net_paise__lte=0)) | (earning & cleared(now) & ~ON_HOLD),
        "clearing": earning & ~cleared(now) & ~ON_HOLD,
        "held": Q(status=PartnerLedgerEntry.Status.PENDING) | (earning & ON_HOLD),
        "reserved": Q(status=PartnerLedgerEntry.Status.RESERVED),
        "paid": Q(status=PartnerLedgerEntry.Status.PAID),
    }
    totals = with_hold_flags(PartnerLedgerEntry.objects.filter(partner_id=partner_id)).aggregate(
        **{
            name: Coalesce(Sum("net_paise", filter=condition), 0)
            for name, condition in sums.items()
        }
    )
    return PartnerBalance(
        available_paise=int(totals["available"]),
        clearing_paise=int(totals["clearing"]),
        held_paise=int(totals["held"]),
        reserved_paise=int(totals["reserved"]),
        paid_paise=int(totals["paid"]),
    )
