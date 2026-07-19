import { formatPrice } from "@/lib/format";
import { Row } from "./primitives";
import type { CrewTrackingData } from "./types";

type Props = {
  booking: CrewTrackingData;
  isSearching: boolean;
  isCancelled: boolean;
  escrowHeld: boolean;
  settled: boolean;
};

export function EscrowSummaryCard({ booking, isSearching, isCancelled, escrowHeld, settled }: Props) {
  return (
    <div className="vsh-card" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {settled ? (
        <>
          <Row label={isCancelled ? "Charged (incl. fee)" : "Charged for work done"} value={formatPrice(booking.finalAmountPaise)} bold />
          {booking.refundedPaise > 0 ? (
            <Row label="Refunded to you" value={`− ${formatPrice(booking.refundedPaise)}`} tone="#16a34a" />
          ) : null}
          <div style={{ borderTop: "1px solid #f1f0f5", marginTop: "0.25rem", paddingTop: "0.4rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", color: "#71717a" }}>Paid from escrow</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#16a34a" }}>✓ Settled</span>
          </div>
        </>
      ) : escrowHeld ? (
        <>
          <Row label={`Held in escrow · ${booking.durationDays} ${booking.durationDays === 1 ? "day" : "days"}`} value={formatPrice(booking.escrowPaise)} bold />
          <p style={{ margin: 0, fontSize: "0.72rem", color: "#16a34a" }}>
            ✓ Secured — released as work completes; unused amount is refunded.
          </p>
        </>
      ) : (
        <>
          <Row label={isSearching ? "Estimated total" : "To pay"} value={formatPrice(booking.quotedAmount)} bold />
          <p style={{ margin: 0, fontSize: "0.72rem", color: "#b45309" }}>
            {isSearching ? "Charged into escrow once a crew accepts." : "Pay into escrow to confirm your crew."}
          </p>
        </>
      )}
    </div>
  );
}
