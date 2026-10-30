"""Draw one financial document to PDF bytes.

## Why ReportLab and not an HTML renderer

WeasyPrint would let the document be a Django template, which is pleasant. It also needs GTK and
Pango installed as **system** libraries, which do not install cleanly on Windows — and a financial
document that only some developers can render is a financial document nobody can review. ReportLab
is pure Python wheels everywhere, so the renderer behaves the same on a laptop, in CI and in
production.

## Why a spec rather than a model

`render_pdf` takes a `DocumentSpec` and knows nothing about `TaxDocument`, `BookingFee` or
`VisitPlan`. M1 invoices and M2 access receipts are genuinely different records — different tables,
different numbering reasons, different legal standing — and the one thing they must share is how
they *look*. A renderer that reached into models would grow a branch per record type, which is how
two documents from one company end up laid out like they came from two.

## The test watermark is load-bearing

Every M1 `TaxDocument` carries `is_test`, and a test document that renders indistinguishably from a
real one is a document somebody eventually files with their accounts. When the flag is set the page
is stamped across the middle, in a grey that still reads on a monochrome printer.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from typing import Any

from django.utils import timezone
from reportlab.graphics.shapes import Circle, Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

#: Near-black rather than black, and one muted grey, so the page photocopies and scans legibly —
#: still the two things people actually do with an invoice.
_INK = colors.HexColor("#1A1A1A")
_MUTED = colors.HexColor("#5A5A5A")
_RULE = colors.HexColor("#D8D8D8")

_CONTENT_WIDTH = 110 * mm
_AMOUNT_WIDTH = 45 * mm


@dataclass(frozen=True, slots=True)
class DocumentLine:
    """One charged thing. `quantity` is rendered only when it is not one."""

    label: str
    amount: str
    quantity: int = 1
    #: Sub-text under the label: what the line covers, or who settles it.
    note: str = ""


@dataclass(frozen=True, slots=True)
class DocumentSpec:
    """Everything on the page, already formatted and already authorised.

    Amounts arrive as **strings**. The renderer never divides paise by a hundred and never picks a
    currency symbol: the client and the server already agree on how money reads, and a third
    formatter living inside a PDF would be the one that eventually rounds differently from the
    screen the Customer read before paying.
    """

    title: str
    number: str
    issued_on: datetime | None
    issuer_name: str
    buyer_name: str
    lines: tuple[DocumentLine, ...]
    total_label: str
    total_amount: str
    issuer_address: str = ""
    issuer_contact: str = ""
    #: Money the issuer did **not** collect, disclosed under the total. An A3 booking costs far more
    #: than the fee Vsolve takes, and a document that mentioned only its own slice would leave the
    #: reader wondering where the rest went.
    context_lines: tuple[DocumentLine, ...] = ()
    context_heading: str = ""
    #: What this document legally is. Never optional — it is the line that stops a receipt being
    #: mistaken for a tax invoice.
    footnote: str = ""
    is_draft: bool = False
    meta: tuple[tuple[str, str], ...] = field(default_factory=tuple)
    #: Words drawn across the page. `is_draft` implies TEST DOCUMENT; a published example says
    #: SAMPLE, so a reviewer's copy can never be filed as a real receipt either.
    watermark: str = ""


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "doc-title", parent=base["Title"], fontSize=18, leading=22, alignment=0, textColor=_INK
        ),
        "body": ParagraphStyle(
            "doc-body", parent=base["Normal"], fontSize=9.5, leading=14, textColor=_INK
        ),
        "muted": ParagraphStyle(
            "doc-muted", parent=base["Normal"], fontSize=8.5, leading=12, textColor=_MUTED
        ),
        "right": ParagraphStyle(
            "doc-right",
            parent=base["Normal"],
            fontSize=9.5,
            leading=14,
            alignment=TA_RIGHT,
            textColor=_INK,
        ),
        "total": ParagraphStyle(
            "doc-total",
            parent=base["Normal"],
            fontSize=13,
            leading=17,
            alignment=TA_RIGHT,
            textColor=_INK,
        ),
    }


def _watermark(text: str) -> Callable[[Canvas, Any], None]:
    def draw(canvas: Canvas, _doc: Any) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 60)
        canvas.setFillColor(colors.HexColor("#E4E4E4"))
        canvas.translate(A4[0] / 2, A4[1] / 2)
        canvas.rotate(38)
        canvas.drawCentredString(0, 0, text)
        canvas.restoreState()

    return draw


def _no_decoration(_canvas: Canvas, _doc: Any) -> None:
    """ReportLab requires a page callback; a plain document simply has nothing to draw."""
    return None


def _rows(lines: tuple[DocumentLine, ...], styles: dict[str, ParagraphStyle]) -> Table:
    rows: list[list[Any]] = []
    for line in lines:
        label = line.label if line.quantity == 1 else f"{line.label} x {line.quantity}"
        cell: list[Any] = [Paragraph(label, styles["body"])]
        if line.note:
            cell.append(Paragraph(line.note, styles["muted"]))
        rows.append([cell, Paragraph(line.amount, styles["right"])])

    table = Table(rows, colWidths=[_CONTENT_WIDTH, _AMOUNT_WIDTH], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, _RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _brand_mark() -> Drawing:
    """Small vector mark so every PDF carries the brand without a filesystem asset."""

    mark = Drawing(12 * mm, 12 * mm)
    mark.add(
        Circle(6 * mm, 6 * mm, 5.5 * mm, fillColor=colors.HexColor("#0F766E"), strokeColor=None)
    )
    mark.add(
        String(
            6 * mm,
            4.1 * mm,
            "V",
            textAnchor="middle",
            fontName="Helvetica-Bold",
            fontSize=13,
            fillColor=colors.white,
        )
    )
    return mark


def render_pdf(spec: DocumentSpec) -> bytes:
    """One document, as PDF bytes. Same spec in, same page out."""
    styles = _styles()
    watermark = spec.watermark or ("TEST DOCUMENT" if spec.is_draft else "")
    buffer = BytesIO()

    document = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"{spec.title} {spec.number}",
        author=spec.issuer_name,
        subject=spec.title,
    )
    frame = Frame(
        document.leftMargin, document.bottomMargin, document.width, document.height, id="page"
    )
    document.addPageTemplates(
        [
            PageTemplate(
                id="default",
                frames=[frame],
                onPage=_watermark(watermark) if watermark else _no_decoration,
            )
        ]
    )

    issued = spec.issued_on or timezone.now()
    header = (
        DocumentLine(label="Number", amount=spec.number),
        DocumentLine(label="Date", amount=timezone.localtime(issued).strftime("%d %b %Y")),
        DocumentLine(label="From", amount=spec.issuer_name),
        DocumentLine(label="To", amount=spec.buyer_name),
        *(DocumentLine(label=key, amount=value) for key, value in spec.meta),
    )

    issuer_lines = [f"<b>{spec.issuer_name}</b>"]
    if spec.issuer_address:
        issuer_lines.append(spec.issuer_address)
    if spec.issuer_contact:
        issuer_lines.append(spec.issuer_contact)
    masthead = Table(
        [
            [
                _brand_mark(),
                Paragraph("<br/>".join(issuer_lines), styles["muted"]),
                Paragraph(spec.title, styles["title"]),
            ]
        ],
        colWidths=[14 * mm, 91 * mm, 50 * mm],
        hAlign="LEFT",
    )
    masthead.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, -1), 1.2, colors.HexColor("#0F766E")),
            ]
        )
    )

    story: list[Any] = [
        masthead,
        Spacer(1, 3 * mm),
        _rows(header, styles),
        Spacer(1, 8 * mm),
        _rows(spec.lines, styles),
        Spacer(1, 4 * mm),
    ]

    total = Table(
        [
            [
                Paragraph(spec.total_label, styles["right"]),
                Paragraph(spec.total_amount, styles["total"]),
            ]
        ],
        colWidths=[_CONTENT_WIDTH, _AMOUNT_WIDTH],
        hAlign="LEFT",
    )
    total.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(total)

    if spec.context_lines:
        story.extend(
            [
                Spacer(1, 10 * mm),
                KeepTogether(
                    [
                        Paragraph(spec.context_heading, styles["body"]),
                        Spacer(1, 2 * mm),
                        _rows(spec.context_lines, styles),
                    ]
                ),
            ]
        )

    if spec.footnote:
        story.extend([Spacer(1, 10 * mm), Paragraph(spec.footnote, styles["muted"])])

    document.build(story)
    return buffer.getvalue()
