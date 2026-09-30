"""What happens when the money lands: capacity, materialisation, and the M2 capture dispatch.

The single entry point is `apply_provider_payment` — every route to a captured payment (webhook,
reconciliation sweep, simulated capture) ends here. Below it sit the two things a capture can
mean: an M1 cart becoming an `Order` with its `Booking`s and invoice, or an M2 access/stage charge
being handed to the domain that sold it. The compensating automatic refund lives here too,
because it is what a capture without capacity turns into.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.carts.models import BookingGroup, CheckoutSession, FulfilmentUnit
from apps.carts.services import clear_booked_cart_items
from apps.commerce.models import (
    Booking,
    FinancialException,
    Order,
    PaymentAttempt,
    Refund,
    RefundAllocation,
    TaxDocument,
)
from apps.commerce.providers import ProviderPayment
from apps.foundation.services import enqueue_outbox_event

from .base import PAYMENT_FINAL_STATES, _issue_document, _open_exception


def _try_confirm_group_capacity(*, group: BookingGroup) -> bool:
    units = list(group.units.select_for_update().order_by("position"))
    reservations = list(
        Reservation.objects.select_for_update()
        .filter(fulfilment_unit__booking_group=group)
        .select_related("partner")
        .order_by("fulfilment_unit__position")
    )
    if len(units) != len(reservations):
        return False
    try:
        with transaction.atomic():
            for reservation in reservations:
                reservation.status = Reservation.Status.CONFIRMED
                reservation.released_at = None
                reservation.save(update_fields=("status", "released_at"))
    except IntegrityError:
        return False
    return True


def _request_automatic_refund(
    *, attempt: PaymentAttempt, reason_code: str, amount_paise: int | None = None
) -> Refund:
    """Request an automatic refund against a captured attempt.

    ``amount_paise`` defaults to the full attempt total (cancel / capacity-failure
    paths). Callers that refund only a deposit residual pass an explicit amount;
    refund allocations are created only for full-amount refunds because unit
    allocations are not split for standalone residual refunds.
    """
    refund_amount = attempt.amount_paise if amount_paise is None else amount_paise
    if refund_amount <= 0:
        raise ValueError("A positive refund amount is required.")
    idempotency_key = f"automatic:{reason_code}:{attempt.id}"
    existing = (
        attempt.refunds.filter(idempotency_key=idempotency_key)
        .exclude(status=Refund.Status.FAILED)
        .first()
    )
    if existing is not None:
        return existing
    from .loyalty_funding import split_refund_amounts  # noqa: PLC0415

    wallet_credit, gateway_refund = split_refund_amounts(
        attempt=attempt, refund_paise=refund_amount
    )
    refund = Refund.objects.create(
        payment_attempt=attempt,
        amount_paise=refund_amount,
        wallet_credit_paise=wallet_credit,
        gateway_refund_paise=gateway_refund,
        currency=attempt.currency,
        reason_code=reason_code,
        idempotency_key=idempotency_key,
    )
    # Unit allocations only make sense when the whole attempt is returned; a
    # deposit residual on a combined rental+deposit charge has no unit split.
    if refund_amount == attempt.amount_paise:
        for allocation in attempt.allocations.all():
            if allocation.amount_paise == 0:
                continue
            RefundAllocation.objects.create(
                refund=refund,
                payment_allocation=allocation,
                amount_paise=allocation.amount_paise,
            )
    enqueue_outbox_event(
        aggregate_type="refund",
        aggregate_id=refund.id,
        event_type="refund.submission_requested",
        idempotency_key=f"refund-submit:{refund.id}",
        payload={"refund_id": str(refund.id)},
    )
    return refund


def _materialize_captured_group(*, attempt: PaymentAttempt) -> Order | None:
    if attempt.checkout_id is None:
        raise ValueError("Only a Booking Group payment attempt has a Checkout to materialize.")
    checkout = (
        CheckoutSession.objects.select_for_update()
        .select_related("quote")
        .get(id=attempt.checkout_id)
    )
    group_id = attempt.booking_group_id
    if group_id is None:
        raise ValueError("A captured payment has no Booking Group target.")
    group = BookingGroup.objects.select_for_update().get(id=group_id)
    existing = Order.objects.filter(booking_group=group).first()
    if existing is not None:
        return existing
    if not _try_confirm_group_capacity(group=group):
        attempt.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
        attempt.failure_code = "capture_without_capacity"
        attempt.save(update_fields=("reconciliation_state", "failure_code", "updated_at"))
        refund = _request_automatic_refund(
            attempt=attempt,
            reason_code="capture_without_capacity",
        )
        _open_exception(
            kind=FinancialException.Kind.CAPTURE_WITHOUT_CAPACITY,
            code="capture_without_capacity",
            attempt=attempt,
            refund=refund,
            context={"booking_group_id": str(group.id)},
        )
        return None
    order = Order.objects.create(
        checkout=checkout,
        booking_group=group,
        customer=checkout.customer,
        quote=checkout.quote,
        total_paise=attempt.amount_paise,
        currency=attempt.currency,
    )
    reservations = {
        reservation.fulfilment_unit_id: reservation
        for reservation in Reservation.objects.filter(
            fulfilment_unit__booking_group=group,
            status=Reservation.Status.CONFIRMED,
        ).select_related("partner")
    }
    for unit in group.units.select_for_update().order_by("position"):
        reservation = reservations.get(unit.id)
        if reservation is None:
            raise ValueError("A confirmed Fulfilment Unit reservation is missing.")
        Booking.objects.create(
            order=order,
            fulfilment_unit=unit,
            reservation=reservation,
            customer=checkout.customer,
            partner=reservation.partner,
            scheduled_start=unit.requested_start,
            estimated_duration_minutes=unit.estimated_duration_minutes,
        )
        unit.status = FulfilmentUnit.Status.BOOKED
        unit.version += 1
        unit.save(update_fields=("status", "version", "updated_at"))
    group.status = BookingGroup.Status.BOOKED
    group.version += 1
    group.save(update_fields=("status", "version", "updated_at"))
    checkout.status = CheckoutSession.Status.COMPLETED
    checkout.version += 1
    checkout.save(update_fields=("status", "version"))
    # The cart has become a booking. Only the items this quote actually booked are
    # removed — anything added since, or left behind because it could not be
    # planned, is still work the Customer wants.
    clear_booked_cart_items(quote=checkout.quote)
    _issue_document(
        order=order,
        attempt=attempt,
        kind=TaxDocument.Kind.INVOICE,
        allocations=attempt.allocations.order_by("fulfilment_unit__position", "position"),
        total_paise=attempt.amount_paise,
    )
    return order


#: M2 access and stage charges, and the domain command that finishes each one. The dispatch is a
#: table rather than a chain of `if`s so that adding a purpose without wiring its completion is a
#: `KeyError` at the moment of capture rather than money taken against nothing.
M2_CAPTURE_PURPOSES = (
    PaymentAttempt.Purpose.M2_QUOTE_UNLOCK,
    PaymentAttempt.Purpose.M2_VISIT_PLAN,
    PaymentAttempt.Purpose.M2_STAGE_FUNDING,
    # A material advance is a distinct purpose and the *same* completion (`M2-BE-543`). What it
    # buys differs — goods rather than work — and that difference lives in the recovery rules and
    # the ledger, not in how a captured payment funds its stage.
    PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE,
    PaymentAttempt.Purpose.M2_SCOPE_AMENDMENT,
    # A3 rate-card (revision 4). Its completion does two things at once — hardens the booking and
    # opens the engagement — for the same reason the unlock's does one: a commit boundary between
    # the money moving and the Customer getting what they paid for is a support ticket per lost
    # event.
    PaymentAttempt.Purpose.M2_BOOKING_FEE,
)

A10_CAPTURE_PURPOSES = (
    PaymentAttempt.Purpose.A10_VENDOR_SUBSCRIPTION,
    PaymentAttempt.Purpose.A10_PREMIUM_LISTING,
)


def _apply_m2_capture(*, attempt: PaymentAttempt) -> None:
    """Hand a captured M2 charge to the domain that sold it.

    Called **inside** `apply_provider_payment`'s transaction, deliberately. Granting the unlock
    from an outbox event instead would put a commit boundary between "the Customer's money moved"
    and "the Customer got what they paid for", and every lost event in that gap is a support
    ticket about a payment that bought nothing.

    Imported inside the function because `apps.requirements` imports this module: the dependency
    runs requirements → commerce at import time, and this is the one call that goes the other way.
    """
    from apps.requirements import access  # noqa: PLC0415 - avoids a module import cycle

    if attempt.purpose == PaymentAttempt.Purpose.M2_QUOTE_UNLOCK:
        access.complete_unlock(payment_attempt_id=attempt.id)
    elif attempt.purpose == PaymentAttempt.Purpose.M2_VISIT_PLAN:
        access.complete_visit_plan(payment_attempt_id=attempt.id)
    elif attempt.purpose in (
        PaymentAttempt.Purpose.M2_STAGE_FUNDING,
        PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE,
    ):
        from apps.requirements import engagements  # noqa: PLC0415 - same cycle

        engagements.complete_stage_funding(payment_attempt_id=attempt.id)
    elif attempt.purpose == PaymentAttempt.Purpose.M2_SCOPE_AMENDMENT:
        from apps.requirements import amendments  # noqa: PLC0415 - same cycle

        amendments.complete_engagement_amendment_payment(payment_attempt_id=attempt.id)
    elif attempt.purpose == PaymentAttempt.Purpose.M2_BOOKING_FEE:
        from apps.requirements import booking_fees  # noqa: PLC0415 - same cycle

        booking_fees.complete_booking_fee(payment_attempt_id=attempt.id)


def _apply_a10_capture(*, attempt: PaymentAttempt) -> None:
    """Activate the A10 product the poster paid for. Subscription and premium are distinct.

    Both purposes used to call `complete_subscription_payment`, which left
    `A10_PREMIUM_LISTING` a dead success path. Capture of premium now sets
    `Listing.is_premium` once; replay is a no-op.
    """
    from apps.listings.services import (  # noqa: PLC0415 - avoids a module import cycle
        activate_premium_feature,
        complete_subscription_payment,
    )

    if attempt.purpose == PaymentAttempt.Purpose.A10_VENDOR_SUBSCRIPTION:
        complete_subscription_payment(payment_attempt_id=attempt.id)
        return
    if attempt.purpose == PaymentAttempt.Purpose.A10_PREMIUM_LISTING:
        activate_premium_feature(payment_attempt_id=attempt.id)


def _apply_wallet_capture(*, attempt: PaymentAttempt) -> None:
    from apps.wallet.services import complete_wallet_top_up_payment  # noqa: PLC0415

    complete_wallet_top_up_payment(payment_attempt_id=attempt.id)


def _validate_payment_amount(*, attempt: PaymentAttempt, payment: ProviderPayment) -> bool:
    if (
        payment.provider_order_id != attempt.provider_order_id
        or payment.amount_paise != attempt.gateway_amount_paise
        or payment.currency != attempt.currency
    ):
        attempt.reconciliation_state = PaymentAttempt.ReconciliationState.NEEDS_ATTENTION
        attempt.failure_code = "provider_payment_amount_mismatch"
        attempt.version += 1
        attempt.save(
            update_fields=(
                "reconciliation_state",
                "failure_code",
                "version",
                "updated_at",
            )
        )
        _open_exception(
            kind=FinancialException.Kind.AMOUNT_MISMATCH,
            code="provider_payment_amount_mismatch",
            attempt=attempt,
        )
        return False
    return True


@transaction.atomic
def apply_provider_payment(
    *, payment: ProviderPayment, provider_code: str | None = None
) -> Order | None:
    attempts = PaymentAttempt.objects.filter(provider_order_id=payment.provider_order_id)
    if provider_code is not None:
        attempts = attempts.filter(provider=provider_code)
    attempt = PaymentAttempt.objects.select_for_update().get(
        id=attempts.values_list("id", flat=True).get(),
    )
    if not _validate_payment_amount(attempt=attempt, payment=payment):
        return None
    attempt.provider_payment_id = payment.provider_payment_id
    attempt.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
    attempt.failure_code = ""
    if payment.status == "captured":
        if attempt.status not in PAYMENT_FINAL_STATES:
            from .loyalty_funding import capture_checkout_funding  # noqa: PLC0415

            capture_checkout_funding(attempt=attempt)
            attempt.status = PaymentAttempt.Status.CAPTURED
            attempt.captured_at = timezone.now()
            attempt.version += 1
            attempt.save(
                update_fields=(
                    "provider_payment_id",
                    "status",
                    "captured_at",
                    "reconciliation_state",
                    "failure_code",
                    "version",
                    "updated_at",
                )
            )
        if attempt.purpose == PaymentAttempt.Purpose.BOOKING_GROUP:
            return _materialize_captured_group(attempt=attempt)
        if attempt.purpose in A10_CAPTURE_PURPOSES:
            _apply_a10_capture(attempt=attempt)
            return None
        if attempt.purpose == PaymentAttempt.Purpose.WALLET_TOP_UP:
            _apply_wallet_capture(attempt=attempt)
            return None
        if attempt.purpose == PaymentAttempt.Purpose.A7_RENTAL_DEPOSIT:
            from apps.rental.services import mark_deposit_held  # noqa: PLC0415

            mark_deposit_held(payment_attempt_id=attempt.id)
            return None
        if attempt.purpose == PaymentAttempt.Purpose.A7_RENTAL_BOOKING:
            from apps.rental.services import complete_rental_booking_payment  # noqa: PLC0415

            complete_rental_booking_payment(payment_attempt_id=attempt.id)
            return None
        if attempt.purpose == PaymentAttempt.Purpose.A9_STAY_RESERVATION:
            from apps.stay.services import confirm_reservation_payment  # noqa: PLC0415

            confirm_reservation_payment(payment_attempt_id=attempt.id)
            return None
        _apply_m2_capture(attempt=attempt)
        return None
    if payment.status == "authorized" and attempt.status in (
        PaymentAttempt.Status.PROVIDER_PENDING,
        PaymentAttempt.Status.CREATED,
    ):
        attempt.status = PaymentAttempt.Status.AUTHORIZED
        attempt.version += 1
    elif payment.status == "failed" and attempt.status not in PAYMENT_FINAL_STATES:
        from .loyalty_funding import release_checkout_funding  # noqa: PLC0415

        release_checkout_funding(attempt=attempt)
        attempt.status = PaymentAttempt.Status.FAILED
        attempt.failure_code = "provider_payment_failed"
        attempt.version += 1
    attempt.save(
        update_fields=(
            "provider_payment_id",
            "status",
            "reconciliation_state",
            "failure_code",
            "version",
            "updated_at",
        )
    )
    return None
