"""Ledger settlement, earnings holds and the payout batch lifecycle.

Every command here is `@transaction.atomic` and takes its locks in one order: `PayoutBatch`,
then `PayoutBatchItem`, then `PartnerLedgerEntry`. The reverse order between two concurrent batch
operations is the only way to deadlock this module, and picking an order is cheaper than
detecting one.
"""

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4, uuid5
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.commerce.models import Booking
from apps.foundation.services import enqueue_outbox_event
from apps.fulfilment.models import WorkOutcome, WorkTask
from apps.identity.models import User
from apps.notifications.models import KillSwitch
from apps.notifications.services import is_engaged
from apps.partners.models import PartnerApplication, PartnerProfile
from apps.payouts.exceptions import (
    LedgerEntryNotPayableApiError,
    PayoutAccountProviderApiError,
    PayoutAccountRejectedApiError,
    PayoutAccountReviewInvalidApiError,
    PayoutAccountSelfReviewApiError,
    PayoutAccountsUnavailableApiError,
    PayoutBatchConflictApiError,
    PayoutBatchInvalidApiError,
    SelfApprovalDeniedApiError,
    WithdrawalRefusedApiError,
)
from apps.payouts.models import (
    PartnerEarningHold,
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
    PayoutItemEntry,
    PayoutWebhookEvent,
)
from apps.payouts.providers import (
    PayoutProviderAmbiguousError,
    PayoutProviderError,
    PayoutProviderRejectedError,
    ProviderPayout,
    RazorpayXPayoutProvider,
    get_payout_account_provider,
    get_payout_provider,
)
from apps.payouts.selectors import (
    ON_HOLD,
    partner_balance,
    partners_with_payable_earnings,
    payable_entries,
    with_hold_flags,
)
from apps.rental.models import RentalBooking

logger = logging.getLogger(__name__)

#: How long a new or changed payout account sits before money can leave through it is
#: `settings.PAYOUT_ACCOUNT_COOLING_HOURS`.
#:
#: Account takeover is the highest-value attack on a payouts system, and the only cheap defence
#: is time: a delay between "the account changed" and "money moved" is what lets a Partner notice
#: and Operations act. The settlement document names cooling as a precondition for on-demand
#: payout; applying it to the batch flow costs nothing and closes the same hole. Production
#: refuses to start with less than 24 hours; a RazorpayX test-mode run may set 0.

#: Fixed for good. Every payout idempotency key is derived from it, and changing it would make a
#: resubmitted payout look new to RazorpayX instead of the one it already received.
_PAYOUT_KEY_NAMESPACE = UUID("048ade3a-7dde-4f6c-a537-55fdd1988283")


def payout_idempotency_key(*, batch_id: UUID, partner_id: UUID) -> str:
    """The `X-Payout-Idempotency` key for one Partner's transfer in one batch.

    Stable, so a resubmission is recognised as the same payout, and 36 characters, inside
    RazorpayX's limit of 4 to 36. A batch holds one transfer per Partner, so (batch, Partner) is
    exactly one payout.
    """

    return str(uuid5(_PAYOUT_KEY_NAMESPACE, f"{batch_id}:{partner_id}"))


#: Ledger statuses a batch may take. `PENDING` is excluded on purpose — it is what a
#: payout-holding case leaves behind.
RESERVABLE_STATUSES = (PartnerLedgerEntry.Status.AVAILABLE, PartnerLedgerEntry.Status.RELEASED)


@dataclass(frozen=True, slots=True)
class BookingEarningEstimate:
    """The Partner's estimated take from the immutable booked scope.

    This is the same gross and commission basis used when the unit was offered. It is deliberately
    separate from the ledger entry: completion outcomes and accepted amendments can change the
    final earning, and only settlement is authoritative for money actually owed.
    """

    gross_paise: int
    commission_paise: int
    net_paise: int
    currency: str


def _commission_for(*, gross_paise: int, pricing: dict[str, Any]) -> int:
    """The same clamp `group_services` used to quote the Partner their net at offer time.

    Deliberately identical arithmetic rather than a shared helper import: the offer's number was
    computed from a snapshot taken then, and this one from the snapshot stored on the quote. If
    the two ever have to differ, that difference should be visible here rather than hidden
    behind a function both call.
    """

    calculated = gross_paise * int(pricing["commission_basis_points"]) // 10_000
    return min(
        int(pricing["commission_cap_paise"]),
        max(int(pricing["commission_floor_paise"]), calculated),
        gross_paise,
    )


def estimated_booking_earning(booking: Booking) -> BookingEarningEstimate | None:
    """Return the Partner-visible estimate frozen into this booking's quoted unit.

    A legacy booking without a fulfilment unit has no durable priced scope, so it publishes no
    estimate instead of reconstructing one from mutable work tasks or inventing a fallback price.
    """

    unit = booking.fulfilment_unit
    if unit is None:
        return None
    quote_unit = unit.quote_unit
    gross_paise = quote_unit.task_subtotal_paise + quote_unit.minimum_visit_adjustment_paise
    commission_paise = _commission_for(
        gross_paise=gross_paise,
        pricing=quote_unit.quote.pricing_policy_snapshot,
    )
    return BookingEarningEstimate(
        gross_paise=gross_paise,
        commission_paise=commission_paise,
        net_paise=gross_paise - commission_paise,
        currency=unit.currency,
    )


def settled_gross_paise(booking: Booking) -> int:
    """What the Partner actually delivered, not what was booked.

    `05-pricing-payments-and-settlement.md`: "final ledger lines reconcile to completed scope,
    refunds, compensation and statutory deductions". A visit where two of three tasks were done
    earns two tasks' worth — reading the quoted total instead would pay for work that did not
    happen, and no later reconciliation would catch it because the number would look right.
    """

    tasks = {task.id: task for task in WorkTask.objects.filter(booking=booking)}
    if not tasks:
        return 0
    outcomes = WorkOutcome.objects.filter(completion_submission__booking=booking)
    if not outcomes.exists():
        return 0

    total = 0
    for outcome in outcomes:
        task = tasks.get(outcome.work_task_id)
        if task is None:
            continue
        if outcome.outcome == WorkOutcome.Outcome.COMPLETED:
            total += task.amount_paise
        elif outcome.outcome == WorkOutcome.Outcome.PARTIAL and task.quantity:
            # Pro-rata by the quantity actually done. Never more than the task is worth.
            done = min(outcome.quantity, task.quantity)
            total += task.amount_paise * done // task.quantity
    return total


@transaction.atomic
def settle_booking_earning(
    *, booking_id: UUID, actor: User | None = None
) -> PartnerLedgerEntry | None:
    """Write the one immutable earning line for a delivered visit.

    Idempotent by database constraint rather than by a lookup that could race:
    `payouts_one_earning_per_booking` allows exactly one `EARNING` per Booking, so a replayed
    settlement finds the existing row and returns it. Two concurrent callers cannot both win.

    Returns `None` for a visit that delivered nothing — a cancelled booking, or one where every
    task was reported not started. A zero-value ledger line would be noise in a statement the
    Partner reads.
    """

    # `of=("self",)` locks the Booking row and nothing else. `fulfilment_unit` is nullable, so
    # `select_related` makes it the nullable side of an outer join, and PostgreSQL refuses
    # `FOR UPDATE` there — the same constraint `cancellation.py` works around when it locks
    # group Bookings in their own statement.
    booking = (
        Booking.objects.select_for_update(of=("self",))
        .select_related("fulfilment_unit")
        .get(id=booking_id)
    )
    existing = PartnerLedgerEntry.objects.filter(
        booking=booking, kind=PartnerLedgerEntry.Kind.EARNING
    ).first()
    if existing is not None:
        return existing

    unit = booking.fulfilment_unit
    if unit is None:
        return None
    gross = settled_gross_paise(booking)
    if gross <= 0:
        return None

    pricing = unit.quote_unit.quote.pricing_policy_snapshot
    commission = _commission_for(gross_paise=gross, pricing=pricing)
    # A dispute or an open safety case holds the money back until somebody decides. The entry is
    # still written — the Partner earned it — it simply is not yet payable.
    held = booking.payout_hold or booking.status == Booking.Status.DISPUTED
    return PartnerLedgerEntry.objects.create(
        partner=booking.partner,
        booking=booking,
        kind=PartnerLedgerEntry.Kind.EARNING,
        status=(PartnerLedgerEntry.Status.PENDING if held else PartnerLedgerEntry.Status.AVAILABLE),
        gross_paise=gross,
        commission_paise=commission,
        net_paise=gross - commission,
        currency=unit.currency,
        calculation_snapshot={
            "booking_status": booking.status,
            "settled_gross_paise": gross,
            "commission_basis_points": int(pricing["commission_basis_points"]),
            "commission_floor_paise": int(pricing["commission_floor_paise"]),
            "commission_cap_paise": int(pricing["commission_cap_paise"]),
            "payout_hold": booking.payout_hold,
        },
        created_by=actor,
        idempotency_key=f"earning:{booking.id}",
        clears_at=clearing_deadline(),
    )


@transaction.atomic
def settle_rental_earning(
    *, rental_booking_id: UUID, actor: User | None = None
) -> PartnerLedgerEntry | None:
    """Write the one immutable earning line for a returned rental booking.

    Mirroring ``settle_booking_earning``, this is idempotent by the database
    constraint ``payouts_one_earning_per_rental_booking``: a replayed settlement
    returns the existing row. Two concurrent callers cannot both win.

    The owner's share is ``price_paise - platform_fee_paise``, plus any agreed
    transport less its commission (0% today). The deposit is excluded — it is
    the customer's refundable security. The platform fee is V Solve Hub's
    revenue (commission).

    Returns ``None`` for a booking that has not reached ``RETURNED`` or
    ``DISPUTED`` — the partner has not earned the fee yet.
    """

    rb = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("asset__partner")
        .get(id=rental_booking_id)
    )
    existing = PartnerLedgerEntry.objects.filter(
        rental_booking=rb, kind=PartnerLedgerEntry.Kind.EARNING
    ).first()
    if existing is not None:
        return existing

    if rb.status not in (RentalBooking.Status.RETURNED, RentalBooking.Status.DISPUTED):
        return None

    # Transport is the owner's agreed delivery price, paid with the rent. Its commission is
    # snapshotted on the booking at accept time (0% today), so it reaches the owner in full.
    transport = int(rb.transport_paise)
    transport_fee = int(rb.transport_fee_paise)
    gross = int(rb.price_paise) + transport
    commission = int(rb.platform_fee_paise) + transport_fee
    net = gross - commission
    if net <= 0:
        return None

    held = rb.status == RentalBooking.Status.DISPUTED

    return PartnerLedgerEntry.objects.create(
        partner=rb.asset.partner,
        rental_booking=rb,
        kind=PartnerLedgerEntry.Kind.EARNING,
        status=(PartnerLedgerEntry.Status.PENDING if held else PartnerLedgerEntry.Status.AVAILABLE),
        gross_paise=gross,
        commission_paise=commission,
        net_paise=net,
        currency="INR",
        calculation_snapshot={
            "booking_status": rb.status,
            "price_paise": int(rb.price_paise),
            "platform_fee_percent": int(rb.platform_fee_percent),
            "platform_fee_paise": int(rb.platform_fee_paise),
            "transport_paise": transport,
            "transport_fee_percent": int(rb.transport_fee_percent),
            "transport_fee_paise": transport_fee,
            "pickup_or_delivery_mode": rb.pickup_or_delivery_mode,
            "deposit_paise": int(rb.deposit.amount_paise) if rb.deposit_id else 0,
        },
        created_by=actor,
        idempotency_key=f"rental-earning:{rb.id}",
        clears_at=clearing_deadline(),
    )


def clearing_deadline() -> datetime:
    """When an earning settled now becomes payable: the end of the Customer's dispute window."""

    return timezone.now() + timedelta(hours=settings.PAYOUT_CLEARING_HOURS)


@transaction.atomic
def place_earning_hold(
    *,
    reason: str,
    source_id: str,
    booking_id: UUID | None = None,
    rental_booking_id: UUID | None = None,
    actor: User | None = None,
) -> PartnerEarningHold | None:
    """Freeze one booking's earning until whatever placed the hold is decided.

    Idempotent per cause (`payouts_one_active_hold_per_cause`): a replayed dispute finds the hold
    it already placed. Works whether or not the earning has been written yet — selection reads
    holds by booking, so an earning settled after the hold is born frozen.

    Returns None for a booking with no Partner, which has no earning to freeze.
    """

    # Scoped to this booking: a case on an engagement holds entries under the same case id.
    same_cause = PartnerEarningHold.objects.filter(
        reason=reason, source_id=source_id, status=PartnerEarningHold.Status.ACTIVE
    )
    if booking_id is not None:
        same_cause = same_cause.filter(booking_id=booking_id)
    elif rental_booking_id is not None:
        same_cause = same_cause.filter(rental_booking_id=rental_booking_id)
    existing = same_cause.first()
    if existing is not None:
        return existing
    if booking_id is not None:
        partner_id = Booking.objects.filter(id=booking_id).values_list("partner_id", flat=True)[0]
    elif rental_booking_id is not None:
        partner_id = RentalBooking.objects.filter(id=rental_booking_id).values_list(
            "asset__partner_id", flat=True
        )[0]
    else:  # pragma: no cover - every caller names exactly one booking
        raise ValueError("A hold names a booking or a rental booking.")
    if partner_id is None:
        return None
    hold = PartnerEarningHold.objects.create(
        partner_id=partner_id,
        booking_id=booking_id,
        rental_booking_id=rental_booking_id,
        reason=reason,
        source_id=source_id,
        placed_by=actor,
    )
    _freeze_unpaid_earning(booking_id=booking_id, rental_booking_id=rental_booking_id)
    return hold


@transaction.atomic
def hold_ledger_entries(
    *, reason: str, source_id: str, entry_ids: Iterable[UUID], actor: User | None = None
) -> list[UUID]:
    """Freeze individual ledger entries — the M2 earnings no booking reaches — under one cause.

    A hold, not a status: it also stops an entry that is already reserved in a transfer waiting
    to be sent (a withdrawal in the Operations queue, a run not yet paid), which a move to
    `PENDING` cannot touch. `_pre_send_refusal` reads it and releases that transfer unsent. Money
    that has already left is not held here; it is paid. Lifted by `release_hold_for_source`.

    Idempotent per entry and cause (`payouts_one_active_hold_per_cause`). Returns the entries
    newly held.
    """

    held: list[UUID] = []
    entries = PartnerLedgerEntry.objects.filter(id__in=list(entry_ids)).exclude(
        status=PartnerLedgerEntry.Status.PAID
    )
    for entry in entries.order_by("created_at", "id"):
        _, created = PartnerEarningHold.objects.get_or_create(
            reason=reason,
            source_id=source_id,
            ledger_entry=entry,
            status=PartnerEarningHold.Status.ACTIVE,
            defaults={"partner_id": entry.partner_id, "placed_by": actor},
        )
        if created:
            held.append(entry.id)
    return held


def _freeze_unpaid_earning(*, booking_id: UUID | None, rental_booking_id: UUID | None) -> None:
    """Move the booking's unpaid earning to `PENDING`, the status every reader treats as held.

    Only unpaid money: a status cannot freeze money that has left, and a transfer already
    reserved is stopped by the last-moment check instead. `release_payout_hold` moves it back.
    """

    entries = PartnerLedgerEntry.objects.select_for_update().filter(
        kind=PartnerLedgerEntry.Kind.EARNING, status__in=RESERVABLE_STATUSES
    )
    entries = (
        entries.filter(booking_id=booking_id)
        if booking_id is not None
        else entries.filter(rental_booking_id=rental_booking_id)
    )
    for entry in entries:
        entry.status = PartnerLedgerEntry.Status.PENDING
        entry.save(update_fields=("status", "updated_at"))


@transaction.atomic
def release_hold_for_source(
    *, reason: str, source_id: str, actor: User | None = None, note: str = ""
) -> int:
    """Lift the one hold a particular cause placed — a case closing — and nothing else.

    Another cause on the same booking keeps its own hold, so the money stays frozen until the last
    of them is decided.
    """

    return (
        PartnerEarningHold.objects.select_for_update()
        .filter(reason=reason, source_id=source_id, status=PartnerEarningHold.Status.ACTIVE)
        .update(
            status=PartnerEarningHold.Status.RELEASED,
            released_at=timezone.now(),
            released_by=actor,
            release_note=note[:240],
        )
    )


def _release_earning_holds(
    *,
    booking_id: UUID | None,
    rental_booking_id: UUID | None,
    actor: User | None,
    note: str,
) -> int:
    holds = PartnerEarningHold.objects.select_for_update().filter(
        status=PartnerEarningHold.Status.ACTIVE
    )
    holds = (
        holds.filter(booking_id=booking_id)
        if booking_id is not None
        else holds.filter(rental_booking_id=rental_booking_id)
    )
    return holds.update(
        status=PartnerEarningHold.Status.RELEASED,
        released_at=timezone.now(),
        released_by=actor,
        release_note=note[:240],
    )


@transaction.atomic
def release_payout_hold(
    *,
    booking_id: UUID | None = None,
    rental_booking_id: UUID | None = None,
    actor: User | None = None,
    note: str = "",
) -> PartnerLedgerEntry | None:
    """Unfreeze a booking's earning once whatever held it has been decided.

    Lifts every active `PartnerEarningHold` on the booking and moves an earning written `PENDING`
    to `AVAILABLE`. Callers only reach here once nothing else is holding the booking — a case
    checks `_subject_has_other_holds` first — so lifting all of its holds is the decision, not a
    shortcut. The earning still waits out its own clearing window.
    """

    if booking_id is None and rental_booking_id is None:
        return None
    _release_earning_holds(
        booking_id=booking_id, rental_booking_id=rental_booking_id, actor=actor, note=note
    )
    qs = PartnerLedgerEntry.objects.select_for_update().filter(kind=PartnerLedgerEntry.Kind.EARNING)
    qs = (
        qs.filter(booking_id=booking_id)
        if booking_id is not None
        else qs.filter(rental_booking_id=rental_booking_id)
    )

    entry = qs.first()
    if entry is None or entry.status != PartnerLedgerEntry.Status.PENDING:
        return entry
    entry.status = PartnerLedgerEntry.Status.AVAILABLE
    entry.save(update_fields=("status", "updated_at"))
    return entry


@transaction.atomic
def record_adjustment(
    *,
    partner_id: UUID,
    corrects_id: UUID | None,
    net_paise: int,
    reason: str,
    actor: User | None,
    idempotency_key: str,
) -> PartnerLedgerEntry:
    """Correct the ledger by adding to it, never by editing it.

    The settlement document requires a "ledger reversal rather than an off-ledger cash
    adjustment" — an edited entry cannot be reconciled against the payment that produced it, and
    a cash adjustment outside the ledger cannot be reconciled at all.
    """

    if not reason.strip():
        raise PayoutBatchInvalidApiError(reason="A ledger adjustment needs a reason.")
    existing = PartnerLedgerEntry.objects.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing
    corrects = (
        PartnerLedgerEntry.objects.select_for_update().get(id=corrects_id)
        if corrects_id is not None
        else None
    )
    kind = PartnerLedgerEntry.Kind.REVERSAL if net_paise < 0 else PartnerLedgerEntry.Kind.ADJUSTMENT
    return PartnerLedgerEntry.objects.create(
        partner_id=partner_id,
        booking=None,
        kind=kind,
        status=PartnerLedgerEntry.Status.AVAILABLE,
        gross_paise=net_paise,
        commission_paise=0,
        net_paise=net_paise,
        corrects=corrects,
        reason=reason.strip(),
        created_by=actor,
        idempotency_key=idempotency_key,
    )


def payable_account(partner: PartnerProfile) -> PartnerPayoutAccount | None:
    """The Partner's account, if it is verified *and* out of its cooling period."""

    return (
        PartnerPayoutAccount.objects.filter(
            partner=partner,
            status=PartnerPayoutAccount.Status.VERIFIED,
            effective_from__lte=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )


def _reserve_partner_payout(
    *,
    batch: PayoutBatch,
    partner: PartnerProfile,
    now: datetime,
    created_from: datetime,
    created_before: datetime,
) -> PayoutBatchItem | None:
    """Reserve one transfer covering everything this Partner can be paid right now.

    Cleared, unheld earnings in the period plus every unpaid refund, summed. Nothing is reserved
    when the sum is under `PAYOUT_MINIMUM_PAISE` — including when refunds exceed earnings — or
    when the Partner has no payable account: the entries stay where they are for a later run, and
    `unpayable_partner_ids` reports the account problem.
    """

    account = payable_account(partner)
    if account is None:
        return None
    entries = list(
        payable_entries(
            partner_id=partner.id,
            now=now,
            created_from=created_from,
            created_before=created_before,
        )
        .select_for_update(of=("self",))
        .order_by("created_at", "id")
    )
    total = sum(entry.net_paise for entry in entries)
    if total < settings.PAYOUT_MINIMUM_PAISE:
        return None
    item = PayoutBatchItem.objects.create(
        batch=batch,
        partner=partner,
        payout_account=account,
        amount_paise=total,
        currency=entries[0].currency,
        idempotency_key=payout_idempotency_key(batch_id=batch.id, partner_id=partner.id),
    )
    _attach_entries(item, entries)
    return item


def _attach_entries(item: PayoutBatchItem, entries: list[PartnerLedgerEntry]) -> None:
    """Record each entry as a line of the transfer and mark it reserved.

    `payouts_one_live_line_per_ledger_entry` makes a second live reservation of any of them an
    IntegrityError, which is the real double-pay guarantee; the callers' status checks only turn
    the losing side of a race into a typed refusal.
    """

    PayoutItemEntry.objects.bulk_create(
        PayoutItemEntry(item=item, ledger_entry=entry, amount_paise=entry.net_paise)
        for entry in entries
    )
    for entry in entries:
        entry.status = PartnerLedgerEntry.Status.RESERVED
        entry.save(update_fields=("status", "updated_at"))


@transaction.atomic
def propose_payout_batch(
    *, reference: str, period_start: Any, period_end: Any, actor: User
) -> PayoutBatch:
    """Reserve one transfer per Partner into a draft batch, atomically.

    Reservation happens at proposal rather than at approval, on purpose: an approver must be
    looking at a fixed set. A batch whose contents could still change between review and payment
    is not something anyone can meaningfully approve.
    """

    if period_end <= period_start:
        raise PayoutBatchInvalidApiError(reason="A payout period must end after it starts.")
    existing = PayoutBatch.objects.filter(reference=reference).first()
    if existing is not None:
        return existing

    batch = PayoutBatch.objects.create(
        reference=reference,
        status=PayoutBatch.Status.PENDING_APPROVAL,
        period_start=period_start,
        period_end=period_end,
        proposed_by=actor,
    )

    now = timezone.now()
    total = 0
    partner_ids = partners_with_payable_earnings(
        now=now, created_from=period_start, created_before=period_end
    )
    for partner in PartnerProfile.objects.filter(id__in=partner_ids).order_by("id"):
        item = _reserve_partner_payout(
            batch=batch,
            partner=partner,
            now=now,
            created_from=period_start,
            created_before=period_end,
        )
        if item is not None:
            total += item.amount_paise

    batch.total_paise = total
    batch.save(update_fields=("total_paise", "updated_at"))
    return batch


def unpayable_partner_ids(*, period_start: Any, period_end: Any) -> list[UUID]:
    """Partners with money owed and no payable account. Reported, never silently dropped."""

    owed = partners_with_payable_earnings(
        now=timezone.now(), created_from=period_start, created_before=period_end
    )
    return [
        partner.id
        for partner in PartnerProfile.objects.filter(id__in=owed).order_by("id")
        if payable_account(partner) is None
    ]


@transaction.atomic
def approve_payout_batch(*, batch_id: UUID, expected_version: int, actor: User) -> PayoutBatch:
    """Maker-checker: the approver may not be the proposer.

    Checked here for a typed refusal, and again by `payouts_approver_is_not_the_proposer` in the
    schema so a future command that forgets cannot succeed either.
    """

    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.version != expected_version:
        raise PayoutBatchConflictApiError(current_version=batch.version)
    _refuse_withdrawal_in_run_command(batch)
    if batch.status != PayoutBatch.Status.PENDING_APPROVAL:
        raise PayoutBatchInvalidApiError(reason=f"A batch in {batch.status} cannot be approved.")
    if batch.proposed_by_id == actor.id:
        raise SelfApprovalDeniedApiError
    if not batch.items.exists():
        raise PayoutBatchInvalidApiError(reason="An empty batch has nothing to approve.")

    batch.status = PayoutBatch.Status.APPROVED
    batch.approval_basis = PayoutBatch.ApprovalBasis.OPERATIONS
    batch.approved_by = actor
    batch.approved_at = timezone.now()
    batch.version += 1
    batch.save(
        update_fields=(
            "status",
            "approval_basis",
            "approved_by",
            "approved_at",
            "version",
            "updated_at",
        )
    )
    return batch


def _refuse_withdrawal_in_run_command(batch: PayoutBatch) -> None:
    """A withdrawal is approved and sent in one step from the withdrawal queue, never as a run.

    Two paths to the same money would be two sets of rules to keep in step; refusing here keeps
    the run console from approving a withdrawal without the withdrawal checks.
    """

    if batch.kind == PayoutBatch.Kind.WITHDRAWAL:
        raise PayoutBatchInvalidApiError(
            reason="This is a Partner withdrawal. Approve or decline it from the withdrawal queue."
        )


@transaction.atomic
def cancel_payout_batch(*, batch_id: UUID, expected_version: int, actor: User) -> PayoutBatch:
    """Release every reservation back to the ledger.

    Refused once anything has been submitted to the provider: money may already be moving, and
    releasing an entry whose payout is in flight is how it gets paid twice.
    """

    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.version != expected_version:
        raise PayoutBatchConflictApiError(current_version=batch.version)
    _refuse_withdrawal_in_run_command(batch)
    if batch.status not in (
        PayoutBatch.Status.DRAFT,
        PayoutBatch.Status.PENDING_APPROVAL,
        PayoutBatch.Status.APPROVED,
    ):
        raise PayoutBatchInvalidApiError(
            reason=f"A batch in {batch.status} can no longer be cancelled."
        )

    for item in batch.items.select_for_update().filter(status=PayoutBatchItem.Status.RESERVED):
        _close_item(item, status=PayoutBatchItem.Status.RELEASED, failure_code="batch_cancelled")

    batch.status = PayoutBatch.Status.CANCELLED
    batch.cancelled_by = actor
    batch.cancelled_at = timezone.now()
    batch.version += 1
    batch.save(update_fields=("status", "cancelled_by", "cancelled_at", "version", "updated_at"))
    return batch


@transaction.atomic
def reserve_entry_for_batch(*, batch: PayoutBatch, entry: PartnerLedgerEntry) -> PayoutBatchItem:
    """Reserve one positive entry into its Partner's transfer in this batch.

    The same rules as a run: the entry must be unpaid, cleared and not on hold. Joins the
    Partner's existing reserved transfer in the batch when there is one, so a batch still holds
    one transfer per Partner. The `IntegrityError` from `payouts_one_live_line_per_ledger_entry`
    is the real guarantee; the status check turns the second-place caller's crash into a typed
    refusal instead.
    """

    locked = PartnerLedgerEntry.objects.select_for_update().get(id=entry.id)
    if locked.status not in RESERVABLE_STATUSES:
        raise LedgerEntryNotPayableApiError(current_status=locked.status)
    if locked.net_paise <= 0:
        raise LedgerEntryNotPayableApiError(current_status="not_a_payment")
    now = timezone.now()
    if not payable_entries(partner_id=locked.partner_id, now=now).filter(id=locked.id).exists():
        raise LedgerEntryNotPayableApiError(current_status="held_or_clearing")
    account = payable_account(locked.partner)
    if account is None:
        raise LedgerEntryNotPayableApiError(current_status="no_payable_account")

    item = (
        PayoutBatchItem.objects.select_for_update()
        .filter(batch=batch, partner_id=locked.partner_id, status=PayoutBatchItem.Status.RESERVED)
        .first()
    )
    if item is None:
        item = PayoutBatchItem.objects.create(
            batch=batch,
            partner_id=locked.partner_id,
            payout_account=account,
            amount_paise=locked.net_paise,
            currency=locked.currency,
            idempotency_key=payout_idempotency_key(batch_id=batch.id, partner_id=locked.partner_id),
        )
    else:
        item.amount_paise += locked.net_paise
        item.save(update_fields=("amount_paise", "updated_at"))
    _attach_entries(item, [locked])
    return item


def partner_balance_paise(partner: PartnerProfile) -> dict[str, int]:
    """What a Partner is owed, by state — see `apps.payouts.selectors` for the rules."""

    balance = partner_balance(partner_id=partner.id, now=timezone.now())
    return {
        "pending_paise": balance.pending_paise,
        "available_paise": balance.available_paise,
        "clearing_paise": balance.clearing_paise,
        "held_paise": balance.held_paise,
        "withdrawable_paise": balance.withdrawable_paise,
        "reserved_paise": balance.reserved_paise,
        "paid_paise": balance.paid_paise,
    }


@transaction.atomic
def register_payout_account(
    *,
    partner_id: UUID,
    account_last4: str,
    ifsc: str,
    holder_name: str,
    actor: User | None = None,
    provider_contact_id: str = "",
    provider_fund_account_id: str = "",
) -> PartnerPayoutAccount:
    """Replace a Partner's account, starting the cooling clock.

    The previous account is marked `REPLACED` rather than deleted: a payout that already went
    through it must stay explicable.
    """

    PartnerPayoutAccount.objects.select_for_update().filter(
        partner_id=partner_id,
        status__in=(PartnerPayoutAccount.Status.PENDING, PartnerPayoutAccount.Status.VERIFIED),
    ).update(status=PartnerPayoutAccount.Status.REPLACED)

    return PartnerPayoutAccount.objects.create(
        partner_id=partner_id,
        account_last4=account_last4,
        ifsc=ifsc,
        holder_name=holder_name,
        provider_contact_id=provider_contact_id,
        provider_fund_account_id=provider_fund_account_id,
        effective_from=timezone.now() + timedelta(hours=settings.PAYOUT_ACCOUNT_COOLING_HOURS),
        created_by=actor,
    )


def submit_partner_payout_account(
    *,
    partner: PartnerProfile,
    account_number: str,
    ifsc: str,
    holder_name: str,
    actor: User,
) -> PartnerPayoutAccount:
    """A Partner adds or changes their bank account. It is `PENDING` until Operations verifies it.

    The provider is called before anything is written, and outside a transaction: a slow
    provider must not hold row locks, and a refused or unreachable provider leaves nothing
    behind. The full account number goes to the provider and nowhere else — only its last four
    digits and the provider's ids are stored.

    Replacing a verified account makes the Partner unpayable until the new one is verified and
    out of its cooling period. That is the takeover control working, not a side effect.
    """

    try:
        provider = get_payout_account_provider()
    except PayoutProviderError as exc:
        raise PayoutAccountsUnavailableApiError() from exc
    try:
        contact_id = provider.create_contact(name=holder_name, reference_id=str(partner.id))
        fund_account_id = provider.create_fund_account(
            contact_id=contact_id,
            holder_name=holder_name,
            ifsc=ifsc,
            account_number=account_number,
        )
    except PayoutProviderRejectedError as exc:
        raise PayoutAccountRejectedApiError() from exc
    except PayoutProviderAmbiguousError as exc:
        raise PayoutAccountProviderApiError() from exc

    return register_payout_account(
        partner_id=partner.id,
        account_last4=account_number[-4:],
        ifsc=ifsc,
        holder_name=holder_name,
        actor=actor,
        provider_contact_id=contact_id,
        provider_fund_account_id=fund_account_id,
    )


def _pending_account_for_review(*, account_id: UUID, actor: User) -> PartnerPayoutAccount:
    account = PartnerPayoutAccount.objects.select_for_update().get(id=account_id)
    if account.status != PartnerPayoutAccount.Status.PENDING:
        raise PayoutAccountReviewInvalidApiError(
            reason=f"This account is {account.get_status_display().lower()}, not awaiting review."
        )
    if account.created_by_id is not None and account.created_by_id == actor.id:
        raise PayoutAccountSelfReviewApiError()
    return account


@transaction.atomic
def verify_payout_account(*, account_id: UUID, actor: User) -> PartnerPayoutAccount:
    """Operations confirms the details. Payable once `effective_from` has also passed.

    Verifying does not shorten the cooling period: it started when the account was registered,
    and a reviewer agreeing with the details is a separate control from time passing.
    """

    account = _pending_account_for_review(account_id=account_id, actor=actor)
    if not account.provider_fund_account_id:
        raise PayoutAccountReviewInvalidApiError(
            reason="This account was never registered with the payout provider. "
            "Ask the Partner to enter their bank details again."
        )
    account.status = PartnerPayoutAccount.Status.VERIFIED
    account.verified_at = timezone.now()
    account.reviewed_by = actor
    account.save(update_fields=("status", "verified_at", "reviewed_by", "updated_at"))
    return account


@transaction.atomic
def reject_payout_account(*, account_id: UUID, actor: User, reason: str) -> PartnerPayoutAccount:
    """Operations refuses the details. The Partner sees `reason` and can enter them again."""

    account = _pending_account_for_review(account_id=account_id, actor=actor)
    account.status = PartnerPayoutAccount.Status.REJECTED
    account.reviewed_by = actor
    account.rejection_reason = reason
    account.save(update_fields=("status", "reviewed_by", "rejection_reason", "updated_at"))
    return account


#: Item statuses that are finished with their entries: the money is back in the Partner's pool.
_RELEASING_STATUSES = (
    PayoutBatchItem.Status.FAILED,
    PayoutBatchItem.Status.RELEASED,
    PayoutBatchItem.Status.REVERSED,
)
#: Item statuses whose provider outcome is still open.
_OPEN_STATUSES = (
    PayoutBatchItem.Status.RESERVED,
    PayoutBatchItem.Status.SUBMITTING,
    PayoutBatchItem.Status.SUBMITTED,
    PayoutBatchItem.Status.UNDER_REVIEW,
)


def _live_entry_ids(item: PayoutBatchItem) -> list[UUID]:
    return list(item.entries.filter(is_live=True).values_list("ledger_entry_id", flat=True))


def _close_item(item: PayoutBatchItem, *, status: str, failure_code: str) -> None:
    """Finish a transfer whose money did not stay out, returning every entry to the pool once.

    For a transfer never sent (refused at the last check, batch cancelled), one the provider
    refused, and one paid and then reversed by the bank. The caller holds the item's lock and has
    checked the transition, and the lines stop being live in the same step, which is what makes
    the return happen exactly once however often the provider repeats itself.
    """

    item.status = status
    item.failure_code = failure_code
    item.completed_at = timezone.now()
    item.save(update_fields=("status", "failure_code", "completed_at", "updated_at"))
    entry_ids = _live_entry_ids(item)
    item.entries.filter(is_live=True).update(is_live=False)
    for entry in PartnerLedgerEntry.objects.select_for_update().filter(
        id__in=entry_ids,
        status__in=(PartnerLedgerEntry.Status.RESERVED, PartnerLedgerEntry.Status.PAID),
    ):
        entry.status = PartnerLedgerEntry.Status.RELEASED
        entry.save(update_fields=("status", "updated_at"))
        if entry.kind == PartnerLedgerEntry.Kind.FEE:
            _refund_withdrawal_fee(item, entry)


def _refund_withdrawal_fee(item: PayoutBatchItem, fee: PartnerLedgerEntry) -> None:
    """Give back the fee of a withdrawal whose money did not stay out.

    The fee went back to the pool with every other line, where on its own it would come off the
    Partner's next payout. A correcting entry of the same size cancels it, so a failed, declined
    or reversed withdrawal costs the Partner nothing — and the ledger still shows both lines
    rather than an edited one. Once per fee and transfer, however often the provider repeats
    itself.
    """

    record_adjustment(
        partner_id=fee.partner_id,
        corrects_id=fee.id,
        net_paise=-fee.net_paise,
        reason=f"withdrawal_fee_refund:{item.failure_code or item.status.lower()}",
        actor=None,
        idempotency_key=f"withdrawal-fee-refund:{fee.id}:{item.id}",
    )


def _pre_send_refusal(item: PayoutBatchItem) -> str:
    """Why this transfer must not be sent right now, checked at the last moment; empty if it may.

    Approval can come hours before payment. In between, payouts can be switched off, the Partner
    suspended, their bank account replaced or rejected, or a dispute opened on a visit inside the
    transfer. Each is a reason the money must not leave, and each is far cheaper to catch here
    than to recover from a bank afterwards.
    """

    if is_engaged(KillSwitch.Scope.PAYOUTS):
        return "payouts_paused"
    if item.is_withdrawal and not settings.PAYOUT_WITHDRAW_ENABLED:
        # Switching withdrawals off stops the ones not yet sent, not only new taps.
        return "withdrawals_disabled"
    if _partner_is_suspended(item.partner_id):
        return "partner_suspended"
    account = item.payout_account
    if (
        account.status != PartnerPayoutAccount.Status.VERIFIED
        or account.effective_from > timezone.now()
    ):
        return "account_not_payable"
    held = with_hold_flags(PartnerLedgerEntry.objects.filter(id__in=_live_entry_ids(item)))
    if held.filter(ON_HOLD).exists():
        return "earning_on_hold"
    return ""


@dataclass(frozen=True, slots=True)
class _ClaimedPayout:
    """Everything the provider call needs, read while the item was locked and then let go."""

    item_id: UUID
    fund_account_id: str
    amount_paise: int
    currency: str
    idempotency_key: str
    batch_reference: str


@transaction.atomic
def _claim_for_sending(item_id: UUID) -> _ClaimedPayout | None:
    """Step one: re-check a reserved transfer and claim it, committing before the call is made.

    Returns None when there is nothing to send — it was already claimed, or it may no longer be
    sent and has just been released unsent (`_pre_send_refusal`), its money back in the pool.
    `SUBMITTING` is committed before the provider is called, so a second worker, a re-queued job
    or `resume_payout_submissions` finds it taken and does nothing.
    """

    item = (
        PayoutBatchItem.objects.select_for_update()
        .select_related("payout_account", "batch")
        .get(id=item_id)
    )
    if item.status != PayoutBatchItem.Status.RESERVED:
        return None
    refusal = _pre_send_refusal(item)
    if refusal:
        _close_item(item, status=PayoutBatchItem.Status.RELEASED, failure_code=refusal)
        _settle_batch_if_complete(item.batch_id)
        return None
    item.status = PayoutBatchItem.Status.SUBMITTING
    item.submitted_at = timezone.now()
    item.save(update_fields=("status", "submitted_at", "updated_at"))
    return _ClaimedPayout(
        item_id=item.id,
        fund_account_id=item.payout_account.provider_fund_account_id,
        amount_paise=item.amount_paise,
        currency=item.currency,
        idempotency_key=item.idempotency_key,
        batch_reference=item.batch.reference,
    )


def _claimed(item_id: UUID) -> PayoutBatchItem | None:
    """The item, locked, if it is still waiting for this send's answer; else None.

    A webhook can settle a payout while the call that created it is still returning — RazorpayX
    sometimes delivers `payout.processed` first. Then the webhook's outcome stands and the answer
    only adds what the webhook could not know, such as the provider id.
    """

    item = PayoutBatchItem.objects.select_for_update().get(id=item_id)
    return item if item.status == PayoutBatchItem.Status.SUBMITTING else None


@transaction.atomic
def _record_accepted(item_id: UUID, result: ProviderPayout) -> PayoutBatchItem:
    item = _claimed(item_id)
    if item is None:
        item = PayoutBatchItem.objects.select_for_update().get(id=item_id)
        changed = _record_tracking(item, result)
        if result.provider_payout_id and not item.provider_payout_id:
            item.provider_payout_id = result.provider_payout_id
            changed.append("provider_payout_id")
        if changed:
            item.save(update_fields=(*changed, "updated_at"))
        return item
    tracked = _record_tracking(item, result)
    item.status = PayoutBatchItem.Status.SUBMITTED
    item.provider_payout_id = result.provider_payout_id
    item.save(update_fields=("status", "provider_payout_id", *tracked, "updated_at"))
    return item


@transaction.atomic
def _record_rejected(item_id: UUID, exc: PayoutProviderRejectedError) -> PayoutBatchItem:
    item = _claimed(item_id)
    if item is None:
        return PayoutBatchItem.objects.get(id=item_id)
    _close_item(item, status=PayoutBatchItem.Status.FAILED, failure_code=_rejection_code(exc))
    _settle_batch_if_complete(item.batch_id)
    return item


@transaction.atomic
def _record_ambiguous(item_id: UUID) -> PayoutBatchItem:
    item = _claimed(item_id)
    if item is None:
        return PayoutBatchItem.objects.get(id=item_id)
    item.status = PayoutBatchItem.Status.UNDER_REVIEW
    item.failure_code = "provider_ambiguous"
    item.save(update_fields=("status", "failure_code", "updated_at"))
    return item


def submit_payout_item(*, item_id: UUID) -> PayoutBatchItem:
    """Send one reserved transfer to the provider, exactly once, holding no lock while it goes.

    Three steps, each its own commit: claim (`_claim_for_sending`), call the provider outside
    any transaction, record the answer. A slow RazorpayX therefore holds no row locks, and a
    process that dies between the claim and the answer leaves the item `SUBMITTING`, which
    `reconcile_payouts` later looks up by reference — it is never sent a second time.

    The provider is resolved before anything is claimed, so a misconfigured one leaves the item
    reserved for a later attempt instead of claimed and unsendable. Then the three outcomes,
    which are not symmetrical, and the asymmetry is the whole point:

    * **Accepted** — the item is `SUBMITTED` and its entries stay reserved.
    * **Rejected** — the provider explicitly refused, so no money moved. The item fails and its
      entries go back to the pool, where a later batch can pick them up.
    * **Ambiguous** — a timeout, a reset, a 5xx. The payout *may* have gone out. The item parks
      at `UNDER_REVIEW` and its entries stay reserved, because releasing them here is precisely
      how a Partner gets paid twice. `reconcile_payouts` settles it by asking the provider what
      it has under the item's reference — never by sending it again.

    Call it outside a transaction. Inside one, the claim is not committed before the call, and
    the lock-free send is lost (though it still pays exactly once).
    """

    provider = get_payout_provider()
    claimed = _claim_for_sending(item_id)
    if claimed is None:
        return PayoutBatchItem.objects.get(id=item_id)
    try:
        result = provider.create_payout(
            fund_account_id=claimed.fund_account_id,
            amount_paise=claimed.amount_paise,
            currency=claimed.currency,
            # The item id alone, as 32 hex characters: RazorpayX caps `reference_id` at 40, and
            # the old "<batch reference>:<item id>" was 37 at the very least. Still unique per
            # payout, which is what reconciliation needs; the run travels in the notes instead.
            reference=claimed.item_id.hex,
            idempotency_key=claimed.idempotency_key,
            batch_reference=claimed.batch_reference,
        )
    except PayoutProviderRejectedError as exc:
        return _record_rejected(claimed.item_id, exc)
    except PayoutProviderError:
        # Ambiguous, or any other provider failure after the request may have left: unknown.
        return _record_ambiguous(claimed.item_id)
    return _record_accepted(claimed.item_id, result)


#: Provider outcomes reduced to ours. Reduction lives here rather than in the adapter so there is
#: one place the payout state machine is decided. Anything not listed — `queued`, `pending`,
#: `processing` — is still in flight: tracked, never decided on.
_PROVIDER_OUTCOMES: dict[str, str] = {
    "processed": PayoutBatchItem.Status.PAID,
    "reversed": PayoutBatchItem.Status.REVERSED,
    "cancelled": PayoutBatchItem.Status.FAILED,
    "rejected": PayoutBatchItem.Status.FAILED,
    "failed": PayoutBatchItem.Status.FAILED,
}

#: Where each provider status sits in RazorpayX's lifecycle, so tracking only moves forward: a
#: `processing` delivered late after `processed` leaves `provider_status` saying `processed`.
_PROVIDER_STATUS_RANK: dict[str, int] = {
    "queued": 1,
    "pending": 1,
    "scheduled": 1,
    "processing": 2,
    "processed": 3,
    "reversed": 4,
    "failed": 4,
    "rejected": 4,
    "cancelled": 4,
}


def _next_status(current: str, provider_status: str) -> str | None:
    """The one place a payout's decided status moves, and it only ever moves forward.

    An open item takes any final outcome. A paid item can still be reversed — RazorpayX allows a
    bank to return a processed payout up to T+3 working days later — and nothing else. Failed,
    reversed and released are final: a `processed` arriving after a `reversed` is a late
    out-of-order delivery of an earlier state, and must not pay out money that came back.
    """

    outcome = _PROVIDER_OUTCOMES.get(provider_status)
    if outcome is None:
        return None
    if current in _OPEN_STATUSES:
        return outcome
    if current == PayoutBatchItem.Status.PAID and outcome == PayoutBatchItem.Status.REVERSED:
        return outcome
    return None


def _record_tracking(item: PayoutBatchItem, payout: ProviderPayout) -> list[str]:
    """Copy the provider's tracking data onto the item; return the fields that changed.

    Never decides anything, and never moves backwards: an older status does not overwrite a newer
    one, and an empty UTR does not erase a known one.
    """

    changed: list[str] = []
    rank = _PROVIDER_STATUS_RANK.get(payout.status, 0)
    if (
        payout.status
        and rank >= _PROVIDER_STATUS_RANK.get(item.provider_status, 0)
        and item.provider_status != payout.status[:24]
    ):
        item.provider_status = payout.status[:24]
        changed.append("provider_status")
    text_fields = (
        ("utr", payout.utr),
        ("mode", payout.mode),
        ("status_reason", payout.status_reason),
    )
    for name, text in text_fields:
        if text and getattr(item, name) != text:
            setattr(item, name, text)
            changed.append(name)
    amount_fields = (("fees_paise", payout.fees_paise), ("tax_paise", payout.tax_paise))
    for name, amount in amount_fields:
        if amount is not None and getattr(item, name) != amount:
            setattr(item, name, amount)
            changed.append(name)
    return changed


@transaction.atomic
def apply_payout_result(
    *,
    item_id: UUID,
    status: str,
    failure_reason: str = "",
    tracking: ProviderPayout | None = None,
) -> PayoutBatchItem:
    """Settle one transfer from a webhook or a reconciliation poll.

    Only final outcomes decide anything, and only forward (`_next_status`). Paid moves the
    entries to `PAID`. Failed, cancelled or rejected — and reversed after being paid — return
    them to the pool exactly once (`_close_item`). Duplicates and late deliveries change nothing
    but tracking data.
    """

    item = PayoutBatchItem.objects.select_for_update().get(id=item_id)
    tracked = _record_tracking(
        item,
        tracking
        or ProviderPayout(
            provider_payout_id=item.provider_payout_id,
            amount_paise=item.amount_paise,
            currency=item.currency,
            status=status,
        ),
    )
    if tracked:
        item.save(update_fields=(*tracked, "updated_at"))
    target = _next_status(item.status, status)
    if target is None:
        if (
            _PROVIDER_OUTCOMES.get(status) == PayoutBatchItem.Status.PAID
            and item.status in _RELEASING_STATUSES
        ):
            # Money the ledger already put back says it went out after all. Never applied
            # automatically — that is how a Partner gets paid twice — but loud enough to chase.
            logger.warning(
                "Payout reported processed after it was closed",
                extra={"payout_item_id": str(item.id), "item_status": item.status},
            )
        return item

    if target == PayoutBatchItem.Status.PAID:
        item.status = target
        item.failure_code = ""
        item.completed_at = timezone.now()
        item.save(update_fields=("status", "failure_code", "completed_at", "updated_at"))
        for entry in PartnerLedgerEntry.objects.select_for_update().filter(
            id__in=_live_entry_ids(item), status=PartnerLedgerEntry.Status.RESERVED
        ):
            entry.status = PartnerLedgerEntry.Status.PAID
            entry.save(update_fields=("status", "updated_at"))
    else:
        _close_item(item, status=target, failure_code=_failure_code(failure_reason or status))
    _settle_batch_if_complete(item.batch_id)
    return item


#: Sent, or possibly sent, with no settled outcome: what reconciliation asks the provider about.
#: `SUBMITTING` is here for a send whose process died before recording the answer.
_UNCONFIRMED_STATUSES = (
    PayoutBatchItem.Status.SUBMITTING,
    PayoutBatchItem.Status.SUBMITTED,
    PayoutBatchItem.Status.UNDER_REVIEW,
)


@transaction.atomic
def settle_unconfirmed_payout(*, item_id: UUID, found: ProviderPayout | None) -> PayoutBatchItem:
    """Resolve a transfer whose submission got no clear answer, from what the provider holds.

    `found` is the provider's payout under the item's reference, or None if it has none. Found:
    record its id and apply its status like any other result. Not found, and the submission is
    older than `PAYOUT_AMBIGUOUS_RELEASE_HOURS`: the provider never received it, so no money
    moved, and the entries go back to the pool. Not found but recent: leave it — a lookup is
    allowed to be early, and nothing is ever sent a second time.
    """

    item = PayoutBatchItem.objects.select_for_update().get(id=item_id)
    if item.status not in _UNCONFIRMED_STATUSES:
        return item
    if found is not None:
        if not item.provider_payout_id:
            item.provider_payout_id = found.provider_payout_id
            item.save(update_fields=("provider_payout_id", "updated_at"))
        return apply_payout_result(
            item_id=item.id,
            status=found.status,
            failure_reason=found.failure_reason,
            tracking=found,
        )
    sent_at = item.submitted_at or item.created_at
    if timezone.now() - sent_at < timedelta(hours=settings.PAYOUT_AMBIGUOUS_RELEASE_HOURS):
        return item
    _close_item(item, status=PayoutBatchItem.Status.FAILED, failure_code="provider_never_received")
    _settle_batch_if_complete(item.batch_id)
    return item


def _failure_code(text: str) -> str:
    """Provider failure text reduced to the 80-character slug `failure_code` holds.

    RazorpayX reports reasons as sentences ("Beneficiary bank is offline, please retry"). Stored
    as given, a long one is a database error raised while settling a payout.
    """

    return slugify(text)[:80] or "provider_failed"


def _rejection_code(exc: PayoutProviderRejectedError) -> str:
    """Why the provider refused, as a slug: its reason (or description), then the field it named.

    `input_validation_failed-reference_id` tells Operations what to fix; `provider_rejected`, the
    only value this used to record, told them nothing. Falls back to it when the provider gave no
    reason at all.
    """

    detail = exc.detail
    text = " ".join(
        part for part in (detail.reason or detail.description or detail.code, detail.field) if part
    )
    return _failure_code(text) if text else "provider_rejected"


def _mapping(value: object) -> Mapping[str, object]:
    return value if isinstance(value, Mapping) else {}


def _item_for_provider_payout(*, provider_payout_id: str, reference: str) -> PayoutBatchItem | None:
    if provider_payout_id:
        item = PayoutBatchItem.objects.filter(provider_payout_id=provider_payout_id).first()
        if item is not None:
            return item
    # `submit_payout_item` sends the item id as 32 hex characters. A webhook can arrive before
    # that submission has committed the provider id, or after an ambiguous submission never
    # learned it, and the reference still names the item. The split keeps the older
    # "<batch reference>:<item id>" form readable too.
    try:
        item_id = UUID(reference.rsplit(":", 1)[-1])
    except ValueError:
        return None
    return PayoutBatchItem.objects.filter(id=item_id).first()


def _tracking_from_entity(entity: Mapping[str, object], status: str) -> ProviderPayout:
    try:
        return RazorpayXPayoutProvider.parse_payout(dict(entity))
    except PayoutProviderError:
        # A webhook missing the id or amount still says what happened, and why; it just tracks
        # less.
        details = _mapping(entity.get("status_details"))
        return ProviderPayout(
            provider_payout_id=str(entity.get("id") or ""),
            amount_paise=0,
            currency="INR",
            status=status,
            failure_reason=str(entity.get("failure_reason") or details.get("reason") or ""),
        )


@transaction.atomic
def apply_razorpayx_payout_event(
    event: Mapping[str, object], *, event_id: str, payload_sha256: str
) -> PayoutBatchItem | None:
    """Settle a transfer from a verified RazorpayX `payout.*` webhook, once per delivery.

    Every payout event is recorded in `PayoutWebhookEvent` under the provider's event id, so a
    redelivery is recognised and changes nothing. Final outcomes go through
    `apply_payout_result`, which only moves forward; `payout.updated` and in-flight statuses only
    refresh tracking data such as the UTR. Everything that is not a payout event is acknowledged
    and ignored, and `reconcile_payouts` remains the backstop for a webhook that never arrives.
    """

    name = event.get("event")
    if not isinstance(name, str) or not name.startswith("payout."):
        return None
    entity = _mapping(_mapping(_mapping(event.get("payload")).get("payout")).get("entity"))
    provider_payout_id = str(entity.get("id") or "")
    status = str(entity.get("status") or "")
    tracking = _tracking_from_entity(entity, status)
    record, created = PayoutWebhookEvent.objects.get_or_create(
        provider_event_id=event_id,
        defaults={
            "event_type": name[:64],
            "provider_payout_id": provider_payout_id[:128],
            "provider_status": status[:24],
            "payload_sha256": payload_sha256,
            # A summary, not the payload: a payout entity can embed the fund account.
            "summary": {
                "status": status,
                "amount": entity.get("amount"),
                "reference_id": entity.get("reference_id"),
                "utr": tracking.utr,
                "mode": tracking.mode,
                "status_reason": tracking.status_reason,
            },
        },
    )
    if not created or not status:
        return None

    candidate = _item_for_provider_payout(
        provider_payout_id=provider_payout_id, reference=str(entity.get("reference_id") or "")
    )
    if candidate is None:
        return None
    item = PayoutBatchItem.objects.select_for_update().get(id=candidate.id)
    if provider_payout_id and not item.provider_payout_id:
        item.provider_payout_id = provider_payout_id
        item.save(update_fields=("provider_payout_id", "updated_at"))
    before = item.status
    result = apply_payout_result(
        item_id=item.id, status=status, failure_reason=tracking.failure_reason, tracking=tracking
    )
    record.payout_item = result
    record.changed_status = result.status != before
    record.save(update_fields=("payout_item", "changed_status"))
    return result


def _settle_batch_if_complete(batch_id: UUID) -> None:
    """A batch is finished when no transfer in it is still moving.

    `FAILED` does not make the batch failed — one rejected account among two hundred successful
    payouts is an exception to chase, not a batch to redo. `PAID` means every transfer reached a
    final state and at least one was paid. A transfer reversed after the batch finished leaves
    the batch as it was; the reversal is on the transfer, and its money is back in the pool.
    """

    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.status in (PayoutBatch.Status.PAID, PayoutBatch.Status.CANCELLED):
        return
    in_flight = batch.items.exclude(
        status__in=(PayoutBatchItem.Status.PAID, *_RELEASING_STATUSES)
    ).exists()
    if in_flight:
        return
    paid = batch.items.filter(status=PayoutBatchItem.Status.PAID).exists()
    batch.status = PayoutBatch.Status.PAID if paid else PayoutBatch.Status.FAILED
    batch.version += 1
    batch.save(update_fields=("status", "version", "updated_at"))


@transaction.atomic
def start_paying_batch(*, batch_id: UUID, expected_version: int) -> PayoutBatch:
    """Move an approved batch into payment. Submission itself is per item and asynchronous."""

    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.version != expected_version:
        raise PayoutBatchConflictApiError(current_version=batch.version)
    _refuse_withdrawal_in_run_command(batch)
    if batch.status != PayoutBatch.Status.APPROVED:
        raise PayoutBatchInvalidApiError(
            reason=f"A batch in {batch.status} has not been approved for payment."
        )
    batch.status = PayoutBatch.Status.PAYING
    batch.version += 1
    batch.save(update_fields=("status", "version", "updated_at"))
    _request_submissions(batch)
    return batch


def _request_submissions(batch: PayoutBatch) -> None:
    """Queue every reserved transfer in a batch now paying, through the outbox.

    The outbox only hands the item to `send_payout_item` after commit; the provider call itself
    runs outside every transaction (`submit_payout_item`).
    """

    for item in batch.items.filter(status=PayoutBatchItem.Status.RESERVED):
        enqueue_outbox_event(
            aggregate_type="payout_item",
            aggregate_id=item.id,
            event_type="payout.submission_requested",
            idempotency_key=f"payout-submit:{item.id}",
            payload={"payout_item_id": str(item.id)},
        )


def reverse_booking_earning_for_refund(
    *, booking_id: UUID, refund_id: UUID, actor: User | None
) -> PartnerLedgerEntry | None:
    """Append a REVERSAL for a settled EARNING after a refund succeeds.

    Idempotent on `(refund_id, earning.id)`. No-op when the booking was never settled.
    """
    earning = PartnerLedgerEntry.objects.filter(
        booking_id=booking_id, kind=PartnerLedgerEntry.Kind.EARNING
    ).first()
    if earning is None:
        return None
    if earning.net_paise == 0:
        return None

    return record_adjustment(
        partner_id=earning.partner_id,
        corrects_id=earning.id,
        net_paise=-earning.net_paise,
        reason=f"refund_reversal:{refund_id}",
        actor=actor,
        idempotency_key=f"refund-reversal:{refund_id}:{earning.id}",
    )


# --------------------------------------------------------------------------------------------
# Partner withdrawals
#
# A withdrawal is a one-Partner `PayoutBatch` of kind `WITHDRAWAL`. It reserves the same entries
# a run would (`payable_entries`, no period), is sent by the same `submit_payout_item` and settled
# by the same webhook and reconciliation, so the double-pay index, the last-moment checks and the
# forward-only state machine all hold for it without a second copy. What is new is only the
# rules about *when* a Partner may take their money, and those live here.
# --------------------------------------------------------------------------------------------

#: The day and week the withdrawal limits count in, whatever `TIME_ZONE` is set to.
_INDIA = ZoneInfo("Asia/Kolkata")

#: Why a withdrawal waits for Operations instead of being sent by policy.
REVIEW_FIRST_PAYOUT_TO_ACCOUNT = "first_payout_to_account"
REVIEW_OVER_MAXIMUM = "over_maximum"
WITHDRAWAL_REVIEW_REASONS = (REVIEW_FIRST_PAYOUT_TO_ACCOUNT, REVIEW_OVER_MAXIMUM)

#: Every reason a Withdraw tap is refused, in the order they are checked.
WITHDRAWAL_REFUSAL_REASONS = (
    "withdrawals_disabled",
    "payouts_paused",
    "partner_suspended",
    "no_payout_account",
    "account_under_review",
    "account_rejected",
    "account_cooling",
    "withdrawal_in_progress",
    "daily_limit_reached",
    "below_minimum",
    "extra_withdrawals_unavailable",
)


def _rupees(paise: int) -> str:
    return f"₹{paise // 100:,}" if paise % 100 == 0 else f"₹{paise / 100:,.2f}"


def withdrawal_refusal_message(reason: str) -> str:
    """What the Partner is told when a Withdraw tap is refused: what happened and what to do."""

    messages = {
        "withdrawals_disabled": (
            "Withdrawals are not open yet. Your balance is paid in the regular payout."
        ),
        "payouts_paused": (
            "Payouts are paused for a short while. Your balance is safe. Please try again later."
        ),
        "partner_suspended": (
            "Your account is on hold, so money cannot be withdrawn right now. "
            "Please contact support."
        ),
        "no_payout_account": "Add your bank account to withdraw.",
        "account_under_review": (
            "Your bank account is being checked. You can withdraw once it is verified."
        ),
        "account_rejected": "Your bank details were not accepted. Enter them again to withdraw.",
        "account_cooling": (
            "For your safety, a new bank account waits "
            f"{settings.PAYOUT_ACCOUNT_COOLING_HOURS} hours before money can be sent to it."
        ),
        "withdrawal_in_progress": (
            "A withdrawal is already on its way. You can withdraw again once it is paid."
        ),
        "daily_limit_reached": (
            f"You can withdraw {settings.PAYOUT_WITHDRAWALS_PER_DAY} times a day. "
            "Please try again tomorrow."
        ),
        "below_minimum": (
            "You can withdraw once your available balance reaches "
            f"{_rupees(settings.PAYOUT_WITHDRAWAL_MIN_PAISE)}."
        ),
        "extra_withdrawals_unavailable": (
            "You have used this week's withdrawal. You can withdraw again from Monday."
        ),
    }
    return messages[reason]


@dataclass(frozen=True, slots=True)
class WithdrawalQuote:
    """What one Withdraw tap would do right now, by the same rules the request applies."""

    #: Empty when the withdrawal may go ahead; otherwise one of `WITHDRAWAL_REFUSAL_REASONS`.
    refusal: str
    #: The whole available balance a withdrawal takes. Full balance only, never a part of it.
    amount_paise: int
    #: What this withdrawal costs the Partner: 0 for the week's free ones.
    fee_paise: int
    #: Non-empty when it would wait for Operations instead of being sent at once.
    review_reasons: tuple[str, ...]
    account: PartnerPayoutAccount | None
    withdrawals_left_today: int
    free_withdrawals_left_this_week: int

    @property
    def send_paise(self) -> int:
        """What reaches the bank account: the balance less the fee."""

        return self.amount_paise - self.fee_paise


def _withdrawal_windows(now: datetime) -> tuple[datetime, datetime]:
    """Midnight today and midnight last Monday, India time: where the two limits start counting."""

    local = timezone.localtime(now, _INDIA)
    day = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return day, day - timedelta(days=local.weekday())


def _counted_withdrawals(partner_id: UUID, *, since: datetime) -> int:
    """Withdrawals since `since` whose money left or still may. One that failed, was declined or
    came back from the bank cost the Partner nothing, so it does not count against a limit."""

    return (
        PayoutBatchItem.objects.filter(
            partner_id=partner_id, is_withdrawal=True, created_at__gte=since
        )
        .exclude(status__in=_RELEASING_STATUSES)
        .count()
    )


def _current_payout_account(partner_id: UUID) -> PartnerPayoutAccount | None:
    return (
        PartnerPayoutAccount.objects.filter(partner_id=partner_id)
        .exclude(status=PartnerPayoutAccount.Status.REPLACED)
        .order_by("-created_at")
        .first()
    )


def _partner_is_suspended(partner_id: UUID) -> bool:
    return PartnerApplication.objects.filter(
        partner_id=partner_id,
        status__in=(PartnerApplication.Status.SUSPENDED, PartnerApplication.Status.OFFBOARDED),
    ).exists()


def _account_refusal(account: PartnerPayoutAccount | None, now: datetime) -> str:
    if account is None:
        return "no_payout_account"
    if account.status == PartnerPayoutAccount.Status.PENDING:
        return "account_under_review"
    if account.status != PartnerPayoutAccount.Status.VERIFIED:
        return "account_rejected"
    if account.effective_from > now:
        # The cooling period: the time a Partner has to notice a bank-account change they did
        # not make, before any money can follow it.
        return "account_cooling"
    return ""


def _withdrawal_refusal(  # noqa: PLR0911 - one return per rule, in the order they are checked
    *,
    partner_id: UUID,
    account: PartnerPayoutAccount | None,
    now: datetime,
    amount_paise: int,
    left_today: int,
    fee_paise: int,
) -> str:
    if not settings.PAYOUT_WITHDRAW_ENABLED:
        return "withdrawals_disabled"
    if is_engaged(KillSwitch.Scope.PAYOUTS):
        return "payouts_paused"
    if _partner_is_suspended(partner_id):
        return "partner_suspended"
    if refusal := _account_refusal(account, now):
        return refusal
    if PayoutBatchItem.objects.filter(
        partner_id=partner_id, is_withdrawal=True, status__in=_OPEN_STATUSES
    ).exists():
        return "withdrawal_in_progress"
    if left_today <= 0:
        return "daily_limit_reached"
    if amount_paise < settings.PAYOUT_WITHDRAWAL_MIN_PAISE:
        return "below_minimum"
    if fee_paise < 0:
        # `WITHDRAWAL_FEE_UNSET`: nobody has chosen a price for an extra withdrawal, so there is
        # none rather than one made up here.
        return "extra_withdrawals_unavailable"
    return ""


def _review_reasons(account: PartnerPayoutAccount, amount_paise: int) -> tuple[str, ...]:
    reasons: list[str] = []
    if not PayoutBatchItem.objects.filter(
        payout_account=account, status=PayoutBatchItem.Status.PAID
    ).exists():
        # A takeover's first payout goes to a new account. Cooling buys time to notice; a person
        # looking at the first one is what catches it if nobody did.
        reasons.append(REVIEW_FIRST_PAYOUT_TO_ACCOUNT)
    if amount_paise > settings.PAYOUT_WITHDRAWAL_MAX_PAISE:
        # Full balance only, so a balance over the cap cannot be split; it goes to a person.
        reasons.append(REVIEW_OVER_MAXIMUM)
    return tuple(reasons)


def quote_withdrawal(
    *, partner: PartnerProfile, now: datetime | None = None, amount_paise: int | None = None
) -> WithdrawalQuote:
    """Decide what a Withdraw tap would do, without doing it.

    The preview the Partner sees and the request that acts both come through here, so the button
    can never promise something the request then refuses for a reason it did not show. The
    request passes the sum of the entries it has locked; the preview reads the balance, which
    `apps.payouts.selectors` defines from the same rules.
    """

    now = now or timezone.now()
    if amount_paise is None:
        amount_paise = partner_balance(partner_id=partner.id, now=now).available_paise
    day_start, week_start = _withdrawal_windows(now)
    left_today = max(
        settings.PAYOUT_WITHDRAWALS_PER_DAY - _counted_withdrawals(partner.id, since=day_start), 0
    )
    free_left = max(
        settings.PAYOUT_FREE_WITHDRAWALS_PER_WEEK
        - _counted_withdrawals(partner.id, since=week_start),
        0,
    )
    fee = 0 if free_left > 0 else int(settings.PAYOUT_EXTRA_WITHDRAWAL_FEE_PAISE)
    account = _current_payout_account(partner.id)
    refusal = _withdrawal_refusal(
        partner_id=partner.id,
        account=account,
        now=now,
        amount_paise=amount_paise,
        left_today=left_today,
        fee_paise=fee,
    )
    return WithdrawalQuote(
        refusal=refusal,
        amount_paise=max(amount_paise, 0),
        fee_paise=max(fee, 0),
        review_reasons=(
            _review_reasons(account, amount_paise) if not refusal and account is not None else ()
        ),
        account=account,
        withdrawals_left_today=left_today,
        free_withdrawals_left_this_week=free_left,
    )


@transaction.atomic
def request_withdrawal(*, partner: PartnerProfile, actor: User) -> PayoutBatchItem:
    """A Partner takes their whole available balance now.

    The Partner row is locked first, so two taps cannot both pass the one-in-flight and daily
    checks; `payouts_one_withdrawal_in_flight_per_partner` holds even if that is ever bypassed.
    Then the payable entries are locked and the rules decided on exactly those (`quote_withdrawal`).

    Passing every rule, the withdrawal is approved by policy and queued for sending in the same
    commit. The first payout to a bank account, or a balance above the maximum, waits in the
    Operations queue instead, its entries already reserved so nothing else can take them. An
    extra withdrawal's fee is a negative ledger line of the same transfer, so the amount sent is
    still the sum of its lines, and it is given back if the money does not stay out.
    """

    PartnerProfile.objects.select_for_update().get(id=partner.id)
    now = timezone.now()
    entries = list(
        payable_entries(partner_id=partner.id, now=now)
        .select_for_update(of=("self",))
        .order_by("created_at", "id")
    )
    quote = quote_withdrawal(
        partner=partner, now=now, amount_paise=sum(entry.net_paise for entry in entries)
    )
    if quote.refusal:
        raise WithdrawalRefusedApiError(
            reason=quote.refusal, message=withdrawal_refusal_message(quote.refusal)
        )
    account = quote.account
    if account is None:  # pragma: no cover - `_account_refusal` refused this already
        raise WithdrawalRefusedApiError(
            reason="no_payout_account", message=withdrawal_refusal_message("no_payout_account")
        )
    needs_review = bool(quote.review_reasons)
    currency = entries[0].currency
    batch = PayoutBatch.objects.create(
        reference=f"withdrawal-{uuid4().hex}",
        kind=PayoutBatch.Kind.WITHDRAWAL,
        status=(PayoutBatch.Status.PENDING_APPROVAL if needs_review else PayoutBatch.Status.PAYING),
        approval_basis="" if needs_review else PayoutBatch.ApprovalBasis.POLICY,
        approved_at=None if needs_review else now,
        review_reasons=list(quote.review_reasons),
        period_start=min(entries[0].created_at, now - timedelta(seconds=1)),
        period_end=now,
        proposed_by=actor,
        total_paise=quote.send_paise,
        currency=currency,
    )
    lines = list(entries)
    if quote.fee_paise:
        lines.append(
            PartnerLedgerEntry.objects.create(
                partner=partner,
                kind=PartnerLedgerEntry.Kind.FEE,
                status=PartnerLedgerEntry.Status.AVAILABLE,
                gross_paise=-quote.fee_paise,
                commission_paise=0,
                net_paise=-quote.fee_paise,
                currency=currency,
                calculation_snapshot={
                    "fee_paise": quote.fee_paise,
                    "free_withdrawals_per_week": settings.PAYOUT_FREE_WITHDRAWALS_PER_WEEK,
                    "withdrawal_reference": batch.reference,
                },
                reason="withdrawal_fee",
                created_by=actor,
                idempotency_key=f"withdrawal-fee:{batch.id}",
            )
        )
    item = PayoutBatchItem.objects.create(
        batch=batch,
        partner=partner,
        payout_account=account,
        is_withdrawal=True,
        amount_paise=quote.send_paise,
        currency=currency,
        idempotency_key=payout_idempotency_key(batch_id=batch.id, partner_id=partner.id),
    )
    _attach_entries(item, lines)
    if not needs_review:
        _request_submissions(batch)
    return item


def _withdrawal_awaiting_review(*, batch_id: UUID, expected_version: int) -> PayoutBatch:
    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.kind != PayoutBatch.Kind.WITHDRAWAL:
        raise PayoutBatchInvalidApiError(reason="This is a payout run, not a Partner withdrawal.")
    if batch.version != expected_version:
        raise PayoutBatchConflictApiError(current_version=batch.version)
    if batch.status != PayoutBatch.Status.PENDING_APPROVAL:
        raise PayoutBatchInvalidApiError(
            reason=f"This withdrawal is {batch.get_status_display().lower()}, not waiting for "
            "review."
        )
    return batch


@transaction.atomic
def approve_withdrawal(*, batch_id: UUID, expected_version: int, actor: User) -> PayoutBatch:
    """Operations lets through a withdrawal the rules sent to them, and it is queued to send.

    One step rather than a run's approve-then-pay: it is one Partner's own balance, already
    reserved, and the decision is "is this person and this account right", which is answered
    once. Maker-checker still holds — the proposer is the Partner — and the transfer is still
    re-checked at the moment of sending, so a dispute opened while it waited stops it.
    """

    batch = _withdrawal_awaiting_review(batch_id=batch_id, expected_version=expected_version)
    if batch.proposed_by_id == actor.id:
        raise SelfApprovalDeniedApiError
    batch.status = PayoutBatch.Status.PAYING
    batch.approval_basis = PayoutBatch.ApprovalBasis.OPERATIONS
    batch.approved_by = actor
    batch.approved_at = timezone.now()
    batch.version += 1
    batch.save(
        update_fields=(
            "status",
            "approval_basis",
            "approved_by",
            "approved_at",
            "version",
            "updated_at",
        )
    )
    _request_submissions(batch)
    return batch


#: The shortest decline reason accepted. The Partner reads it, so "no" is not one.
DECLINE_REASON_MIN_LENGTH = 3


@transaction.atomic
def decline_withdrawal(
    *, batch_id: UUID, expected_version: int, actor: User, reason: str
) -> PayoutBatch:
    """Operations refuses a withdrawal. Every line goes back to the balance, any fee is given back,
    and the Partner reads `reason` — so it says what to do, not what was suspected."""

    note = reason.strip()
    if len(note) < DECLINE_REASON_MIN_LENGTH:
        raise PayoutBatchInvalidApiError(reason="Tell the Partner why, in a few words.")
    batch = _withdrawal_awaiting_review(batch_id=batch_id, expected_version=expected_version)
    for item in batch.items.select_for_update().filter(status=PayoutBatchItem.Status.RESERVED):
        _close_item(
            item, status=PayoutBatchItem.Status.RELEASED, failure_code="declined_by_operations"
        )
    batch.status = PayoutBatch.Status.CANCELLED
    batch.cancelled_by = actor
    batch.cancelled_at = timezone.now()
    batch.review_note = note[:240]
    batch.version += 1
    batch.save(
        update_fields=(
            "status",
            "cancelled_by",
            "cancelled_at",
            "review_note",
            "version",
            "updated_at",
        )
    )
    return batch


def unsent_payout_item_ids(*, older_than: timedelta) -> list[UUID]:
    """Reserved transfers in a paying batch that nobody has started sending.

    The outbox delivers the send request at least once, but the send job it starts is an
    ordinary Celery message queued after commit, and a broker restart can lose it. Never an item
    already claimed: `SUBMITTING` and later belong to the provider's answer or to reconciliation.
    """

    return list(
        PayoutBatchItem.objects.filter(
            status=PayoutBatchItem.Status.RESERVED,
            batch__status=PayoutBatch.Status.PAYING,
            updated_at__lt=timezone.now() - older_than,
        )
        .order_by("created_at", "id")
        .values_list("id", flat=True)
    )
