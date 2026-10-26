import csv
import io
from typing import Any

from django.utils import timezone

from apps.commerce.documents.render import DocumentLine, DocumentSpec, render_pdf
from apps.wallet.excel import workbook_bytes

# Prefer net over gross when both appear in totals / columns (settlement).
_PREFERRED_MONEY_KEYS = (
    "net_paise",
    "gross_paise",
    "total_revenue_paise",
    "total_paise",
    "amount_paise",
    "price_paise",
    "captured",
)

#: A PDF is for reading, not data work: past this many rows it says so and points at CSV/XLSX.
PDF_ROW_LIMIT = 500


def _pdf_total_label_and_amount(
    columns: list[str],
    rows: list[dict[str, Any]],
    totals: dict[str, Any],
) -> tuple[str, str]:
    """Money footer for PDF — never `len(rows)` when paise amounts exist."""
    for key in _PREFERRED_MONEY_KEYS:
        value = totals.get(key)
        if isinstance(value, (int, float)):
            return "Total Amount", f"₹{int(value) / 100:.2f}"

    monetary_cols = [c for c in columns if "paise" in c]
    if monetary_cols:
        preferred = next(
            (c for c in _PREFERRED_MONEY_KEYS if c in monetary_cols),
            monetary_cols[0],
        )
        total = sum(int(row.get(preferred) or 0) for row in rows)
        return "Total Amount", f"₹{total / 100:.2f}"

    return "Total Records", str(min(len(rows), PDF_ROW_LIMIT))


def export_csv(_report_name: str, columns: list[str], rows: list[dict[str, Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def export_xlsx(report_name: str, columns: list[str], rows: list[dict[str, Any]]) -> bytes:
    # Convert rows from dict to list
    list_rows: list[list[object]] = [[row.get(col, "") for col in columns] for row in rows]
    return workbook_bytes(sheet_name=report_name, headers=columns, rows=list_rows)


def export_pdf(
    report_name: str,
    columns: list[str],
    rows: list[dict[str, Any]],
    *,
    filters: dict[str, Any],
    totals: dict[str, Any],
    operator_name: str,
) -> bytes:
    capped_rows = rows[:PDF_ROW_LIMIT]

    # We will format this as a basic document
    # Using the existing render_pdf which takes DocumentLine for lines
    lines = []
    # To display table in PDF using the receipt format, we might need a single label/amount string
    # We can concatenate column values
    for row in capped_rows:
        label_parts = [str(row.get(col, "")) for col in columns[:3]]

        amt = ""
        # Find amount column if exists
        for col in columns:
            if "paise" in col:
                amt = f"₹{row.get(col, 0) / 100:.2f}"
                break
        if not amt:
            amt = str(row.get(columns[-1], ""))

        lines.append(DocumentLine(label=" | ".join(label_parts)[:60], amount=amt))

    if not lines:
        lines.append(DocumentLine(label="No records found", amount=""))

    context_lines = []
    for k, v in totals.items():
        val_str = f"₹{v / 100:.2f}" if "paise" in k else str(v)
        context_lines.append(DocumentLine(label=k.replace("_", " ").title(), amount=val_str))

    meta = [("Operator", operator_name)]
    for k, v in filters.items():
        if v:
            meta.append((k.replace("_", " ").title(), str(v)))

    footnote = ""
    if len(rows) > PDF_ROW_LIMIT:
        footnote = (
            f"Note: Showing {PDF_ROW_LIMIT} of {len(rows)} records. Use CSV/XLSX for full export."
        )

    total_label_str, total_amount_str = _pdf_total_label_and_amount(columns, rows, totals)

    spec = DocumentSpec(
        title=f"{report_name} Report",
        number=timezone.now().strftime("%Y%m%d%H%M"),
        issued_on=timezone.now(),
        issuer_name="Vsolve Hub Operations",
        buyer_name="Internal Use",
        lines=tuple(lines),
        total_label=total_label_str,
        total_amount=total_amount_str,
        meta=tuple(meta),
        context_heading="Totals",
        context_lines=tuple(context_lines),
        footnote=footnote,
    )

    return render_pdf(spec)
