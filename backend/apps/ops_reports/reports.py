import logging
from datetime import datetime
from typing import Any

from apps.commerce.models import Booking, PaymentAttempt, TaxDocument
from apps.listings.models import VendorSubscription
from apps.partners.models import PartnerBusinessProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.rental.models import RentalBooking
from apps.stay.models import StayEnquiry, StayReservation
from apps.wallet.models import WalletTransaction

from .models import OpsReportSettings

logger = logging.getLogger(__name__)


class ReportDefinition:
    def __init__(self, report_id: str, name: str, filters: list[str], columns: list[str]):
        self.id = report_id
        self.name = name
        self.filters = filters
        self.columns = columns

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        raise NotImplementedError


def get_date_range(filters: dict[str, Any]) -> tuple[datetime | None, datetime | None]:
    start = filters.get("date_start")
    end = filters.get("date_end")
    if start and isinstance(start, str):
        start = datetime.fromisoformat(start)
    if end and isinstance(end, str):
        end = datetime.fromisoformat(end)
    return start, end


class BookingsReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="bookings",
            name="Bookings",
            filters=["date_start", "date_end", "service", "status", "archetype"],
            columns=[
                "id",
                "created_at",
                "status",
                "service",
                "archetype",
                "partner_id",
                "order_total_paise",
            ],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = Booking.objects.select_related("order", "partner").all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("service"):
            qs = qs.filter(order__quote__cart_item__variant__service__slug=filters["service"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        if filters.get("archetype"):
            qs = qs.filter(order__quote__cart_item__variant__booking_archetype=filters["archetype"])

        rows = []
        count = 0
        total_order_paise = 0
        order_totals_seen = set()

        for b in qs[:5000]:
            service_code = ""
            archetype = ""
            order_total = 0
            if b.order:
                order_total = b.order.total_paise if hasattr(b.order, "total_paise") else 0
                cart_item = (
                    b.order.quote.cart_item
                    if hasattr(b.order, "quote") and hasattr(b.order.quote, "cart_item")
                    else None
                )
                variant = cart_item.variant if cart_item else None
                if variant:
                    service_code = getattr(getattr(variant, "service", None), "slug", "")
                    archetype = getattr(variant, "booking_archetype", "")

            rows.append(
                {
                    "id": str(b.id)[:8] + "...MASK",
                    "created_at": b.created_at.strftime("%d/%m/%Y"),
                    "status": b.status,
                    "service": service_code,
                    "archetype": archetype,
                    "partner_id": str(b.partner_id) if b.partner_id else "",
                    "order_total_paise": order_total,
                }
            )
            count += 1
            if b.order and b.order.id not in order_totals_seen:
                order_totals_seen.add(b.order.id)
                total_order_paise += order_total

        totals = {"count": count, "unique_orders_total_paise": total_order_paise}
        return rows, totals


class PaymentsReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="payments",
            name="Payments",
            filters=["date_start", "date_end", "purpose", "status"],
            columns=[
                "id",
                "created_at",
                "purpose",
                "status",
                "amount_paise",
                "provider",
                "provider_order_id",
            ],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = PaymentAttempt.objects.all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("purpose"):
            qs = qs.filter(purpose=filters["purpose"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])

        rows = []
        totals_aggs = {"captured": 0, "failed": 0, "refunded": 0}

        for p in qs[:5000]:
            rows.append(
                {
                    "id": str(p.id),
                    "created_at": p.created_at.strftime("%d/%m/%Y"),
                    "purpose": p.purpose,
                    "status": p.status,
                    "amount_paise": p.amount_paise,
                    "provider": p.provider,
                    "provider_order_id": p.provider_order_id,
                }
            )
            if p.status == "CAPTURED":
                totals_aggs["captured"] += p.amount_paise
            elif p.status == "FAILED":
                totals_aggs["failed"] += p.amount_paise
            elif p.status == "REFUNDED":
                totals_aggs["refunded"] += p.amount_paise

        return rows, totals_aggs


class SettlementReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="settlement",
            name="Settlement",
            filters=["date_start", "date_end", "partner_id", "status"],
            columns=[
                "id",
                "created_at",
                "partner_id",
                "partner_name",
                "gstin",
                "status",
                "gross_paise",
                "commission_paise",
                "net_paise",
                "tds_paise",
            ],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = PartnerLedgerEntry.objects.select_related("partner").all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("partner_id"):
            qs = qs.filter(partner_id=filters["partner_id"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])

        settings = OpsReportSettings.objects.first()
        tds_rate = settings.tds_rate_percent if settings and settings.tds_rate_percent else None
        # Do not mutate `self.columns` — REPORTS_CATALOG holds a shared singleton.
        # Ops views shallow-copy/filter `tds_paise` for the HTTP response shape.

        rows = []
        total_net = 0
        total_tds = 0

        partner_ids = list(qs.values_list("partner_id", flat=True)[:5000])
        business_profiles = {
            bp.partner_id: bp
            for bp in PartnerBusinessProfile.objects.filter(partner_id__in=partner_ids)
        }

        for e in qs[:5000]:
            bp = business_profiles.get(e.partner_id)
            gstin = bp.gstin if bp else ""
            tds_amt = 0
            if tds_rate is not None:
                tds_amt = int(e.net_paise * float(tds_rate) / 100.0)

            row = {
                "id": str(e.id),
                "created_at": e.created_at.strftime("%d/%m/%Y"),
                "partner_id": str(e.partner_id),
                "partner_name": e.partner.display_name
                if hasattr(e.partner, "display_name")
                else "",
                "gstin": gstin,
                "status": e.status,
                "gross_paise": e.gross_paise,
                "commission_paise": e.commission_paise,
                "net_paise": e.net_paise,
            }
            if tds_rate is not None:
                row["tds_paise"] = tds_amt

            rows.append(row)
            total_net += e.net_paise
            total_tds += tds_amt

        totals = {"net_paise": total_net}
        if tds_rate is not None:
            totals["tds_paise"] = total_tds

        return rows, totals


class TaxDocumentsReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="tax_documents",
            name="Tax Documents",
            filters=["date_start", "date_end", "kind", "is_test"],
            columns=[
                "id",
                "document_number",
                "kind",
                "created_at",
                "issued_at",
                "is_test",
                "total_paise",
            ],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = TaxDocument.objects.all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("kind"):
            qs = qs.filter(kind=filters["kind"])
        if filters.get("is_test") is not None and filters.get("is_test") != "":
            qs = qs.filter(is_test=str(filters["is_test"]).lower() in ("1", "true", "yes"))

        rows = []
        total_tax_docs = 0
        total_amount = 0
        for doc in qs[:5000]:
            rows.append(
                {
                    "id": str(doc.id),
                    "document_number": f"{doc.series}-{doc.sequence}",
                    "kind": doc.kind,
                    "created_at": doc.created_at.strftime("%d/%m/%Y"),
                    "issued_at": doc.issued_at.strftime("%d/%m/%Y") if doc.issued_at else "",
                    "is_test": doc.is_test,
                    "total_paise": doc.total_paise,
                }
            )
            total_tax_docs += 1
            total_amount += doc.total_paise

        return rows, {"count": total_tax_docs, "total_paise": total_amount}


class WalletReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="wallet",
            name="Wallet",
            filters=["date_start", "date_end", "status", "kind"],
            columns=["id", "customer_id", "kind", "status", "amount_paise", "created_at"],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = WalletTransaction.objects.select_related("wallet").all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        if filters.get("kind"):
            qs = qs.filter(kind=filters["kind"])

        rows = []
        total_captured = 0
        for txn in qs[:5000]:
            rows.append(
                {
                    "id": str(txn.id),
                    "customer_id": str(txn.wallet.customer_id)[:8] + "...MASK",
                    "kind": txn.kind,
                    "status": txn.status,
                    "amount_paise": txn.amount_paise,
                    "created_at": txn.created_at.strftime("%d/%m/%Y"),
                }
            )
            if txn.status == "CAPTURED" and txn.kind == "TOP_UP":
                total_captured += txn.amount_paise
            elif txn.status == "CAPTURED" and txn.kind == "CHECKOUT_DEBIT":
                total_captured -= txn.amount_paise

        return rows, {"net_movement_paise": total_captured}


class SubscriptionsReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="subscriptions",
            name="Vendor Subscriptions",
            filters=["date_start", "date_end", "status", "plan_id"],
            columns=["id", "poster_id", "plan_name", "status", "price_paise", "created_at"],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = VendorSubscription.objects.select_related("plan").all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        if filters.get("plan_id"):
            qs = qs.filter(plan_id=filters["plan_id"])

        rows = []
        total_revenue = 0
        for sub in qs[:5000]:
            rows.append(
                {
                    "id": str(sub.id),
                    "poster_id": str(sub.poster_id),
                    "plan_name": sub.plan.name,
                    "status": sub.status,
                    "price_paise": sub.plan.price_paise,
                    "created_at": sub.created_at.strftime("%d/%m/%Y"),
                }
            )
            if sub.status == "ACTIVE":
                total_revenue += sub.plan.price_paise

        return rows, {"active_subscriptions_value_paise": total_revenue}


class StayReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="stays",
            name="Stays (Enquiries & Reservations)",
            filters=["date_start", "date_end", "status", "mode"],
            columns=[
                "id",
                "type",
                "created_at",
                "property_title",
                "host_id",
                "customer_id",
                "status",
                "check_in",
                "check_out",
                "nights",
                "total_paise",
            ],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start, end = get_date_range(filters)

        # Include enquiries
        if not filters.get("mode") or filters["mode"] == "ENQUIRY":
            eq = StayEnquiry.objects.select_related("property").all()
            if start:
                eq = eq.filter(created_at__gte=start)
            if end:
                eq = eq.filter(created_at__lte=end)
            if filters.get("status"):
                eq = eq.filter(status=filters["status"])
            rows.extend(
                {
                    "id": str(e.id),
                    "type": "ENQUIRY",
                    "created_at": e.created_at.strftime("%d/%m/%Y"),
                    "property_title": e.property.title,
                    "host_id": str(e.property.host_id),
                    "customer_id": str(e.customer_id)[:8] + "...MASK",
                    "status": e.status,
                    "check_in": str(e.check_in),
                    "check_out": str(e.check_out),
                    "nights": e.nights,
                    "total_paise": e.total_quote_paise,
                }
                for e in eq[:2500]
            )

        # Include reservations (if model exists)
        if not filters.get("mode") or filters["mode"] == "RESERVATION":
            try:
                rq = StayReservation.objects.select_related("property").all()
                if start:
                    rq = rq.filter(created_at__gte=start)
                if end:
                    rq = rq.filter(created_at__lte=end)
                if filters.get("status"):
                    rq = rq.filter(status=filters["status"])
                rows.extend(
                    {
                        "id": str(r.id),
                        "type": "RESERVATION",
                        "created_at": r.created_at.strftime("%d/%m/%Y"),
                        "property_title": r.property.title,
                        "host_id": str(r.property.host_id),
                        "customer_id": str(r.customer_id)[:8] + "...MASK",
                        "status": r.status,
                        "check_in": str(r.check_in),
                        "check_out": str(r.check_out),
                        "nights": r.nights,
                        "total_paise": r.total_paise,
                    }
                    for r in rq[:2500]
                )
            except Exception:
                # StayReservation may not be migrated yet; the report still returns enquiries.
                logger.warning("Stay reservations unavailable for the stays report", exc_info=True)

        totals = {
            "enquiries": sum(1 for r in rows if r["type"] == "ENQUIRY"),
            "reservations": sum(1 for r in rows if r["type"] == "RESERVATION"),
            "total_paise": sum(r["total_paise"] for r in rows),
        }
        return rows, totals


class RentalReport(ReportDefinition):
    def __init__(self) -> None:
        super().__init__(
            report_id="rentals",
            name="Rentals",
            filters=["date_start", "date_end", "status"],
            columns=[
                "id",
                "created_at",
                "asset_title",
                "partner_id",
                "customer_id",
                "status",
                "start_date",
                "end_date",
                "price_paise",
                "deposit_status",
            ],
        )

    def execute(self, filters: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        qs = RentalBooking.objects.select_related("asset", "deposit").all()
        start, end = get_date_range(filters)
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        rows = []
        total_revenue = 0
        for b in qs[:5000]:
            rows.append(
                {
                    "id": str(b.id),
                    "created_at": b.created_at.strftime("%d/%m/%Y"),
                    "asset_title": b.asset.title,
                    "partner_id": str(b.asset.partner_id),
                    "customer_id": str(b.customer_id)[:8] + "...MASK",
                    "status": b.status,
                    "start_date": str(b.start_date),
                    "end_date": str(b.end_date),
                    "price_paise": b.price_paise,
                    "deposit_status": b.deposit.status if b.deposit else "",
                }
            )
            total_revenue += b.price_paise
        return rows, {"count": len(rows), "total_revenue_paise": total_revenue}


REPORTS_CATALOG = {
    r.id: r
    for r in [
        BookingsReport(),
        PaymentsReport(),
        SettlementReport(),
        TaxDocumentsReport(),
        WalletReport(),
        SubscriptionsReport(),
        StayReport(),
        RentalReport(),
    ]
}


def get_report(report_id: str) -> ReportDefinition:
    if report_id not in REPORTS_CATALOG:
        raise ValueError(f"Unknown report: {report_id}")
    return REPORTS_CATALOG[report_id]
