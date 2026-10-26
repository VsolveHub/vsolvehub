"""Primitives shared by every command in this package: money rules, numbering, documents.

The bottom layer. Everything here is read or called by more than one slice — the money-rule
constants, the exact-allocation split, the financial-year and document-series counters, the
financial-exception opener and the statutory `TaxDocument` writer. The boundary is one-way:
nothing in this module imports a sibling submodule, which is what keeps the package free of
an import cycle.
"""

from collections.abc import Iterable
from datetime import date
from uuid import UUID

from django.conf import settings
from django.db.models import Max
from django.utils import timezone

from apps.carts.models import FulfilmentUnit
from apps.commerce.models import (
    Booking,
    DocumentSequence,
    FinancialException,
    Order,
    PaymentAllocation,
    PaymentAttempt,
    Refund,
    TaxDocument,
    TaxDocumentLine,
)

PAYMENT_START_SAFETY_SECONDS = 30
FINANCIAL_YEAR_START_MONTH = 4
PAYMENT_FINAL_STATES = {
    PaymentAttempt.Status.CAPTURED,
    PaymentAttempt.Status.PARTIALLY_REFUNDED,
    PaymentAttempt.Status.REFUNDED,
}


def _allocate_exact(total: int, weights: list[int]) -> list[int]:
    """Split `total` across `weights` so the parts sum to exactly `total`.

    No part may exceed its own weight, and a weight of zero receives nothing. That is a
    correctness requirement, not a rounding preference: the only caller splits a Quote's
    tax across the invoice lines, and `commerce_document_line_tax_lte_total` refuses a
    line taxed above its own amount.

    The rounding remainder used to be handed out from index 0 regardless of basis. Every
    Quote carries a ₹0 `minimum_visit_topup` line — nothing is priced below the ₹49 floor
    any more, so the top-up is always zero — and once a cart held enough lines for the
    remainder to reach one, that ₹0 line was assigned a paise of tax. Postgres rejected
    the row, the `IntegrityError` escaped `_materialize_captured_group`, and the whole
    capture rolled back as a 500 on a payment the provider had already taken.
    """

    denominator = sum(weights)
    if total < 0 or not weights or denominator <= 0 or total > denominator:
        raise ValueError("A positive allocation basis at least as large as the total is required.")
    allocations = [total * weight // denominator for weight in weights]
    remainder = total - sum(allocations)
    for index, weight in enumerate(weights):
        if remainder == 0:
            break
        share = min(weight - allocations[index], remainder)
        allocations[index] += share
        remainder -= share
    return allocations


def _financial_year(on_date: date) -> str:
    start = on_date.year if on_date.month >= FINANCIAL_YEAR_START_MONTH else on_date.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _open_exception(
    *,
    kind: str,
    code: str,
    attempt: PaymentAttempt | None = None,
    refund: Refund | None = None,
    context: dict[str, object] | None = None,
) -> FinancialException:
    exception, _created = FinancialException.objects.get_or_create(
        kind=kind,
        status=FinancialException.Status.OPEN,
        payment_attempt=attempt,
        refund=refund,
        code=code,
        defaults={"context": context or {}},
    )
    return exception


def _document_sequence(*, kind: str, issued_on: date) -> tuple[str, str, int]:
    financial_year = _financial_year(issued_on)
    prefix = "INV" if kind == TaxDocument.Kind.INVOICE else "CRN"
    series = f"{prefix}-{financial_year}"
    sequence, _created = DocumentSequence.objects.select_for_update().get_or_create(
        legal_entity_code=settings.PAYMENT_LEGAL_ENTITY_CODE,
        financial_year=financial_year,
        kind=kind,
        series=series,
    )
    # Never hand out a number a document in this series already carries, even if the counter row
    # fell behind (for example after the counter table was reset but the documents were kept).
    max_existing = TaxDocument.objects.filter(series=series).aggregate(m=Max("sequence"))["m"] or 0
    sequence.last_sequence = max(sequence.last_sequence, max_existing)
    sequence.last_sequence += 1
    sequence.save(update_fields=("last_sequence",))
    return financial_year, series, sequence.last_sequence


def _issue_document(
    *,
    order: Order,
    attempt: PaymentAttempt,
    kind: str,
    allocations: Iterable[PaymentAllocation],
    total_paise: int,
    allocation_amounts: dict[UUID, int] | None = None,
) -> TaxDocument:
    now = timezone.now()
    financial_year, series, sequence = _document_sequence(kind=kind, issued_on=now.date())
    tax_rate = int(order.quote.pricing_policy.gst_rate_basis_points)
    allocation_list = list(allocations)
    line_amounts = [
        allocation.amount_paise if allocation_amounts is None else allocation_amounts[allocation.id]
        for allocation in allocation_list
    ]
    if sum(line_amounts) != total_paise:
        raise ValueError("Financial document lines do not reconcile to the document total.")
    if kind == TaxDocument.Kind.INVOICE:
        tax_allocations = _allocate_exact(order.quote.tax_paise, line_amounts)
    else:
        invoice_taxes = dict(
            TaxDocumentLine.objects.filter(
                document__order=order,
                document__kind=TaxDocument.Kind.INVOICE,
                payment_allocation_id__in=[allocation.id for allocation in allocation_list],
            ).values_list("payment_allocation_id", "tax_paise")
        )
        tax_allocations = [invoice_taxes.get(allocation.id, 0) for allocation in allocation_list]
    tax_total = sum(tax_allocations)
    document = TaxDocument.objects.create(
        order=order,
        payment_attempt=attempt,
        booking_group=order.booking_group,
        kind=kind,
        legal_entity_code=settings.PAYMENT_LEGAL_ENTITY_CODE,
        financial_year=financial_year,
        series=series,
        sequence=sequence,
        total_paise=total_paise,
        tax_snapshot={
            "gst_rate_basis_points": tax_rate,
            "tax_paise": tax_total,
            "currency": order.currency,
            "legal_review_approved": settings.PAYMENT_LIVE_COLLECTIONS_APPROVED,
        },
        is_test=not settings.PAYMENT_LIVE_COLLECTIONS_APPROVED,
        issued_at=now,
    )
    for position, (allocation, line_amount, tax_paise) in enumerate(
        zip(allocation_list, line_amounts, tax_allocations, strict=True),
        start=1,
    ):
        snapshot = allocation.line_snapshot
        TaxDocumentLine.objects.create(
            document=document,
            payment_allocation=allocation,
            position=position,
            code=str(snapshot.get("code", "service")),
            label=str(snapshot.get("label", "Service")),
            quantity=int(snapshot.get("quantity", 1)),
            total_paise=line_amount,
            tax_paise=tax_paise,
            currency=allocation.currency,
            snapshot=snapshot,
        )
    return document


def allocate_document_number(*, kind: str, issued_on: date | None = None) -> tuple[str, int]:
    """Take the next number in one document series, for a record that is not a `TaxDocument`.

    M2 access fees need a durable, gapless receipt reference (`M2-BE-415`) and have no `Order`, so
    they cannot be `TaxDocument` rows — that model's `order` is not nullable, and making it
    nullable would weaken the invariant every M1 invoice depends on. Reusing `DocumentSequence`
    keeps one numbering authority instead of a second counter that could collide with it.
    """
    financial_year = _financial_year(issued_on or timezone.localdate())
    series = f"M2A-{financial_year}"
    sequence, _created = DocumentSequence.objects.select_for_update().get_or_create(
        legal_entity_code=settings.PAYMENT_LEGAL_ENTITY_CODE,
        financial_year=financial_year,
        kind=kind,
        series=series,
    )
    sequence.last_sequence += 1
    sequence.save(update_fields=("last_sequence",))
    return series, sequence.last_sequence


def _cancel_domain_booking_on_refund(*, attempt: PaymentAttempt, refund: Refund) -> None:
    """Cancel linked bookings / release capacity after a payment is fully refunded.

    Fail-closed and purpose-aware. Does not create a second Refund — customer cancel
    entry points already request refunds; calling them here would loop.
    """
    if attempt.purpose in (
        PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
        PaymentAttempt.Purpose.A7_RENTAL_DEPOSIT,
    ):
        from apps.rental.services import (  # noqa: PLC0415 - avoids a module import cycle
            cancel_booking_on_refund,
        )

        cancel_booking_on_refund(payment_attempt_id=attempt.id)
        return

    if attempt.purpose == PaymentAttempt.Purpose.A9_STAY_RESERVATION:
        from apps.stay.services import (  # noqa: PLC0415 - avoids a module import cycle
            cancel_reservation_on_refund,
        )

        cancel_reservation_on_refund(payment_attempt_id=attempt.id)
        return

    if attempt.purpose != PaymentAttempt.Purpose.BOOKING_GROUP:
        return

    from apps.fulfilment.services import (  # noqa: PLC0415 - avoids a module import cycle
        cancel_booking_group_on_refund,
    )
    from apps.payouts.services import (  # noqa: PLC0415 - avoids a module import cycle
        reverse_booking_earning_for_refund,
    )

    cancel_booking_group_on_refund(payment_attempt=attempt, refund=refund)

    unit_ids = list(attempt.allocations.values_list("fulfilment_unit_id", flat=True))
    if not unit_ids:
        group_id = attempt.booking_group_id
        if group_id is None and refund.order is not None:
            group_id = refund.order.booking_group_id
        if group_id is not None:
            unit_ids = list(
                FulfilmentUnit.objects.filter(booking_group_id=group_id).values_list(
                    "id", flat=True
                )
            )

    booking_ids = Booking.objects.filter(fulfilment_unit_id__in=unit_ids).values_list(
        "id", flat=True
    )
    for booking_id in set(booking_ids):
        reverse_booking_earning_for_refund(
            booking_id=booking_id,
            refund_id=refund.id,
            actor=refund.requested_by,
        )
