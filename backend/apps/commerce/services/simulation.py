"""The development-only door: capturing a payment by hand, with no gateway involved.

Two functions, both fail-closed, and both here rather than in `capture` so that the production
capture path never has a development branch inside it. `_standalone_attempt_belongs_to` answers
ownership for a checkout-free charge and is used only by the simulated capture that follows it.
"""

from uuid import UUID

from django.conf import settings
from django.db import transaction

from apps.commerce.models import Order, PaymentAttempt
from apps.commerce.providers import FakePaymentProvider

from .base import PAYMENT_FINAL_STATES
from .capture import apply_provider_payment


@transaction.atomic
def _standalone_attempt_belongs_to(*, attempt: PaymentAttempt, customer_id: UUID) -> bool:
    """Whose charge is a checkout-free `PaymentAttempt`?

    Answered from the aggregate that sold it rather than from the attempt, because the attempt
    genuinely does not know: `initiate_standalone_payment_attempt` deliberately takes no customer,
    since the aggregate on the other side already records one and a second copy is a second thing
    that can disagree.

    Imported inside the function for the reason `_apply_m2_capture` is: `apps.requirements` imports
    this module, and these two calls are the only ones going the other way.
    """
    from apps.requirements.models import (  # noqa: PLC0415 - avoids a module import cycle
        BookingFee,
        EngagementAmendment,
        EngagementStage,
        QuoteUnlock,
        VisitPlan,
    )

    purpose = attempt.purpose
    if purpose == PaymentAttempt.Purpose.M2_BOOKING_FEE:
        return BookingFee.objects.filter(
            payment_attempt=attempt, requirement__customer_id=customer_id
        ).exists()
    if purpose == PaymentAttempt.Purpose.M2_QUOTE_UNLOCK:
        return QuoteUnlock.objects.filter(
            payment_attempt=attempt, requirement__customer_id=customer_id
        ).exists()
    if purpose == PaymentAttempt.Purpose.M2_VISIT_PLAN:
        return VisitPlan.objects.filter(
            payment_attempt=attempt, requirement__customer_id=customer_id
        ).exists()
    if purpose in (
        PaymentAttempt.Purpose.M2_STAGE_FUNDING,
        PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE,
    ):
        return EngagementStage.objects.filter(
            payment_attempt=attempt, engagement__customer_id=customer_id
        ).exists()
    if purpose == PaymentAttempt.Purpose.M2_SCOPE_AMENDMENT:
        return EngagementAmendment.objects.filter(
            payment_attempt=attempt, engagement__customer_id=customer_id
        ).exists()
    # `SCOPE_AMENDMENT_REVISION` and `M2_SITE_VISIT_FEE` are not resolvable here yet, and a
    # permissive default on a money endpoint is the wrong direction to guess in.
    return False


def simulate_capture(*, attempt_id: UUID, customer_id: UUID) -> Order | None:
    """Marks a payment captured with no gateway involved. Development only.

    ## Why this routes through `apply_provider_payment`

    It would be one line to set `attempt.status = CAPTURED` and return. That line
    would also skip confirming the reservations, creating the `Order` and its
    `Booking`s, issuing the tax document, clearing the booked cart items, and the
    `capture_without_capacity` compensation — every one of which is triggered by
    the real capture path. A stub that produces a "paid" booking nothing
    downstream agrees is paid is worse than no stub: it makes development diverge
    from production precisely where the money is.

    So this fabricates the one thing that is genuinely missing — a provider
    saying "captured" — and hands it to the same function a webhook would.

    ## Three independent locks

    The settings flag is fail-closed and `production.py` refuses to boot with it
    on. Beyond that, the attempt's own provider must be `fake`: even if the flag
    were somehow enabled against a real environment, a Razorpay attempt cannot be
    captured through here. And the attempt must belong to the caller.

    ## Checkout-free purposes

    Ownership used to run through the `CheckoutSession` alone, which made every
    checkout-free purpose — the M1 scope-amendment revision and all five M2
    charges — impossible to capture here at all. That was a real hole rather
    than a strictness: `milestones.md` proves every M2 money path with a
    provider **test** callback, and this is the door those callbacks come
    through in development, so the whole of the M2 commercial flow was
    undrivable by hand. `_standalone_attempt_belongs_to` resolves the same
    question against the aggregate that actually records a customer.
    """
    if not settings.PAYMENTS_ALLOW_SIMULATED_CAPTURE:
        raise PermissionError("Simulated capture is disabled in this environment.")

    attempt = (
        PaymentAttempt.objects.select_for_update(of=("self",))
        .select_related("checkout")
        .get(id=attempt_id)
    )
    # Ownership runs through the checkout where there is one — the attempt itself
    # carries no customer — and through the M2 aggregate that bought it where
    # there is not.
    owned = (
        attempt.checkout.customer_id == customer_id
        if attempt.checkout is not None
        else _standalone_attempt_belongs_to(attempt=attempt, customer_id=customer_id)
    )
    if not owned:
        raise PermissionError("This payment belongs to another Customer.")
    if attempt.provider != FakePaymentProvider.code:
        raise PermissionError("Only a fake-provider payment can be captured by hand.")
    if attempt.status in PAYMENT_FINAL_STATES:
        # Already settled. Idempotent by re-reading rather than by charging again.
        return Order.objects.filter(booking_group_id=attempt.booking_group_id).first()
    if not attempt.provider_order_id:
        raise ValueError("This payment has no provider order yet.")

    payment = FakePaymentProvider.record_payment(
        provider_payment_id=f"fake_pay_{attempt.id.hex}",
        provider_order_id=attempt.provider_order_id,
        amount_paise=attempt.amount_paise,
        currency=attempt.currency,
    )
    return apply_provider_payment(payment=payment, provider_code=FakePaymentProvider.code)
