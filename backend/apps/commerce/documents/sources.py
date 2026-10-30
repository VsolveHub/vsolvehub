"""Turn a stored financial record into a `DocumentSpec`.

One function per document this platform issues.

Kept apart from `render` so the renderer never learns what a `TaxDocument` is, and apart from the
views so the mapping can be tested without an HTTP request. Every amount is formatted here
once, through the package-local `money` helper — the renderer receives strings and does no
arithmetic at all.
"""

from datetime import UTC, datetime

from django.conf import settings

from apps.commerce.models import TaxDocument

from .money import format_money
from .render import DocumentLine, DocumentSpec

#: Said on an M1 booking document once the issuer is GST-registered. Kept here rather than in the
#: renderer because it is a statement about *this* document, and the M2 receipt's equivalent says
#: something quite different.
INVOICE_FOOTNOTE = (
    "Issued by V Solve Hub for services booked through the platform. Quote the number above if "
    "you contact us about this payment."
)

#: The same document before GST registration. It must say what it is: a receipt that claimed to
#: be a tax invoice, or itemised tax, without a GSTIN behind it would be a claim nobody can make.
BOOKING_RECEIPT_FOOTNOTE = (
    "This is a receipt for money paid to V Solve Hub for services booked through the platform. "
    "It is <b>not a tax invoice</b>. Quote the number above if you contact us about this payment."
)

#: Said on every M2 access receipt. The distinction is not decoration: an access fee has no
#: `Order`, `TaxDocument.order` is not nullable, and GST treatment of these fees is an open owner
#: decision — so calling this an invoice would make a claim nobody has approved.
RECEIPT_FOOTNOTE = (
    "This is a receipt for money received by V Solve Hub. It is <b>not a tax invoice</b>. It does "
    "not cover money paid directly to the professional for the work itself, which is settled "
    "between you and them."
)


def order_invoice_spec(document: TaxDocument) -> DocumentSpec:
    """An M1 booking invoice, from its `TaxDocument` and lines.

    The document is already numbered, already totalled and already has its lines — issuing it is
    `_issue_document`'s job at capture, and this only reads. That separation is why a re-download
    can never allocate a second number.
    """
    order = document.order
    gstin = _issuer_gstin()
    lines = tuple(
        DocumentLine(
            label=line.label,
            amount=format_money(line.total_paise),
            quantity=line.quantity,
            # Tax is itemised only by a registered issuer; see `BOOKING_RECEIPT_FOOTNOTE`.
            note=(
                f"includes {format_money(line.tax_paise)} tax" if gstin and line.tax_paise else ""
            ),
        )
        for line in document.lines.all()
    )

    return DocumentSpec(
        title=booking_document_title(document.kind),
        number=str(document),
        issued_on=document.issued_at or document.created_at,
        issuer_name=issuer_name(),
        buyer_name=_person(order.customer),
        lines=lines,
        total_label="Total paid",
        total_amount=format_money(document.total_paise),
        issuer_address=issuer_address(),
        issuer_contact=issuer_contact(),
        footnote=INVOICE_FOOTNOTE if gstin else BOOKING_RECEIPT_FOOTNOTE,
        # The flag is the model's own. A test invoice that printed like a real one is a test
        # invoice somebody files with their accounts.
        is_draft=document.is_test,
        meta=(("Order", str(order.id)), *((("GSTIN", gstin),) if gstin else ())),
    )


def booking_document_title(kind: str) -> str:
    """What an M1 booking document is called: a tax invoice only once a GSTIN is configured."""
    if kind != TaxDocument.Kind.INVOICE:
        return "Credit note"
    return "Tax invoice" if _issuer_gstin() else "Payment receipt"


def sample_booking_receipt_spec() -> DocumentSpec:
    """The booking document as a customer receives it, filled with invented values.

    For anyone who has to see one before they have booked: Razorpay's activation review asks for
    exactly this. It goes through `booking_document_title` and the same issuer settings as a real
    one, so it can never show a layout or a claim the real document does not make, and the
    watermark says SAMPLE across the page so it can never be mistaken for one.
    """
    gstin = _issuer_gstin()

    def tax_note(tax_paise: int) -> str:
        return f"includes {format_money(tax_paise)} tax" if gstin else ""

    return DocumentSpec(
        title=booking_document_title(TaxDocument.Kind.INVOICE),
        number="SAMPLE-0001",
        issued_on=datetime(2026, 10, 1, 10, 30, tzinfo=UTC),
        issuer_name=issuer_name(),
        buyer_name="Sample Customer",
        lines=(
            DocumentLine(
                label="Fan installation (ceiling fan)",
                amount=format_money(29_900),
                quantity=1,
                note=tax_note(4_561),
            ),
            DocumentLine(
                label="Switch / socket repair",
                amount=format_money(13_800),
                quantity=2,
                note=tax_note(2_105),
            ),
            DocumentLine(label="Platform fee", amount=format_money(2_900), quantity=1),
        ),
        total_label="Total paid",
        total_amount=format_money(46_600),
        issuer_address=issuer_address(),
        issuer_contact=issuer_contact(),
        footnote=INVOICE_FOOTNOTE if gstin else BOOKING_RECEIPT_FOOTNOTE,
        watermark="SAMPLE",
        meta=(("Order", "SAMPLE"), *((("GSTIN", gstin),) if gstin else ())),
    )


def access_receipt_spec(
    *,
    number: str,
    purpose: str,
    amount_paise: int,
    paid_at: object,
    buyer_name: str,
    context_heading: str = "",
    context_lines: tuple[DocumentLine, ...] = (),
) -> DocumentSpec:
    """An M2 access-fee receipt: the booking fee, the A3 unlock or the A5 visit plan.

    Takes values rather than a model because the three live in three tables — `BookingFee`,
    `QuoteUnlock`, `VisitPlan` — and `requirements.selectors.access_receipt_for` has already done
    the work of deciding which one applies. A second resolver here would be a second answer to the
    same question.
    """
    return DocumentSpec(
        title="Payment receipt",
        number=number,
        issued_on=paid_at,  # type: ignore[arg-type]
        issuer_name=issuer_name(),
        buyer_name=buyer_name,
        lines=(DocumentLine(label=purpose, amount=format_money(amount_paise)),),
        total_label="Paid to V Solve Hub",
        total_amount=format_money(amount_paise),
        issuer_address=issuer_address(),
        issuer_contact=issuer_contact(),
        context_heading=context_heading,
        context_lines=context_lines,
        footnote=RECEIPT_FOOTNOTE,
    )


def _person(user: object) -> str:
    """A readable name for the buyer, falling back to the phone number.

    `display_name` is blank on an account that never filled a profile in, and a document addressed
    to an empty string is worse than one addressed to a phone number the Customer recognises.
    """
    name = str(getattr(user, "display_name", "") or "").strip()
    if name:
        return name
    return str(getattr(user, "phone_number", "") or "Customer")


def issuer_name() -> str:
    return str(settings.DOCUMENT_ISSUER_NAME).strip() or "V Solve Hub"


def issuer_address() -> str:
    return str(settings.DOCUMENT_ISSUER_ADDRESS).strip()


def _issuer_gstin() -> str:
    return str(settings.DOCUMENT_ISSUER_GSTIN).strip().upper()


def issuer_contact() -> str:
    return str(settings.DOCUMENT_ISSUER_CONTACT).strip()
