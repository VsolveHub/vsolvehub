"""Operations reports: each one declares its filters, columns and totals once.

The page draws itself from that declaration, so an admin picks from dropdowns (a service by
name, a status in plain words, a partner by name or phone) and never types an internal code.
Rows come back ready to read: names instead of ids, a short reference instead of a UUID, a
status label instead of a constant. Money stays in integer paise and is formatted by whoever
shows it.

Every report is one queryset, so totals are aggregated over *all* matching rows, the preview
pages by `limit`/`offset`, and an export refuses (rather than truncates) more than
``EXPORT_ROW_LIMIT`` rows.
"""

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

from django.db import models
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import Service
from apps.commerce.models import Booking, Order, PaymentAttempt, Refund, TaxDocument
from apps.listings.models import VendorSubscription, VendorSubscriptionPlan
from apps.partners.models import PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.rental.models import RentalBooking
from apps.stay.models import StayEnquiry, StayReservation, StaySubscription, StaySubscriptionPlan
from apps.wallet.models import WalletTransaction

from .models import OpsReportSettings

#: An export larger than this is refused with a message to narrow the dates.
EXPORT_ROW_LIMIT = 5000
PREVIEW_PAGE_SIZE = 50
PREVIEW_MAX_PAGE_SIZE = 200

# --- declarations -----------------------------------------------------------------------------


@dataclass(frozen=True)
class Option:
    value: str
    label: str
    group: str = ""


@dataclass(frozen=True)
class Filter:
    key: str
    label: str
    #: `date`, `choice` (a dropdown of `options`) or `partner` (search by name or phone).
    kind: str
    #: The queryset lookup the value is matched against. Unused for dates.
    lookup: str = ""
    options: Callable[[], list[Option]] | None = None

    def choices(self) -> list[Option]:
        return self.options() if self.options else []


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    #: `text`, `ref`, `date`, `money`, `number` or `status`.
    kind: str = "text"
    #: Order lookup when the column can be sorted; empty means it cannot.
    sort: str = ""


def _choices(
    text_choices: Any, labels: Mapping[str, str] | None = None
) -> Callable[[], list[Option]]:
    labels = labels or {}
    return lambda: [
        Option(value, labels.get(value, label)) for value, label in text_choices.choices
    ]


def _service_options() -> list[Option]:
    rows = (
        Service.objects.select_related("subcategory__category")
        .order_by("subcategory__category__name", "name")
        .values_list("slug", "name", "subcategory__category__name")
    )
    return [Option(slug, name, category or "") for slug, name, category in rows]


DATE_START = Filter("date_start", "From", "date")
DATE_END = Filter("date_end", "To", "date")


def money_total(key: str, label: str, value: Any) -> dict[str, Any]:
    return {"key": key, "label": label, "kind": "money", "value": int(value or 0)}


def count_total(key: str, label: str, value: Any) -> dict[str, Any]:
    return {"key": key, "label": label, "kind": "number", "value": int(value or 0)}


# --- display helpers --------------------------------------------------------------------------


def ref(value: Any) -> str:
    """A short reference an admin can read out or search for: the id's first 8 characters."""
    return str(value)[:8].upper() if value else ""


def partner_label(partner: PartnerProfile | None) -> str:
    if partner is None:
        return ""
    phone = getattr(partner.user, "phone_number", "") or ""
    return f"{partner.display_name} · {phone}" if phone else partner.display_name


def customer_label(user: Any) -> str:
    """A customer's name and the last four digits of their phone: enough to find them."""
    if user is None:
        return ""
    name = (getattr(user, "full_name", "") or "").strip() or "Customer"
    phone = getattr(user, "phone_number", "") or ""
    return f"{name} · ••••{phone[-4:]}" if phone else name


def label_of(text_choices: Any, value: str, labels: Mapping[str, str] | None = None) -> str:
    if labels and value in labels:
        return labels[value]
    try:
        return str(text_choices(value).label)
    except ValueError:
        return value.replace("_", " ").capitalize()


# --- the report base --------------------------------------------------------------------------


@dataclass
class Report:
    id: str
    name: str
    group: str
    description: str
    filters: tuple[Filter, ...]
    columns: tuple[Column, ...]
    base: Callable[[], models.QuerySet[Any]]
    row: Callable[[Any], dict[str, Any]]
    totals: Callable[[models.QuerySet[Any]], list[dict[str, Any]]]
    date_field: str = "created_at"
    search: tuple[str, ...] = ()
    default_sort: tuple[str, ...] = ("-created_at", "-id")
    #: Columns shown only when this returns True (settlement's TDS needs a configured rate).
    column_visible: Callable[[Column], bool] = field(default=lambda _column: True)

    def visible_columns(self) -> list[Column]:
        return [column for column in self.columns if self.column_visible(column)]

    def filter_keys(self) -> list[str]:
        return [f.key for f in self.filters]

    def query(self, params: Mapping[str, str]) -> models.QuerySet[Any]:
        """The report's rows for these filters, search and sort. Bad input is refused."""
        qs = self.base()
        start, end = _date_range(params)
        if start is not None:
            qs = qs.filter(**{f"{self.date_field}__gte": start})
        if end is not None:
            qs = qs.filter(**{f"{self.date_field}__lt": end})
        for spec in self.filters:
            value = (params.get(spec.key) or "").strip()
            if not value or spec.kind == "date":
                continue
            if spec.kind == "partner" and not _is_uuid(value):
                raise serializers.ValidationError(
                    {spec.key: ["Pick the partner from the list."]}, code="invalid_filter"
                )
            if spec.kind == "choice" and spec.options is not None:
                allowed = {option.value for option in spec.choices()}
                if value not in allowed:
                    raise serializers.ValidationError(
                        {spec.key: [f"Choose a {spec.label.lower()} from the list."]},
                        code="invalid_filter",
                    )
            qs = qs.filter(**{spec.lookup: value})
        term = (params.get("q") or "").strip()
        if term and self.search:
            match = models.Q()
            for lookup in self.search:
                match |= models.Q(**{f"{lookup}__icontains": term})
            qs = qs.filter(match)
        return qs.distinct().order_by(*self._ordering(params.get("sort") or ""))

    def _ordering(self, raw: str) -> tuple[str, ...]:
        key = raw.lstrip("-")
        column = next((c for c in self.columns if c.key == key and c.sort), None)
        if column is None:
            return self.default_sort
        direction = "-" if raw.startswith("-") else ""
        return (f"{direction}{column.sort}", "-id")

    def page(
        self, params: Mapping[str, str], *, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int, list[dict[str, Any]]]:
        qs = self.query(params)
        rows = [self.row(obj) for obj in qs[offset : offset + limit]]
        return rows, qs.count(), self.totals(qs)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def _parse_day(raw: str, key: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise serializers.ValidationError(
            {key: ["Use a date like 2026-10-29."]}, code="invalid_date"
        ) from exc


def _date_range(params: Mapping[str, str]) -> tuple[datetime | None, datetime | None]:
    """Whole local days: `date_end` includes all of that day (it used to stop at midnight)."""
    tz = timezone.get_current_timezone()
    start_raw = (params.get("date_start") or "").strip()
    end_raw = (params.get("date_end") or "").strip()
    start = (
        timezone.make_aware(datetime.combine(_parse_day(start_raw, "date_start"), time.min), tz)
        if start_raw
        else None
    )
    end = (
        timezone.make_aware(
            datetime.combine(_parse_day(end_raw, "date_end") + timedelta(days=1), time.min), tz
        )
        if end_raw
        else None
    )
    if start and end and end <= start:
        raise serializers.ValidationError(
            {"date_end": ["The end date is before the start date."]}, code="invalid_date"
        )
    return start, end


# --- Bookings (home services) -----------------------------------------------------------------


def _booking_services(booking: Booking) -> str:
    names: list[str] = []
    unit = booking.fulfilment_unit
    for line in unit.lines.all() if unit is not None else []:
        item = line.cart_item
        service = getattr(getattr(item, "variant", None), "service", None)
        if service is not None and service.name not in names:
            names.append(service.name)
    return ", ".join(names)


def _booking_totals(qs: models.QuerySet[Any]) -> list[dict[str, Any]]:
    orders = Order.objects.filter(bookings__in=qs.values("id")).distinct()
    return [
        count_total("count", "Bookings", qs.count()),
        money_total(
            "order_value", "Order value", orders.aggregate(v=models.Sum("total_paise"))["v"]
        ),
    ]


BOOKINGS = Report(
    id="bookings",
    name="Bookings",
    group="Services",
    description="Home-service visits: who booked, which service, the partner and the order value.",
    filters=(
        DATE_START,
        DATE_END,
        Filter(
            "service",
            "Service",
            "choice",
            "fulfilment_unit__lines__cart_item__variant__service__slug",
            _service_options,
        ),
        Filter("status", "Status", "choice", "status", _choices(Booking.Status)),
        Filter("partner", "Partner", "partner", "partner_id"),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Booked on", "date", "created_at"),
        Column("service", "Service"),
        Column("customer", "Customer"),
        Column("partner", "Partner"),
        Column("status", "Status", "status", "status"),
        Column("order_total_paise", "Order total", "money", "order__total_paise"),
    ),
    base=lambda: Booking.objects.select_related(
        "order", "partner__user", "customer"
    ).prefetch_related("fulfilment_unit__lines__cart_item__variant__service"),
    row=lambda b: {
        "id": str(b.id),
        "reference": ref(b.id),
        "created_at": b.created_at,
        "service": _booking_services(b),
        "customer": customer_label(b.customer),
        "partner": partner_label(b.partner),
        "status": label_of(Booking.Status, b.status),
        "order_total_paise": int(getattr(b.order, "total_paise", 0) or 0),
    },
    totals=_booking_totals,
    search=("partner__display_name", "partner__user__phone_number", "customer__full_name"),
)


# --- Payments ---------------------------------------------------------------------------------

PAYMENT_PURPOSE_LABELS = {
    "BOOKING_GROUP": "Home service booking",
    "SCOPE_AMENDMENT_REVISION": "Extra work approved",
    "M2_QUOTE_UNLOCK": "Quote unlock",
    "M2_VISIT_PLAN": "Visit plan",
    "M2_SITE_VISIT_FEE": "Site visit fee",
    "M2_STAGE_FUNDING": "Project stage payment",
    "M2_MATERIAL_ADVANCE": "Material advance",
    "M2_SCOPE_AMENDMENT": "Project scope change",
    "M2_BOOKING_FEE": "Workforce booking fee",
    "A10_VENDOR_SUBSCRIPTION": "Job plan",
    "A10_PREMIUM_LISTING": "Premium job upgrade",
    "WALLET_TOP_UP": "Wallet top-up",
    "A7_RENTAL_DEPOSIT": "Rental deposit",
    "A9_STAY_RESERVATION": "Stay reservation",
    "A7_RENTAL_BOOKING": "Rental booking",
    "A9_STAY_SUBSCRIPTION": "Stay plan",
}


def _payment_totals(qs: models.QuerySet[Any]) -> list[dict[str, Any]]:
    collected = qs.filter(captured_at__isnull=False).aggregate(v=models.Sum("amount_paise"))["v"]
    refunded = Refund.objects.filter(
        payment_attempt__in=qs.values("id"), status=Refund.Status.SUCCEEDED
    ).aggregate(v=models.Sum("amount_paise"))["v"]
    return [
        money_total("collected", "Collected", collected),
        money_total("refunded", "Refunded", refunded),
        count_total(
            "failed", "Failed payments", qs.filter(status=PaymentAttempt.Status.FAILED).count()
        ),
    ]


PAYMENTS = Report(
    id="payments",
    name="Payments",
    group="Money",
    description=(
        "Every payment attempt: what it was for, whether it went through, and its provider"
        " reference."
    ),
    filters=(
        DATE_START,
        DATE_END,
        Filter(
            "purpose",
            "Payment for",
            "choice",
            "purpose",
            _choices(PaymentAttempt.Purpose, PAYMENT_PURPOSE_LABELS),
        ),
        Filter("status", "Status", "choice", "status", _choices(PaymentAttempt.Status)),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Started on", "date", "created_at"),
        Column("paid_at", "Paid on", "date", "captured_at"),
        Column("purpose", "Payment for"),
        Column("status", "Status", "status", "status"),
        Column("amount_paise", "Amount", "money", "amount_paise"),
        Column("provider_reference", "Provider reference"),
    ),
    base=PaymentAttempt.objects.all,
    row=lambda p: {
        "id": str(p.id),
        "reference": ref(p.id),
        "created_at": p.created_at,
        "paid_at": p.captured_at,
        "purpose": label_of(PaymentAttempt.Purpose, p.purpose, PAYMENT_PURPOSE_LABELS),
        "status": label_of(PaymentAttempt.Status, p.status),
        "amount_paise": int(p.amount_paise),
        "provider_reference": p.provider_payment_id or p.provider_order_id,
    },
    totals=_payment_totals,
    search=("provider_payment_id", "provider_order_id"),
)


# --- Settlement -------------------------------------------------------------------------------


def _tds_rate() -> float | None:
    settings = OpsReportSettings.objects.first()
    return float(settings.tds_rate_percent) if settings and settings.tds_rate_percent else None


def _settlement_row(entry: PartnerLedgerEntry) -> dict[str, Any]:
    rate = _tds_rate()
    profile = getattr(entry.partner, "business_profile", None)
    row = {
        "id": str(entry.id),
        "reference": ref(entry.id),
        "created_at": entry.created_at,
        "partner": partner_label(entry.partner),
        "gstin": getattr(profile, "gstin", "") or "",
        "status": label_of(PartnerLedgerEntry.Status, entry.status),
        "gross_paise": int(entry.gross_paise),
        "commission_paise": int(entry.commission_paise),
        "net_paise": int(entry.net_paise),
    }
    if rate is not None:
        row["tds_paise"] = int(entry.net_paise * rate / 100)
    return row


def _settlement_totals(qs: models.QuerySet[Any]) -> list[dict[str, Any]]:
    sums = qs.aggregate(
        gross=Coalesce(models.Sum("gross_paise"), 0),
        commission=Coalesce(models.Sum("commission_paise"), 0),
        net=Coalesce(models.Sum("net_paise"), 0),
    )
    totals = [
        money_total("gross", "Gross", sums["gross"]),
        money_total("commission", "Commission", sums["commission"]),
        money_total("net", "Net to partners", sums["net"]),
    ]
    rate = _tds_rate()
    if rate is not None:
        totals.append(money_total("tds", "TDS", int(sums["net"] * rate / 100)))
    return totals


SETTLEMENT = Report(
    id="settlement",
    name="Settlement",
    group="Money",
    description="What each partner earned: gross, commission and net, with their GSTIN.",
    filters=(
        DATE_START,
        DATE_END,
        Filter("partner", "Partner", "partner", "partner_id"),
        Filter("status", "Status", "choice", "status", _choices(PartnerLedgerEntry.Status)),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Date", "date", "created_at"),
        Column("partner", "Partner", "text", "partner__display_name"),
        Column("gstin", "GSTIN"),
        Column("status", "Status", "status", "status"),
        Column("gross_paise", "Gross", "money", "gross_paise"),
        Column("commission_paise", "Commission", "money", "commission_paise"),
        Column("net_paise", "Net", "money", "net_paise"),
        Column("tds_paise", "TDS", "money"),
    ),
    base=lambda: PartnerLedgerEntry.objects.select_related(
        "partner__user", "partner__business_profile"
    ),
    row=_settlement_row,
    totals=_settlement_totals,
    search=("partner__display_name", "partner__user__phone_number"),
    column_visible=lambda column: column.key != "tds_paise" or _tds_rate() is not None,
)


# --- Tax documents ----------------------------------------------------------------------------

TAX_DOCUMENTS = Report(
    id="tax_documents",
    name="Tax documents",
    group="Money",
    description="Invoices and credit notes issued, with their numbers and amounts.",
    filters=(
        DATE_START,
        DATE_END,
        Filter("kind", "Document type", "choice", "kind", _choices(TaxDocument.Kind)),
        Filter(
            "is_test",
            "Test documents",
            "choice",
            "is_test",
            lambda: [Option("false", "Real documents only"), Option("true", "Test documents only")],
        ),
    ),
    columns=(
        Column("document_number", "Document number", "text", "sequence"),
        Column("kind", "Type"),
        Column("issued_at", "Issued on", "date", "issued_at"),
        Column("is_test", "Test?"),
        Column("total_paise", "Amount", "money", "total_paise"),
    ),
    base=TaxDocument.objects.all,
    row=lambda doc: {
        "id": str(doc.id),
        "document_number": f"{doc.series}-{doc.sequence}",
        "kind": label_of(TaxDocument.Kind, doc.kind),
        "issued_at": doc.issued_at,
        "is_test": "Yes" if doc.is_test else "No",
        "total_paise": int(doc.total_paise),
    },
    totals=lambda qs: [
        count_total("count", "Documents", qs.count()),
        money_total("total", "Total amount", qs.aggregate(v=models.Sum("total_paise"))["v"]),
    ],
    search=("series",),
)


# --- Wallet -----------------------------------------------------------------------------------


def _wallet_totals(qs: models.QuerySet[Any]) -> list[dict[str, Any]]:
    captured = qs.filter(status="CAPTURED")
    top_ups = captured.filter(kind="TOP_UP").aggregate(v=models.Sum("amount_paise"))["v"] or 0
    spent = captured.filter(kind="CHECKOUT_DEBIT").aggregate(v=models.Sum("amount_paise"))["v"] or 0
    return [
        money_total("top_ups", "Topped up", top_ups),
        money_total("spent", "Spent at checkout", spent),
        money_total("net", "Net movement", top_ups - spent),
    ]


WALLET = Report(
    id="wallet",
    name="Wallet",
    group="Money",
    description="Customer wallet top-ups, spends, refunds and adjustments.",
    filters=(
        DATE_START,
        DATE_END,
        Filter("kind", "Type", "choice", "kind", _choices(WalletTransaction.Kind)),
        Filter("status", "Status", "choice", "status", _choices(WalletTransaction.Status)),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Date", "date", "created_at"),
        Column("customer", "Customer"),
        Column("kind", "Type"),
        Column("status", "Status", "status", "status"),
        Column("amount_paise", "Amount", "money", "amount_paise"),
    ),
    base=lambda: WalletTransaction.objects.select_related("wallet__customer"),
    row=lambda txn: {
        "id": str(txn.id),
        "reference": ref(txn.id),
        "created_at": txn.created_at,
        "customer": customer_label(txn.wallet.customer),
        "kind": label_of(WalletTransaction.Kind, txn.kind),
        "status": label_of(WalletTransaction.Status, txn.status),
        "amount_paise": int(txn.amount_paise),
    },
    totals=_wallet_totals,
    search=("wallet__customer__full_name",),
)


# --- Subscriptions: jobs and stays, each its own report ----------------------------------------


def _subscription_totals(qs: models.QuerySet[Any]) -> list[dict[str, Any]]:
    paid = qs.filter(payment_attempt__captured_at__isnull=False)
    return [
        count_total("count", "Subscriptions", qs.count()),
        count_total("paid", "Paid", paid.count()),
        money_total(
            "collected",
            "Collected",
            paid.aggregate(v=models.Sum("payment_attempt__amount_paise"))["v"],
        ),
    ]


def _subscription_row(sub: Any, partner: PartnerProfile, status_choices: Any) -> dict[str, Any]:
    attempt = sub.payment_attempt
    return {
        "id": str(sub.id),
        "reference": ref(sub.id),
        "created_at": sub.created_at,
        "partner": partner_label(partner),
        "plan": sub.plan.name,
        "status": label_of(status_choices, sub.status),
        "paid_at": getattr(attempt, "captured_at", None),
        "amount_paise": int(attempt.amount_paise) if attempt and attempt.captured_at else 0,
        "ends_at": sub.ends_at,
    }


def _subscription_columns(partner_label_text: str) -> tuple[Column, ...]:
    return (
        Column("reference", "Reference", "ref"),
        Column("created_at", "Started on", "date", "created_at"),
        Column("partner", partner_label_text),
        Column("plan", "Plan", "text", "plan__name"),
        Column("status", "Status", "status", "status"),
        Column("paid_at", "Paid on", "date", "payment_attempt__captured_at"),
        Column("amount_paise", "Paid", "money", "payment_attempt__amount_paise"),
        Column("ends_at", "Ends on", "date", "ends_at"),
    )


JOB_SUBSCRIPTIONS = Report(
    id="subscriptions",
    name="Job plan subscriptions",
    group="Marketplace",
    description="Employers' job-posting plans: who bought which plan, when, and what they paid.",
    filters=(
        DATE_START,
        DATE_END,
        Filter(
            "plan",
            "Plan",
            "choice",
            "plan_id",
            lambda: [
                Option(str(p.id), p.name)
                for p in VendorSubscriptionPlan.objects.order_by("price_paise")
            ],
        ),
        Filter("status", "Status", "choice", "status", _choices(VendorSubscription.Status)),
        Filter("partner", "Employer", "partner", "poster_id"),
    ),
    columns=_subscription_columns("Employer"),
    base=lambda: VendorSubscription.objects.select_related(
        "plan", "poster__user", "payment_attempt"
    ),
    row=lambda sub: _subscription_row(sub, sub.poster, VendorSubscription.Status),
    totals=_subscription_totals,
    search=("poster__display_name", "poster__user__phone_number"),
)

STAY_SUBSCRIPTIONS = Report(
    id="stay_subscriptions",
    name="Stay plan subscriptions",
    group="Marketplace",
    description="Hosts' listing plans: who bought which plan, when, and what they paid.",
    filters=(
        DATE_START,
        DATE_END,
        Filter(
            "plan",
            "Plan",
            "choice",
            "plan_id",
            lambda: [
                Option(str(p.id), p.name)
                for p in StaySubscriptionPlan.objects.order_by("price_paise")
            ],
        ),
        Filter("status", "Status", "choice", "status", _choices(StaySubscription.Status)),
        Filter("partner", "Host", "partner", "host_id"),
    ),
    columns=_subscription_columns("Host"),
    base=lambda: StaySubscription.objects.select_related("plan", "host__user", "payment_attempt"),
    row=lambda sub: _subscription_row(sub, sub.host, StaySubscription.Status),
    totals=_subscription_totals,
    search=("host__display_name", "host__user__phone_number"),
)


# --- Stays: reservations and enquiries --------------------------------------------------------

STAY_RESERVATIONS = Report(
    id="stays",
    name="Stay reservations",
    group="Marketplace",
    description="Paid stay reservations: the guest, the property, the dates and the amount.",
    filters=(
        DATE_START,
        DATE_END,
        Filter("status", "Status", "choice", "status", _choices(StayReservation.Status)),
        Filter("partner", "Host", "partner", "property__host_id"),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Booked on", "date", "created_at"),
        Column("property", "Property", "text", "property__title"),
        Column("host", "Host"),
        Column("guest", "Guest"),
        Column("status", "Status", "status", "status"),
        Column("check_in", "Check-in", "date", "check_in"),
        Column("nights", "Nights", "number", "nights"),
        Column("total_paise", "Amount", "money", "total_paise"),
    ),
    base=lambda: StayReservation.objects.select_related("property__host__user", "customer"),
    row=lambda r: {
        "id": str(r.id),
        "reference": ref(r.id),
        "created_at": r.created_at,
        "property": r.property.title,
        "host": partner_label(r.property.host),
        "guest": customer_label(r.customer),
        "status": label_of(StayReservation.Status, r.status),
        "check_in": r.check_in,
        "nights": r.nights,
        "total_paise": int(r.total_paise),
    },
    totals=lambda qs: [
        count_total("count", "Reservations", qs.count()),
        money_total("total", "Total amount", qs.aggregate(v=models.Sum("total_paise"))["v"]),
    ],
    search=("property__title", "property__host__display_name", "customer__full_name"),
)

STAY_ENQUIRIES = Report(
    id="stay_enquiries",
    name="Stay enquiries",
    group="Marketplace",
    description="Guests' enquiries to hosts: the property, the dates asked for and the reply.",
    filters=(
        DATE_START,
        DATE_END,
        Filter("status", "Status", "choice", "status", _choices(StayEnquiry.Status)),
        Filter("partner", "Host", "partner", "property__host_id"),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Sent on", "date", "created_at"),
        Column("property", "Property", "text", "property__title"),
        Column("host", "Host"),
        Column("guest", "Guest"),
        Column("status", "Status", "status", "status"),
        Column("check_in", "Check-in", "date", "check_in"),
        Column("total_paise", "Quoted", "money", "total_quote_paise"),
    ),
    base=lambda: StayEnquiry.objects.select_related("property__host__user", "customer"),
    row=lambda e: {
        "id": str(e.id),
        "reference": ref(e.id),
        "created_at": e.created_at,
        "property": e.property.title,
        "host": partner_label(e.property.host),
        "guest": customer_label(e.customer),
        "status": label_of(StayEnquiry.Status, e.status),
        "check_in": e.check_in,
        "total_paise": int(e.total_quote_paise or 0),
    },
    totals=lambda qs: [count_total("count", "Enquiries", qs.count())],
    search=("property__title", "property__host__display_name", "customer__full_name"),
)


# --- Rentals ----------------------------------------------------------------------------------

RENTALS = Report(
    id="rentals",
    name="Rental bookings",
    group="Marketplace",
    description="Rental bookings: the item, the customer, the owner, the dates, rent and fee.",
    filters=(
        DATE_START,
        DATE_END,
        Filter("status", "Status", "choice", "status", _choices(RentalBooking.Status)),
        Filter("partner", "Owner", "partner", "asset__partner_id"),
    ),
    columns=(
        Column("reference", "Reference", "ref"),
        Column("created_at", "Booked on", "date", "created_at"),
        Column("item", "Item", "text", "asset__title"),
        Column("owner", "Owner"),
        Column("customer", "Customer"),
        Column("status", "Status", "status", "status"),
        Column("start_date", "From", "date", "start_date"),
        Column("end_date", "To", "date", "end_date"),
        Column("price_paise", "Rent", "money", "price_paise"),
        Column("platform_fee_paise", "Platform fee", "money", "platform_fee_paise"),
        Column("deposit", "Deposit"),
    ),
    base=lambda: RentalBooking.objects.select_related(
        "asset__partner__user", "customer", "deposit"
    ),
    row=lambda b: {
        "id": str(b.id),
        "reference": ref(b.id),
        "created_at": b.created_at,
        "item": b.asset.title,
        "owner": partner_label(b.asset.partner),
        "customer": customer_label(b.customer),
        "status": label_of(RentalBooking.Status, b.status),
        "start_date": b.start_date,
        "end_date": b.end_date,
        "price_paise": int(b.price_paise),
        "platform_fee_paise": int(b.platform_fee_paise),
        "deposit": label_of(type(b.deposit).Status, b.deposit.status) if b.deposit_id else "",
    },
    totals=lambda qs: [
        count_total("count", "Bookings", qs.count()),
        money_total("rent", "Rent", qs.aggregate(v=models.Sum("price_paise"))["v"]),
        money_total("fee", "Platform fee", qs.aggregate(v=models.Sum("platform_fee_paise"))["v"]),
    ],
    search=("asset__title", "asset__partner__display_name", "customer__full_name"),
)


REPORTS_CATALOG: dict[str, Report] = {
    report.id: report
    for report in (
        BOOKINGS,
        PAYMENTS,
        SETTLEMENT,
        TAX_DOCUMENTS,
        WALLET,
        RENTALS,
        STAY_RESERVATIONS,
        STAY_ENQUIRIES,
        STAY_SUBSCRIPTIONS,
        JOB_SUBSCRIPTIONS,
    )
}


def get_report(report_id: str) -> Report:
    if report_id not in REPORTS_CATALOG:
        raise ValueError(f"Unknown report: {report_id}")
    return REPORTS_CATALOG[report_id]


def partner_options(
    *, term: str = "", ids: list[str] | None = None, limit: int = 20
) -> list[Option]:
    """Partners by name or phone for a report's partner filter; `ids` names chosen ones."""
    qs = PartnerProfile.objects.select_related("user").order_by("display_name", "id")
    if ids:
        qs = qs.filter(id__in=[value for value in ids if _is_uuid(value)])
    elif term.strip():
        qs = qs.filter(
            models.Q(display_name__icontains=term.strip())
            | models.Q(user__phone_number__icontains=term.strip())
        )
    else:
        return []
    return [Option(str(p.id), partner_label(p)) for p in qs[:limit]]
