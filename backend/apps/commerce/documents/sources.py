"""Turn a stored financial record into a `DocumentSpec`.

One function per document this platform issues.

Kept apart from `render` so the renderer never learns what a `TaxDocument` is, and apart from the
views so the mapping can be tested without an HTTP request. Every amount is formatted here
once, through the package-local `money` helper — the renderer receives strings and does no
arithmetic at all.
"""

from apps.commerce.models import TaxDocument

from .money import format_money
from .render import DocumentLine, DocumentSpec

#: The legal person issuing both documents. A constant rather than a setting until there is a
#: second entity: `TaxDocument.legal_entity_code` already exists for that day, and inventing a
#: settings lookup before there is anything to look up hides which one is real.
ISSUER_NAME = "V Solve Hub"

#: Said on every M1 invoice. Kept here rather than in the renderer because it is a statement about
#: *this* document, and the M2 receipt's equivalent says something quite different.
INVOICE_FOOTNOTE = (
    "Issued by V Solve Hub for services booked through the platform. Quote the number above if "
    "you contact us about this payment."
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
    customer = order.customer
    lines = tuple(
        DocumentLine(
            label=line.label,
            amount=format_money(line.total_paise),
            quantity=line.quantity,
            note=(f"includes {format_money(line.tax_paise)} tax" if line.tax_paise else ""),
        )
        for line in document.lines.all()
    )

    return DocumentSpec(
        title="Tax invoice" if document.kind == TaxDocument.Kind.INVOICE else "Credit note",
        number=str(document),
        issued_on=document.issued_at or document.created_at,
        issuer_name=ISSUER_NAME,
        buyer_name=_person(customer),
        lines=lines,
        total_label="Total paid",
        total_amount=format_money(document.total_paise),
        footnote=INVOICE_FOOTNOTE,
        # The flag is the model's own. A test invoice that printed like a real one is a test
        # invoice somebody files with their accounts.
        is_draft=document.is_test,
        meta=(("Order", str(order.id)),),
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
        issuer_name=ISSUER_NAME,
        buyer_name=buyer_name,
        lines=(DocumentLine(label=purpose, amount=format_money(amount_paise)),),
        total_label="Paid to V Solve Hub",
        total_amount=format_money(amount_paise),
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
