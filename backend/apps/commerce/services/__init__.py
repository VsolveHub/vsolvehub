"""Server-authoritative group payment, refund, reconciliation and document commands.

The package map, in the order money moves through it:

- `base` — money-rule constants, the exact-allocation split, financial-year and document-series
  numbering, the financial-exception opener, and the `TaxDocument` writer. Imports no sibling.
- `payments` — the locked pre-flight, the `PaymentAttempt` (cart and standalone), the provider
  order.
- `capture` — `apply_provider_payment` and what a capture becomes: an `Order` with its `Booking`s
  and invoice, or an M2 charge handed to the domain that sold it.
- `refunds` — requesting a refund (allocated or standalone), submitting it, and applying the
  provider's answer to the refund, the attempt, the Order and the credit note.
- `reconciliation` — verified webhooks and the pull-based repair sweeps, both of which delegate
  to the commands above rather than writing payment state themselves.
- `simulation` — the development-only hand capture, and the checkout-free ownership check it
  needs.
"""

from .base import (
    FINANCIAL_YEAR_START_MONTH,
    PAYMENT_FINAL_STATES,
    PAYMENT_START_SAFETY_SECONDS,
    _allocate_exact,
    _document_sequence,
    _financial_year,
    _issue_document,
    _open_exception,
    allocate_document_number,
)
from .capture import (
    A10_CAPTURE_PURPOSES,
    M2_CAPTURE_PURPOSES,
    _apply_a10_capture,
    _apply_m2_capture,
    _materialize_captured_group,
    _request_automatic_refund,
    _try_confirm_group_capacity,
    _validate_payment_amount,
    apply_provider_payment,
    capture_authorized_payment,
)
from .payments import (
    _locked_payment_context,
    create_provider_order,
    initiate_payment_attempt,
    initiate_standalone_payment_attempt,
)
from .reconciliation import (
    _payment_from_event,
    process_payment_webhook,
    reconcile_payment_attempt,
    reconcile_refund,
    record_verified_webhook,
)
from .refunds import (
    _apply_refund_provider_result,
    request_standalone_refund,
    request_unit_refund,
    submit_refund,
)
from .simulation import (
    _standalone_attempt_belongs_to,
    attempt_belongs_to,
    simulate_capture,
)

__all__ = [
    "A10_CAPTURE_PURPOSES",
    "FINANCIAL_YEAR_START_MONTH",
    "M2_CAPTURE_PURPOSES",
    "PAYMENT_FINAL_STATES",
    "PAYMENT_START_SAFETY_SECONDS",
    "_allocate_exact",
    "_apply_a10_capture",
    "_apply_m2_capture",
    "_apply_refund_provider_result",
    "_document_sequence",
    "_financial_year",
    "_issue_document",
    "_locked_payment_context",
    "_materialize_captured_group",
    "_open_exception",
    "_payment_from_event",
    "_request_automatic_refund",
    "_standalone_attempt_belongs_to",
    "_try_confirm_group_capacity",
    "_validate_payment_amount",
    "allocate_document_number",
    "apply_provider_payment",
    "attempt_belongs_to",
    "capture_authorized_payment",
    "create_provider_order",
    "initiate_payment_attempt",
    "initiate_standalone_payment_attempt",
    "process_payment_webhook",
    "reconcile_payment_attempt",
    "reconcile_refund",
    "record_verified_webhook",
    "request_standalone_refund",
    "request_unit_refund",
    "simulate_capture",
    "submit_refund",
]
