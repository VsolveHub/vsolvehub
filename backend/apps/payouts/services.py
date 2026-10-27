"""Ledger settlement, earnings holds and the payout batch lifecycle.

Every command here is `@transaction.atomic` and takes its locks in one order: `PayoutBatch`,
then `PayoutBatchItem`, then `PartnerLedgerEntry`. The reverse order between two concurrent batch
operations is the only way to deadlock this module, and picking an order is cheaper than
detecting one.
"""

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid5

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.commerce.models import Booking
from apps.foundation.services import enqueue_outbox_event
from apps.fulfilment.models import WorkOutcome, WorkTask
from apps.identity.models import User
from apps.partners.models import PartnerProfile
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
    )


@transaction.atomic
def release_payout_hold(
    *, booking_id: UUID | None = None, rental_booking_id: UUID | None = None
) -> PartnerLedgerEntry | None:
    """Move a held earning to `AVAILABLE` once the case that held it closes."""

    qs = PartnerLedgerEntry.objects.select_for_update().filter(kind=PartnerLedgerEntry.Kind.EARNING)
    if booking_id is not None:
        qs = qs.filter(booking_id=booking_id)
    elif rental_booking_id is not None:
        qs = qs.filter(rental_booking_id=rental_booking_id)
    else:
        return None

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
    if batch.status != PayoutBatch.Status.PENDING_APPROVAL:
        raise PayoutBatchInvalidApiError(reason=f"A batch in {batch.status} cannot be approved.")
    if batch.proposed_by_id == actor.id:
        raise SelfApprovalDeniedApiError
    if not batch.items.exists():
        raise PayoutBatchInvalidApiError(reason="An empty batch has nothing to approve.")

    batch.status = PayoutBatch.Status.APPROVED
    batch.approved_by = actor
    batch.approved_at = timezone.now()
    batch.version += 1
    batch.save(update_fields=("status", "approved_by", "approved_at", "version", "updated_at"))
    return batch


@transaction.atomic
def cancel_payout_batch(*, batch_id: UUID, expected_version: int, actor: User) -> PayoutBatch:
    """Release every reservation back to the ledger.

    Refused once anything has been submitted to the provider: money may already be moving, and
    releasing an entry whose payout is in flight is how it gets paid twice.
    """

    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.version != expected_version:
        raise PayoutBatchConflictApiError(current_version=batch.version)
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


@transaction.atomic
def submit_payout_item(*, item_id: UUID) -> PayoutBatchItem:
    """Send one reserved item to the provider, exactly once.

    The three outcomes are not symmetrical, and the asymmetry is the whole point:

    * **Accepted** — the item is `SUBMITTED` and the ledger entry stays reserved.
    * **Rejected** — the provider explicitly refused, so no money moved. The item fails and the
      entry is released back to the pool, where a later batch can pick it up.
    * **Ambiguous** — a timeout, a reset, a 5xx. The payout *may* have gone out. The item parks
      at `UNDER_REVIEW` and the entry stays reserved, because releasing it here is precisely how
      a Partner gets paid twice: the first attempt lands late, the entry is already in a second
      batch, and both settle. Slower and correct beats faster and wrong when the money has left.
    """

    item = (
        PayoutBatchItem.objects.select_for_update()
        .select_related("payout_account", "batch")
        .get(id=item_id)
    )
    if item.status != PayoutBatchItem.Status.RESERVED:
        return item

    provider = get_payout_provider()
    try:
        result = provider.create_payout(
            fund_account_id=item.payout_account.provider_fund_account_id,
            amount_paise=item.amount_paise,
            currency=item.currency,
            # The item id alone, as 32 hex characters: RazorpayX caps `reference_id` at 40, and
            # the old "<batch reference>:<item id>" was 37 at the very least. Still unique per
            # payout, which is what reconciliation needs; the run travels in the notes instead.
            reference=item.id.hex,
            idempotency_key=item.idempotency_key,
            batch_reference=item.batch.reference,
        )
    except PayoutProviderAmbiguousError:
        item.status = PayoutBatchItem.Status.UNDER_REVIEW
        item.failure_code = "provider_ambiguous"
        item.submitted_at = timezone.now()
        item.save(update_fields=("status", "failure_code", "submitted_at", "updated_at"))
        return item
    except PayoutProviderRejectedError:
        item.status = PayoutBatchItem.Status.FAILED
        item.failure_code = "provider_rejected"
        item.completed_at = timezone.now()
        item.save(update_fields=("status", "failure_code", "completed_at", "updated_at"))
        entry = PartnerLedgerEntry.objects.select_for_update().get(id=item.ledger_entry_id)
        entry.status = PartnerLedgerEntry.Status.RELEASED
        entry.save(update_fields=("status", "updated_at"))
        return item

    item.status = PayoutBatchItem.Status.SUBMITTED
    item.provider_payout_id = result.provider_payout_id
    item.submitted_at = timezone.now()
    item.save(update_fields=("status", "provider_payout_id", "submitted_at", "updated_at"))
    return item


#: Provider vocabulary reduced to ours. Reduction lives here rather than in the adapter so there
#: is one place the payout state machine is decided.
_PROVIDER_TERMINAL_STATES: dict[str, str] = {
    "processed": PayoutBatchItem.Status.PAID,
    "reversed": PayoutBatchItem.Status.FAILED,
    "cancelled": PayoutBatchItem.Status.FAILED,
    "rejected": PayoutBatchItem.Status.FAILED,
    "failed": PayoutBatchItem.Status.FAILED,
}


@transaction.atomic
def apply_payout_result(*, item_id: UUID, status: str, failure_reason: str = "") -> PayoutBatchItem:
    """Settle one item from a webhook or a reconciliation poll.

    Monotonic: a `PAID` item never moves again, however many duplicate or out-of-order webhooks
    arrive. A provider that reports `processed` twice, or reports `queued` after `processed`,
    must not be able to un-pay somebody.
    """

    item = PayoutBatchItem.objects.select_for_update().get(id=item_id)
    if item.status in (PayoutBatchItem.Status.PAID, PayoutBatchItem.Status.RELEASED):
        return item
    target = _PROVIDER_TERMINAL_STATES.get(status)
    if target is None:
        # Still in flight ("queued", "processing"). Nothing to settle, and nothing to guess.
        return item

    entry = PartnerLedgerEntry.objects.select_for_update().get(id=item.ledger_entry_id)
    item.status = target
    item.failure_code = (
        "" if target == PayoutBatchItem.Status.PAID else _failure_code(failure_reason or status)
    )
    item.completed_at = timezone.now()
    item.save(update_fields=("status", "failure_code", "completed_at", "updated_at"))

    entry.status = (
        PartnerLedgerEntry.Status.PAID
        if target == PayoutBatchItem.Status.PAID
        else PartnerLedgerEntry.Status.RELEASED
    )
    entry.save(update_fields=("status", "updated_at"))
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


@transaction.atomic
def apply_razorpayx_payout_event(event: Mapping[str, object]) -> PayoutBatchItem | None:
    """Settle an item from a verified RazorpayX `payout.*` webhook.

    Everything else is acknowledged and ignored. Settlement goes through `apply_payout_result`,
    which is monotonic, so a duplicate or out-of-order delivery cannot un-pay anybody;
    `reconcile_payouts` remains the backstop for a webhook that never arrives.
    """

    name = event.get("event")
    if not isinstance(name, str) or not name.startswith("payout."):
        return None
    entity = _mapping(_mapping(_mapping(event.get("payload")).get("payout")).get("entity"))
    provider_payout_id = str(entity.get("id") or "")
    status = str(entity.get("status") or "")
    if not status:
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

    details = _mapping(entity.get("status_details"))
    failure_reason = str(entity.get("failure_reason") or details.get("reason") or "")
    return apply_payout_result(item_id=item.id, status=status, failure_reason=failure_reason)


def _settle_batch_if_complete(batch_id: UUID) -> None:
    """A batch is finished when no item is still moving.

    `FAILED` does not make the batch failed — one rejected account among two hundred successful
    payouts is an exception to chase, not a batch to redo. `PAID` means every item reached a
    terminal state and at least one was paid.
    """

    batch = PayoutBatch.objects.select_for_update().get(id=batch_id)
    if batch.status in (PayoutBatch.Status.PAID, PayoutBatch.Status.CANCELLED):
        return
    in_flight = batch.items.exclude(
        status__in=(
            PayoutBatchItem.Status.PAID,
            PayoutBatchItem.Status.FAILED,
            PayoutBatchItem.Status.RELEASED,
        )
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
    if batch.status != PayoutBatch.Status.APPROVED:
        raise PayoutBatchInvalidApiError(
            reason=f"A batch in {batch.status} has not been approved for payment."
        )
    batch.status = PayoutBatch.Status.PAYING
    batch.version += 1
    batch.save(update_fields=("status", "version", "updated_at"))
    for item in batch.items.filter(status=PayoutBatchItem.Status.RESERVED):
        enqueue_outbox_event(
            aggregate_type="payout_item",
            aggregate_id=item.id,
            event_type="payout.submission_requested",
            idempotency_key=f"payout-submit:{item.id}",
            payload={"payout_item_id": str(item.id)},
        )
    return batch


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
