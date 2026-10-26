"""Rendered financial documents: the invoice a Customer downloads, and the receipt beside it.

One renderer for both milestones. `DocumentSpec` is what M1's `TaxDocument` and M2's access-fee
receipt each flatten into, and `render_pdf` is the only thing that draws — so a change to how a
document looks is one change, and an M1 invoice and an M2 receipt can never drift into looking like
they came from two companies.
"""

from .render import DocumentLine, DocumentSpec, render_pdf
from .sources import access_receipt_spec, order_invoice_spec, sample_booking_receipt_spec

__all__ = [
    "DocumentLine",
    "DocumentSpec",
    "access_receipt_spec",
    "order_invoice_spec",
    "render_pdf",
    "sample_booking_receipt_spec",
]
