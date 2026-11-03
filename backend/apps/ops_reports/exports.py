"""Report files: the same columns, titles and values the Reports page shows.

Money is written in rupees (two decimals) under a "(₹)" title, so a spreadsheet can add it up;
dates are DD/MM/YYYY in local time, the way the page shows them.
"""

import csv
import io
from datetime import date, datetime
from typing import Any

from django.utils import timezone

from apps.commerce.documents.render import DocumentLine, DocumentSpec, render_pdf
from apps.wallet.excel import workbook_bytes

from .reports import Column

#: A PDF is for reading, not data work: past this many rows it says so and points at CSV/XLSX.
PDF_ROW_LIMIT = 500


def header(column: Column) -> str:
    return f"{column.label} (₹)" if column.kind == "money" else column.label


def cell(column: Column, value: Any) -> Any:
    """One value as a file shows it."""
    if value is None or value == "":
        return ""
    if column.kind == "money":
        return round(int(value) / 100, 2)
    if isinstance(value, datetime):
        return timezone.localtime(value).strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return value


def table(columns: list[Column], rows: list[dict[str, Any]]) -> tuple[list[str], list[list[Any]]]:
    return (
        [header(column) for column in columns],
        [[cell(column, row.get(column.key)) for column in columns] for row in rows],
    )


def export_csv(columns: list[Column], rows: list[dict[str, Any]]) -> bytes:
    headers, body = table(columns, rows)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    # Two decimals for rupees ("228.00"); a spreadsheet still reads them as numbers.
    writer.writerows(
        [f"{value:.2f}" if isinstance(value, float) else value for value in row] for row in body
    )
    # A byte-order mark so Excel opens "₹" and Indian names correctly.
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def export_xlsx(report_name: str, columns: list[Column], rows: list[dict[str, Any]]) -> bytes:
    headers, body = table(columns, rows)
    return workbook_bytes(sheet_name=report_name[:31], headers=headers, rows=body)


def _rupees(paise: int) -> str:
    return f"₹{paise / 100:,.2f}"


def export_pdf(
    report_name: str,
    columns: list[Column],
    rows: list[dict[str, Any]],
    *,
    filters: dict[str, str],
    totals: list[dict[str, Any]],
    operator_name: str,
) -> bytes:
    """A readable summary: totals first, then up to `PDF_ROW_LIMIT` rows."""
    money_column = next((c for c in columns if c.kind == "money"), None)
    text_columns = [c for c in columns if c.kind != "money"][:3]
    lines = []
    for row in rows[:PDF_ROW_LIMIT]:
        label = " | ".join(str(cell(c, row.get(c.key))) for c in text_columns)
        amount = _rupees(int(row.get(money_column.key) or 0)) if money_column else ""
        lines.append(DocumentLine(label=label[:60], amount=amount))
    if not lines:
        lines.append(DocumentLine(label="No records found", amount=""))

    context_lines = [
        DocumentLine(
            label=str(item["label"]),
            amount=_rupees(int(item["value"])) if item["kind"] == "money" else str(item["value"]),
        )
        for item in totals
    ]
    meta = [("Operator", operator_name), *((key, value) for key, value in filters.items())]
    footnote = (
        f"Showing {PDF_ROW_LIMIT} of {len(rows)} rows. Use CSV or Excel for all of them."
        if len(rows) > PDF_ROW_LIMIT
        else ""
    )
    first_money = next((item for item in totals if item["kind"] == "money"), None)
    spec = DocumentSpec(
        title=f"{report_name} report",
        number=timezone.now().strftime("%Y%m%d%H%M"),
        issued_on=timezone.now(),
        issuer_name="Vsolve Hub Operations",
        buyer_name="Internal use",
        lines=tuple(lines),
        total_label=str(first_money["label"]) if first_money else "Rows",
        total_amount=_rupees(int(first_money["value"])) if first_money else str(len(rows)),
        meta=tuple(meta),
        context_heading="Totals",
        context_lines=tuple(context_lines),
        footnote=footnote,
    )
    return render_pdf(spec)
