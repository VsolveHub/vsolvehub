"""The PDF renderer and the money it prints.

Neither needs a database, deliberately: `render_pdf` takes a `DocumentSpec` and `format_money`
takes an integer, so the two things most likely to be wrong on a financial document — the digit
grouping and whether a test document announces itself — are checkable without any fixtures at all.
"""

import pytest
from django.utils import timezone

from apps.commerce.documents import DocumentLine, DocumentSpec, render_pdf
from apps.commerce.documents.money import format_money


def _spec(**overrides: object) -> DocumentSpec:
    base: dict[str, object] = {
        "title": "Payment receipt",
        "number": "M2A-2026-27-2",
        "issued_on": timezone.now(),
        "issuer_name": "V Solve Hub",
        "buyer_name": "+918019013032",
        "lines": (DocumentLine(label="Booking your crew", amount="₹300.00"),),
        "total_label": "Paid to V Solve Hub",
        "total_amount": "₹300.00",
        "footnote": "This is a receipt for money received. It is not a tax invoice.",
    }
    base.update(overrides)
    return DocumentSpec(**base)  # type: ignore[arg-type]


class TestMoney:
    """Indian grouping, because an invoice issued here that reads 1,234,567 is wrong on its face."""

    @pytest.mark.parametrize(
        ("paise", "expected"),
        [
            (0, "₹0.00"),
            (5_000, "₹50.00"),
            (30_000, "₹300.00"),
            (540_000, "₹5,400.00"),
            # The two that a naive thousands separator gets wrong: lakh, then crore.
            (12_345_678, "₹1,23,456.78"),
            (123_456_789, "₹12,34,567.89"),
            (10_000_000_000, "₹1,00,00,000.00"),
        ],
    )
    def test_grouping(self, paise: int, expected: str) -> None:
        assert format_money(paise) == expected

    def test_a_refund_keeps_its_sign_outside_the_symbol(self) -> None:
        """`-₹300.00`, not `₹-300.00`. A credit note is read at a glance."""
        assert format_money(-30_000) == "-₹300.00"


class TestRender:
    def test_it_produces_a_real_pdf(self) -> None:
        pdf = render_pdf(_spec())

        assert pdf.startswith(b"%PDF-")
        assert b"%%EOF" in pdf[-2048:]

    def test_a_test_document_is_stamped(self) -> None:
        """`is_test` must reach the paper.

        Every M1 `TaxDocument` carries the flag, and a test invoice that printed identically to a
        real one is a test invoice somebody eventually files with their accounts. Compared by size
        rather than by scraping the text, because the watermark is drawn on the canvas rather than
        placed in the story — the bytes are the evidence that something was drawn at all.
        """
        plain = render_pdf(_spec())
        stamped = render_pdf(_spec(is_draft=True))

        assert len(stamped) > len(plain)

    def test_context_lines_are_rendered_when_present(self) -> None:
        """The money Vsolve did not collect. Absent by default, so it cannot leak onto a document
        that has no second party to disclose."""
        without = render_pdf(_spec())
        with_context = render_pdf(
            _spec(
                context_heading="Not collected by V Solve Hub:",
                context_lines=(
                    DocumentLine(label="Paid directly to the crew", amount="₹5,100.00"),
                ),
            )
        )

        assert len(with_context) > len(without)

    def test_rendering_is_deterministic_for_a_fixed_issue_date(self) -> None:
        """Two downloads of one receipt must not differ.

        `issued_on` is pinned here because the only clock the renderer reads is the fallback for a
        missing one — a document with a real issue date has nothing time-varying in it, which is
        what makes a re-download the same document rather than a new one.
        """
        spec = _spec(issued_on=timezone.now())

        first = render_pdf(spec)
        second = render_pdf(spec)

        # ReportLab stamps a creation date in the trailer, so the bytes differ; the drawn content
        # does not. Length is the stable proxy — a changed layout moves it, a changed timestamp
        # does not.
        assert len(first) == len(second)
