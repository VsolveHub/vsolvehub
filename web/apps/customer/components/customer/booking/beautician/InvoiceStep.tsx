import { formatPrice, formatDate } from "@/lib/format";
import type { Booking } from "@/lib/booking/types";

type Props = {
  booking: Booking;
  partnerName: string;
  tip: number;
};

export function InvoiceStep({ booking, partnerName, tip }: Props) {
  return (
    <div className="vsh-receipt-notch-container" style={{ padding: "1.5rem" }}>
      <div className="vsh-receipt-notch-left" />
      <div className="vsh-receipt-notch-right" />

      <div className="text-center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: "2rem" }}>🧾</span>
        <h3 style={{ fontWeight: 800, margin: "0.5rem 0 0 0", fontSize: "1.1rem" }}>Invoice</h3>
        <p style={{ color: "#71717a", fontSize: "0.75rem", margin: 0 }}>Reference: {booking.bookingRef}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.85rem", marginTop: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#71717a" }}>Service</span>
          <span style={{ fontWeight: 600 }}>{booking.service.name}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#71717a" }}>Date</span>
          <span>{formatDate(booking.slot)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#71717a" }}>Beautician</span>
          <span>{partnerName}</span>
        </div>

        <div className="vsh-receipt-perforated" />

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#71717a" }}>Service Charge</span>
          <span>{formatPrice(booking.finalAmountPaise)}</span>
        </div>
        {tip > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#71717a" }}>Tip Added</span>
            <span>₹{tip}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.05rem", borderTop: "1px solid #e4e4e7", paddingTop: "0.625rem", color: "var(--color-brand)" }}>
          <span>Paid Amount</span>
          <span>{formatPrice(booking.finalAmountPaise + tip * 100)}</span>
        </div>
      </div>

      {/* Refer & Earn Banner */}
      <div style={{ background: "linear-gradient(to right, #fdf4ff, #fae8ff)", border: "1px solid #f5d0fe", borderRadius: "12px", display: "flex", gap: "0.75rem", alignItems: "center", padding: "0.75rem", marginTop: "1.5rem" }}>
        <span style={{ fontSize: "1.5rem" }}>🎁</span>
        <div>
          <p style={{ fontWeight: 700, margin: 0, fontSize: "0.75rem" }}>Refer & Earn</p>
          <p style={{ fontSize: "0.65rem", color: "#666", margin: 0 }}>Get ₹100 for each friend who signs up!</p>
        </div>
      </div>
    </div>
  );
}
