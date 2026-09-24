"""Starting a charge: the locked pre-flight, the `PaymentAttempt`, and its provider order.

Everything from "the Customer pressed pay" up to the moment a provider order exists and the
Customer can be sent to the gateway. The boundary is the gateway callback: what happens once
money actually lands belongs to `capture`, not here.
"""

from datetime import datetime, timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.carts.models import BookingGroup, CheckoutSession, FulfilmentUnit
from apps.commerce.models import (
    FinancialException,
    PaymentAllocation,
    PaymentAttempt,
)
from apps.commerce.providers import (
    PaymentProviderAmbiguousError,
    PaymentProviderRejectedError,
    get_payment_provider,
)
from apps.foundation.services import enqueue_outbox_event

from .base import PAYMENT_START_SAFETY_SECONDS, _open_exception


def _locked_payment_context(
    *, checkout_id: UUID, customer_id: UUID, expected_checkout_version: int
) -> tuple[CheckoutSession, BookingGroup, list[FulfilmentUnit], list[Reservation]]:
    checkout = (
        CheckoutSession.objects.select_for_update(of=("self",))
        .select_related("quote", "booking_group")
        .get(id=checkout_id, customer_id=customer_id)
    )
    group = checkout.booking_group
    if group is None:
        raise ValueError("Legacy singleton checkouts cannot start a group payment.")
    group = BookingGroup.objects.select_for_update().get(id=group.id)
    if checkout.version != expected_checkout_version:
        raise ValueError("The checkout changed. Refresh before starting payment.")
    if (
        checkout.status
        not in (
            CheckoutSession.Status.PARTNER_COMMITTED,
            CheckoutSession.Status.PAYMENT_PENDING,
        )
        or group.status != BookingGroup.Status.PAYMENT_PENDING
    ):
        raise ValueError("Payment is unavailable until every required Partner commits.")
    now = timezone.now()
    if checkout.expires_at <= now + timedelta(seconds=PAYMENT_START_SAFETY_SECONDS):
        raise ValueError("The Partner holds are too close to expiry to start payment.")
    units = list(group.units.select_for_update().prefetch_related("lines").order_by("position"))
    if not units:
        raise ValueError("The Booking Group has no Fulfilment Units.")
    reservations = list(
        Reservation.objects.select_for_update()
        .filter(fulfilment_unit__booking_group=group)
        .order_by("fulfilment_unit__position")
    )
    if (
        len(reservations) != len(units)
        or any(reservation.status != Reservation.Status.TENTATIVE for reservation in reservations)
        or min(reservation.expires_at for reservation in reservations)
        <= now + timedelta(seconds=PAYMENT_START_SAFETY_SECONDS)
    ):
        raise ValueError("Every Fulfilment Unit must have a live Partner hold before payment.")
    if sum(unit.total_paise for unit in units) != checkout.quote.total_paise:
        raise ValueError("The Fulfilment Unit totals do not reconcile to the selected quote.")
    return checkout, group, units, reservations


@transaction.atomic
def initiate_payment_attempt(
    *,
    checkout_id: UUID,
    customer_id: UUID,
    expected_checkout_version: int,
    idempotency_key: str,
    wallet_amount_paise: int = 0,
    coin_burn_amount: int = 0,
) -> PaymentAttempt:
    checkout, group, units, reservations = _locked_payment_context(
        checkout_id=checkout_id,
        customer_id=customer_id,
        expected_checkout_version=expected_checkout_version,
    )
    active_attempt = checkout.payment_attempts.filter(
        status__in=(
            PaymentAttempt.Status.PROVIDER_PENDING,
            PaymentAttempt.Status.CREATED,
            PaymentAttempt.Status.AUTHORIZED,
        )
    ).first()
    if active_attempt is not None:
        if active_attempt.idempotency_key == idempotency_key:
            return active_attempt
        raise ValueError("A payment attempt is already active for this checkout.")

    from .loyalty_funding import (  # noqa: PLC0415 - capture imports this module
        quote_checkout_funding,
        reserve_checkout_funding,
    )

    order_total = checkout.quote.total_paise
    funding = quote_checkout_funding(
        customer=checkout.customer,
        order_payable_paise=order_total,
        wallet_amount_paise=wallet_amount_paise,
        coin_burn_amount=coin_burn_amount,
    )
    attempt = PaymentAttempt.objects.create(
        checkout=checkout,
        booking_group=group,
        quote=checkout.quote,
        idempotency_key=idempotency_key,
        provider=settings.PAYMENT_PROVIDER,
        amount_paise=order_total,
        wallet_reserved_paise=funding.wallet_paise,
        coins_burned=funding.coins,
        coin_discount_paise=funding.discount_paise,
        currency=checkout.quote.currency,
        expires_at=min(reservation.expires_at for reservation in reservations),
    )
    reserve_checkout_funding(attempt=attempt, customer=checkout.customer, funding=funding)
    allocation_total = 0
    for unit in units:
        unit_lines = list(unit.lines.order_by("position"))
        if sum(line.amount_paise for line in unit_lines) != unit.total_paise:
            raise ValueError("A Fulfilment Unit does not reconcile to its immutable lines.")
        for line in unit_lines:
            PaymentAllocation.objects.create(
                payment_attempt=attempt,
                fulfilment_unit=unit,
                fulfilment_line=line,
                position=line.position,
                amount_paise=line.amount_paise,
                currency=line.currency,
                line_snapshot={
                    "kind": line.kind,
                    "code": line.code,
                    "label": line.label,
                    "quantity": line.quantity,
                    "snapshot": line.snapshot,
                },
            )
            allocation_total += line.amount_paise
    if allocation_total != attempt.amount_paise:
        raise ValueError("Payment allocations do not reconcile to the payment total.")
    checkout.status = CheckoutSession.Status.PAYMENT_PENDING
    checkout.version += 1
    checkout.save(update_fields=("status", "version"))
    if attempt.gateway_amount_paise == 0:
        from .capture import _materialize_captured_group  # noqa: PLC0415
        from .loyalty_funding import capture_checkout_funding  # noqa: PLC0415

        capture_checkout_funding(attempt=attempt)
        attempt.status = PaymentAttempt.Status.CAPTURED
        attempt.captured_at = timezone.now()
        attempt.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
        attempt.version += 1
        attempt.save(
            update_fields=(
                "status",
                "captured_at",
                "reconciliation_state",
                "version",
                "updated_at",
            )
        )
        _materialize_captured_group(attempt=attempt)
        return attempt
    enqueue_outbox_event(
        aggregate_type="payment_attempt",
        aggregate_id=attempt.id,
        event_type="payment_attempt.order_requested",
        idempotency_key=f"payment-order:{attempt.id}",
        payload={"payment_attempt_id": str(attempt.id)},
    )
    return attempt


def initiate_standalone_payment_attempt(
    *,
    purpose: str,
    amount_paise: int,
    idempotency_key: str,
    currency: str = "INR",
    expires_at: datetime | None = None,
) -> PaymentAttempt:
    """Start a charge that has no `CheckoutSession` behind it.

    The generalisation of what `fulfilment.amendments.approve_scope_amendment` was already doing
    by hand: a post-cart charge still needs a `PaymentAttempt`, a provider order and the same
    reconciliation machinery, and the only thing it lacks is a cart. Extracted here when M2's
    unlock, visit plan and stage funding became the third, fourth and fifth caller — five copies
    of "create the attempt and enqueue its order" is five places for the outbox key to drift.

    The caller owns idempotency. Every M2 caller runs inside `execute_idempotent` or holds a row
    lock on the aggregate it is charging for, so a second attempt for one unlock or one plan is
    refused before it reaches here.
    """
    if purpose not in PaymentAttempt.CHECKOUT_FREE_PURPOSES:
        raise ValueError("This purpose requires a Checkout.")
    if amount_paise <= 0:
        raise ValueError("A payment attempt needs a positive amount.")
    attempt = PaymentAttempt.objects.create(
        checkout=None,
        purpose=purpose,
        idempotency_key=idempotency_key,
        provider=settings.PAYMENT_PROVIDER,
        amount_paise=amount_paise,
        currency=currency,
        expires_at=expires_at,
    )
    enqueue_outbox_event(
        aggregate_type="payment_attempt",
        aggregate_id=attempt.id,
        event_type="payment_attempt.order_requested",
        idempotency_key=f"payment-order:{attempt.id}",
        payload={"payment_attempt_id": str(attempt.id)},
    )
    return attempt


def create_provider_order(*, attempt_id: UUID) -> PaymentAttempt:
    attempt = PaymentAttempt.objects.get(id=attempt_id)
    if (
        attempt.status != PaymentAttempt.Status.PROVIDER_PENDING
        or attempt.gateway_amount_paise <= 0
    ):
        return attempt
    provider = get_payment_provider(provider_code=attempt.provider)
    try:
        provider_order = provider.create_order(
            amount_paise=attempt.gateway_amount_paise,
            currency=attempt.currency,
            receipt=str(attempt.id),
            idempotency_key=attempt.idempotency_key,
        )
    except PaymentProviderAmbiguousError:
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.failure_code = "provider_order_ambiguous"
            locked.version += 1
            locked.save(
                update_fields=("reconciliation_state", "failure_code", "version", "updated_at")
            )
            _open_exception(
                kind=FinancialException.Kind.PROVIDER_AMBIGUITY,
                code="provider_order_ambiguous",
                attempt=locked,
            )
            return locked
    except PaymentProviderRejectedError:
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            from .loyalty_funding import release_checkout_funding  # noqa: PLC0415

            release_checkout_funding(attempt=locked)
            locked.status = PaymentAttempt.Status.FAILED
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
            locked.failure_code = "provider_order_rejected"
            locked.version += 1
            locked.save(
                update_fields=(
                    "status",
                    "reconciliation_state",
                    "failure_code",
                    "version",
                    "updated_at",
                )
            )
            return locked
    if (
        provider_order.amount_paise != attempt.gateway_amount_paise
        or provider_order.currency != attempt.currency
    ):
        with transaction.atomic():
            locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
            from .loyalty_funding import release_checkout_funding  # noqa: PLC0415

            release_checkout_funding(attempt=locked)
            locked.status = PaymentAttempt.Status.FAILED
            locked.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
            locked.failure_code = "provider_order_amount_mismatch"
            locked.version += 1
            locked.save(
                update_fields=(
                    "status",
                    "reconciliation_state",
                    "failure_code",
                    "version",
                    "updated_at",
                )
            )
            _open_exception(
                kind=FinancialException.Kind.AMOUNT_MISMATCH,
                code="provider_order_amount_mismatch",
                attempt=locked,
            )
            return locked
    with transaction.atomic():
        locked = PaymentAttempt.objects.select_for_update().get(id=attempt.id)
        if locked.status != PaymentAttempt.Status.PROVIDER_PENDING:
            return locked
        locked.provider_order_id = provider_order.provider_order_id
        locked.status = PaymentAttempt.Status.CREATED
        locked.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
        locked.failure_code = ""
        locked.version += 1
        locked.save(
            update_fields=(
                "provider_order_id",
                "status",
                "reconciliation_state",
                "failure_code",
                "version",
                "updated_at",
            )
        )
        return locked
