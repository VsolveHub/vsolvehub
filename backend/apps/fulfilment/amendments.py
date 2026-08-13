"""Scope amendment: Partner proposes additional catalog work; Customer approves/declines;
approved work is priced from the active catalog, paid, then authorized as `WorkTask`s.

M1 boundary, documented rather than silently incomplete: only `ScopeAmendmentLine.Kind.TASK`
lines are supported here, each pricing additional quantity of the Booking's own catalog task
via `apps.pricing.selectors.current_task_rate` — the same rate lookup cart/quote already use.
Uncatalogued material lines are out of scope for M1
(`05-pricing-payments-and-settlement.md`: "Uncatalogued work becomes... an Operations-assisted
quote, not a hidden free-text charge").

The revision payment reuses `commerce.PaymentAttempt` (`Purpose.SCOPE_AMENDMENT_REVISION`) —
the same provider-order/capture machinery the original booking payment uses — and its money is
recorded as a `commerce.PaymentAllocation` against the Booking's own catalog `FulfilmentUnitLine`,
never a second, parallel ledger.
"""

from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.carts.models import FulfilmentUnit
from apps.catalog.models import ServiceVariant
from apps.commerce.models import Booking, PaymentAllocation, PaymentAttempt
from apps.commerce.providers import ProviderPayment
from apps.foundation.services import enqueue_outbox_event
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import PriceRevision, ScopeAmendment, ScopeAmendmentLine, WorkTask
from apps.fulfilment.services import (
    BookingCommand,
    guard_booking_version,
    locked_booking_context,
    record_transition,
)
from apps.pricing.selectors import current_task_rate

MAX_AMENDMENT_TASK_QUANTITY = 20


def _resolve_unit_task(unit: FulfilmentUnit) -> tuple[ServiceVariant, str]:
    plan_unit_item = (
        unit.quote_unit.plan_unit.items.select_related("cart_item__variant", "cart_item__task_rate")
        .order_by("position")
        .first()
    )
    if plan_unit_item is None:
        raise BookingCommandInvalidApiError(reason="This Booking has no catalog task to amend.")
    cart_item = plan_unit_item.cart_item
    return cart_item.variant, cart_item.task_rate.task_code


def _active_amendment(booking: Booking) -> ScopeAmendment | None:
    return booking.scope_amendments.filter(
        status__in=(
            ScopeAmendment.Status.PROPOSED,
            ScopeAmendment.Status.CUSTOMER_APPROVED,
            ScopeAmendment.Status.PAYMENT_PENDING,
        )
    ).first()


def _booking_of(amendment: ScopeAmendment) -> Booking:
    """The Booking this amendment belongs to, or a refusal.

    `ScopeAmendment.booking` became nullable when M2 Wave C3 routed engagement amendments through
    this engine (`M2-BE-505`). The four commands in this module are the *Booking* front door and
    cannot act on an engagement amendment: they resolve a `FulfilmentUnit`, price from the catalog
    and write `WorkTask`s, none of which an engagement has. Refused explicitly rather than left to
    fail on an attribute, so an id sent to the wrong door says so.
    """
    booking = amendment.booking
    if booking is None:
        raise BookingCommandInvalidApiError(
            reason="This scope amendment belongs to an engagement, not a Booking."
        )
    return booking


class AmendmentExpiredError(RuntimeError):
    """The response window closed before the Customer answered.

    Raised by the shared guard rather than by either caller, so the M1 and M2 entry points cannot
    disagree about when an amendment stops being answerable. Each caller translates it into its
    own error vocabulary — `BookingCommandInvalidApiError` for M1, `RequirementDomainError` for
    M2 — because the two surfaces publish different envelopes and neither should import the
    other's.
    """


def guard_amendment_not_expired(amendment: ScopeAmendment) -> None:
    """Expire a `PROPOSED` amendment whose window has closed, and refuse.

    Public since M2 Wave C3. The rule is identical for a Booking amendment and an engagement
    amendment — a proposal nobody answered in time is not answerable now — so it lives once and
    both entry points call it. Moving it here rather than copying it is `M2-BE-505` in miniature.
    """
    already_expired = (
        amendment.status == ScopeAmendment.Status.PROPOSED
        and amendment.expires_at <= timezone.now()
    )
    if already_expired:
        amendment.status = ScopeAmendment.Status.EXPIRED
        amendment.version += 1
        amendment.save(update_fields=("status", "version"))
        raise AmendmentExpiredError(
            "This scope amendment expired before the Customer responded.",
        )


def _guard_amendment_not_expired(amendment: ScopeAmendment) -> None:
    """The M1 translation: the shared refusal in this surface's own envelope."""
    try:
        guard_amendment_not_expired(amendment)
    except AmendmentExpiredError as exc:
        raise BookingCommandInvalidApiError(reason=str(exc)) from exc


@transaction.atomic
def propose_scope_amendment(
    *,
    booking_id: UUID,
    partner_id: UUID,
    reason: str,
    task_quantity: int,
    expected_version: int,
    idempotency_key: str = "",
) -> ScopeAmendment:
    _group, unit, booking = locked_booking_context(booking_id)
    if booking.partner_id != partner_id:
        raise PermissionError("This Booking belongs to another Partner.")
    guard_booking_version(booking, expected_version)
    if booking.status != Booking.Status.IN_PROGRESS:
        raise BookingCommandInvalidApiError(
            reason="A scope amendment can only be proposed while work is in progress."
        )
    if not reason.strip():
        raise BookingCommandInvalidApiError(
            reason="A reason is required to propose additional work."
        )
    if not 1 <= task_quantity <= MAX_AMENDMENT_TASK_QUANTITY:
        raise BookingCommandInvalidApiError(
            reason=f"Quantity must be between 1 and {MAX_AMENDMENT_TASK_QUANTITY}."
        )
    if _active_amendment(booking) is not None:
        raise BookingCommandInvalidApiError(
            reason="A scope amendment is already awaiting a decision for this Booking."
        )

    variant, task_code = _resolve_unit_task(unit)
    rate = current_task_rate(variant=variant, task_code=task_code)
    if rate is None:
        raise BookingCommandInvalidApiError(reason="This catalog task has no current rate.")
    total_paise = rate.unit_price_paise * task_quantity

    amendment = ScopeAmendment.objects.create(
        booking=booking,
        proposed_by=booking.partner,
        reason=reason,
        total_paise=total_paise,
        expires_at=timezone.now() + timedelta(minutes=settings.M1_SCOPE_AMENDMENT_RESPONSE_MINUTES),
    )
    ScopeAmendmentLine.objects.create(
        amendment=amendment,
        position=1,
        kind=ScopeAmendmentLine.Kind.TASK,
        code=task_code,
        label=f"Additional: {variant.name}",
        quantity=task_quantity,
        amount_paise=total_paise,
        snapshot={"variant_id": str(variant.id), "task_rate_id": str(rate.id)},
    )
    record_transition(
        booking=booking,
        actor=booking.partner.user,
        command=BookingCommand.SCOPE_AMENDMENT_PROPOSED,
        from_status=booking.status,
        to_status=booking.status,
        reason=reason,
        idempotency_key=idempotency_key,
        context={"amendment_id": str(amendment.id), "total_paise": total_paise},
    )
    return amendment


@transaction.atomic
def decline_scope_amendment(
    *, amendment_id: UUID, customer_id: UUID, idempotency_key: str = ""
) -> ScopeAmendment:
    amendment = (
        ScopeAmendment.objects.select_for_update().select_related("booking").get(id=amendment_id)
    )
    booking = _booking_of(amendment)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    if amendment.status != ScopeAmendment.Status.PROPOSED:
        if amendment.status == ScopeAmendment.Status.CUSTOMER_DECLINED:
            return amendment
        raise BookingCommandInvalidApiError(reason="This scope amendment already has a decision.")
    _guard_amendment_not_expired(amendment)

    amendment.status = ScopeAmendment.Status.CUSTOMER_DECLINED
    amendment.responded_at = timezone.now()
    amendment.version += 1
    amendment.save(update_fields=("status", "responded_at", "version"))
    record_transition(
        booking=booking,
        actor=booking.customer,
        command=BookingCommand.SCOPE_AMENDMENT_DECLINED,
        from_status=booking.status,
        to_status=booking.status,
        idempotency_key=idempotency_key,
        context={"amendment_id": str(amendment.id)},
    )
    return amendment


@transaction.atomic
def approve_scope_amendment(
    *, amendment_id: UUID, customer_id: UUID, idempotency_key: str = ""
) -> tuple[ScopeAmendment, PaymentAttempt]:
    """Approval creates the `PriceRevision` and its `PaymentAttempt` in the same transaction —
    a Customer cannot approve extra work that never gets billed."""

    amendment = (
        ScopeAmendment.objects.select_for_update().select_related("booking").get(id=amendment_id)
    )
    booking = _booking_of(amendment)
    if booking.customer_id != customer_id:
        raise PermissionError("This Booking belongs to another Customer.")
    if amendment.status == ScopeAmendment.Status.PAYMENT_PENDING:
        existing_revision = PriceRevision.objects.select_related("payment_attempt").get(
            amendment=amendment
        )
        existing_attempt = existing_revision.payment_attempt
        if existing_attempt is None:
            raise BookingCommandInvalidApiError(
                reason="This scope amendment has no revision payment to resume."
            )
        return amendment, existing_attempt
    if amendment.status != ScopeAmendment.Status.PROPOSED:
        raise BookingCommandInvalidApiError(reason="This scope amendment already has a decision.")
    _guard_amendment_not_expired(amendment)

    amendment.status = ScopeAmendment.Status.PAYMENT_PENDING
    amendment.responded_at = timezone.now()
    amendment.version += 1
    amendment.save(update_fields=("status", "responded_at", "version"))

    attempt = PaymentAttempt.objects.create(
        checkout=None,
        purpose=PaymentAttempt.Purpose.SCOPE_AMENDMENT_REVISION,
        idempotency_key=idempotency_key,
        provider=settings.PAYMENT_PROVIDER,
        amount_paise=amendment.total_paise,
        currency=amendment.currency,
    )
    PriceRevision.objects.create(
        booking=booking,
        amendment=amendment,
        payment_attempt=attempt,
        delta_paise=amendment.total_paise,
        currency=amendment.currency,
    )
    enqueue_outbox_event(
        aggregate_type="payment_attempt",
        aggregate_id=attempt.id,
        event_type="payment_attempt.order_requested",
        idempotency_key=f"payment-order:{attempt.id}",
        payload={"payment_attempt_id": str(attempt.id)},
    )
    record_transition(
        booking=booking,
        actor=booking.customer,
        command=BookingCommand.SCOPE_AMENDMENT_APPROVED,
        from_status=booking.status,
        to_status=booking.status,
        idempotency_key=idempotency_key,
        context={"amendment_id": str(amendment.id), "payment_attempt_id": str(attempt.id)},
    )
    return amendment, attempt


def _materialize_amendment_work_tasks(
    *, booking: Booking, amendment: ScopeAmendment
) -> list[WorkTask]:
    existing = list(
        WorkTask.objects.filter(
            scope_amendment_line__amendment=amendment, kind=WorkTask.Kind.AMENDMENT
        )
    )
    if existing:
        return existing
    next_position = (WorkTask.objects.filter(booking=booking).count()) + 1
    tasks = []
    for offset, line in enumerate(amendment.lines.order_by("position")):
        tasks.append(
            WorkTask(
                booking=booking,
                scope_amendment_line=line,
                kind=WorkTask.Kind.AMENDMENT,
                position=next_position + offset,
                code=line.code,
                label=line.label,
                quantity=line.quantity,
                amount_paise=line.amount_paise,
                currency=line.currency,
            )
        )
    return list(WorkTask.objects.bulk_create(tasks))


@dataclass(frozen=True, slots=True)
class AmendmentAuthorizationOutcome:
    amendment: ScopeAmendment
    price_revision: PriceRevision
    work_tasks: list[WorkTask]


@transaction.atomic
def confirm_scope_amendment_payment(
    *, payment_attempt_id: UUID, payment: ProviderPayment
) -> AmendmentAuthorizationOutcome | None:
    """The revision-payment counterpart to `commerce.services.apply_provider_payment`.

    Deliberately separate: the shared function materializes a Booking Group from a Checkout,
    which a post-booking revision payment has neither of. Authorization here only ever moves
    one already-existing `ScopeAmendment`/`PriceRevision`, never a second money path.
    """

    attempt = PaymentAttempt.objects.select_for_update().get(id=payment_attempt_id)
    if attempt.purpose != PaymentAttempt.Purpose.SCOPE_AMENDMENT_REVISION:
        raise BookingCommandInvalidApiError(reason="This is not a scope amendment payment attempt.")
    if payment.amount_paise != attempt.amount_paise or payment.currency != attempt.currency:
        raise BookingCommandInvalidApiError(
            reason="The payment does not match the amendment total."
        )
    if attempt.status == PaymentAttempt.Status.CAPTURED:
        revision = PriceRevision.objects.select_related("amendment").get(payment_attempt=attempt)
        return AmendmentAuthorizationOutcome(
            amendment=revision.amendment,
            price_revision=revision,
            work_tasks=list(
                WorkTask.objects.filter(
                    scope_amendment_line__amendment=revision.amendment, kind=WorkTask.Kind.AMENDMENT
                )
            ),
        )
    if payment.status != "captured":
        return None

    attempt.provider_payment_id = payment.provider_payment_id
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.captured_at = timezone.now()
    attempt.reconciliation_state = PaymentAttempt.ReconciliationState.IN_SYNC
    attempt.version += 1
    attempt.save(
        update_fields=(
            "provider_payment_id",
            "status",
            "captured_at",
            "reconciliation_state",
            "version",
            "updated_at",
        )
    )

    revision = (
        PriceRevision.objects.select_for_update()
        .select_related("amendment", "booking")
        .get(payment_attempt=attempt)
    )
    amendment = revision.amendment
    booking = revision.booking
    revision.authorized_at = timezone.now()
    revision.save(update_fields=("authorized_at",))
    amendment.status = ScopeAmendment.Status.AUTHORIZED
    amendment.version += 1
    amendment.save(update_fields=("status", "version"))

    unit = booking.fulfilment_unit
    original_line = None if unit is None else unit.lines.order_by("position").first()
    if original_line is not None:
        PaymentAllocation.objects.get_or_create(
            payment_attempt=attempt,
            fulfilment_line=original_line,
            defaults={
                "fulfilment_unit": unit,
                "position": original_line.position,
                "amount_paise": attempt.amount_paise,
                "currency": attempt.currency,
                "line_snapshot": {
                    "kind": "SCOPE_AMENDMENT_REVISION",
                    "amendment_id": str(amendment.id),
                },
            },
        )

    work_tasks = _materialize_amendment_work_tasks(booking=booking, amendment=amendment)
    record_transition(
        booking=booking,
        actor=None,
        command=BookingCommand.SCOPE_AMENDMENT_AUTHORIZED,
        from_status=booking.status,
        to_status=booking.status,
        context={"amendment_id": str(amendment.id)},
    )
    return AmendmentAuthorizationOutcome(
        amendment=amendment, price_revision=revision, work_tasks=work_tasks
    )
