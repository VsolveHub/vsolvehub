import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getBookingByRef } from "@/lib/bookings/queries";
import { formatPrice, formatDate } from "@/lib/format";
import { normalizeBookingStatus } from "@/lib/constants";
import { InvoicePrintButton } from "@/components/customer/booking/InvoicePrintButton";

export const metadata = { title: "Invoice — V Solve Hub", robots: { index: false } };

type PageProps = { params: Promise<{ ref: string }> };

/**
 * Real, print-ready invoice rendered from the actual booking row. Reachable from
 * the completed tracker; the "Download / Print" button opens the browser print
 * dialog so the customer can save it as a PDF. No mock data.
 */
export default async function InvoicePage({ params }: PageProps) {
  const { ref } = await params;
  const session = await getServerSession();
  const booking = await getBookingByRef(ref, session?.id);
  if (!booking) notFound();

  const amountPaise = booking.finalAmountPaise ?? booking.quotedAmount;
  const professional = booking.assignedPartner?.fullName ?? booking.vendor?.name ?? "Assigned professional";
  const status = normalizeBookingStatus(booking.status);
  const paid = ["PAID", "COD"].includes(booking.paymentStatus);
  const paymentLabel = booking.paymentStatus === "COD"
    ? "Cash on service"
    : booking.paymentMethod
      ? booking.paymentMethod.toUpperCase()
      : "—";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem", fontSize: "0.9rem", color: "#1a1a2e" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #5b1a8a", paddingBottom: "1rem" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: "1.25rem", color: "#5b1a8a" }}>
            <span style={{ color: "#f5b800" }}>V</span> SOLVE HUB
          </p>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.75rem" }}>One app, all solutions</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Tax Invoice</p>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.75rem" }}>#{booking.bookingRef}</p>
          <p style={{ margin: "0.15rem 0 0", color: "#6b7280", fontSize: "0.75rem" }}>{formatDate(booking.createdAt)}</p>
        </div>
      </div>

      {/* Parties */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginTop: "1.25rem" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.7rem", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>Billed to</p>
          <p style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>{session?.name ?? "Customer"}</p>
          <p style={{ margin: "0.15rem 0 0", color: "#6b7280", fontSize: "0.8rem", maxWidth: 260 }}>{booking.address.fullAddress}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "0.7rem", textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>Professional</p>
          <p style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>{professional}</p>
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1.5rem" }}>
        <thead>
          <tr style={{ background: "#f3f4f8", textAlign: "left" }}>
            <th style={{ padding: "0.6rem 0.75rem", fontSize: "0.72rem", textTransform: "uppercase", color: "#6b7280" }}>Description</th>
            <th style={{ padding: "0.6rem 0.75rem", fontSize: "0.72rem", textTransform: "uppercase", color: "#6b7280", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <td style={{ padding: "0.75rem" }}>
              {booking.service.name}
              <span style={{ display: "block", color: "#6b7280", fontSize: "0.75rem" }}>
                {booking.service.category?.name}
              </span>
            </td>
            <td style={{ padding: "0.75rem", textAlign: "right" }}>{formatPrice(amountPaise)}</td>
          </tr>
        </tbody>
      </table>

      {/* Total */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        <div style={{ width: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderTop: "2px solid #1a1a2e", fontWeight: 800 }}>
            <span>Total</span>
            <span>{formatPrice(amountPaise)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#6b7280" }}>
            <span>Payment</span>
            <span>{paymentLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
            <span style={{ color: "#6b7280" }}>Status</span>
            <span style={{ fontWeight: 700, color: paid ? "#16a34a" : "#d97706" }}>
              {paid ? "PAID" : booking.paymentStatus} · {status}
            </span>
          </div>
        </div>
      </div>

      <p style={{ marginTop: "2rem", color: "#6b7280", fontSize: "0.72rem", textAlign: "center" }}>
        This is a system-generated invoice from V Solve Hub. For support, contact help@vsolvehub.com.
      </p>

      <div className="no-print" style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <InvoicePrintButton />
      </div>
    </div>
  );
}
