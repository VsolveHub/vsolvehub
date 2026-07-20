import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDate } from "@/lib/format";
import { STATUS_LABELS, STATUS_MESSAGES } from "@/lib/constants";
import type { Booking } from "@/lib/booking/types";
import type { ConstructionDetails } from "./parseDetails";

type Props = {
  booking: Booking;
  status: string;
  loading: boolean;
  onSimulateNext: () => void;
  details: ConstructionDetails;
};

export function ActiveJobPanel({ booking, status, loading, onSimulateNext, details }: Props) {
  const { workers, bookingType, selectedQuoteName, duration } = details;

  return (
    <>
      {/* Status Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p style={{ fontSize: "0.75rem", color: "#71717a", margin: 0 }}>Reference Code</p>
            <p style={{ fontWeight: 800, margin: 0, fontSize: "1.05rem" }}>{booking.bookingRef}</p>
          </div>
          <Badge status={status}>{STATUS_LABELS[status] ?? status}</Badge>
        </div>
        <p className="rounded-xl px-4 py-3 text-sm bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]" style={{ margin: "0.5rem 0", fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}>
          {STATUS_MESSAGES[status]}
        </p>

        <Button size="sm" variant="secondary" onClick={onSimulateNext} loading={loading} style={{ alignSelf: "flex-start", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: "8px" }}>
          Simulate Next Step →
        </Button>
      </div>

      {/* Map and ETA */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ padding: 0, height: "200px", position: "relative", overflow: "hidden", borderRadius: "16px" }}>
        <div className="mock-map-bg" style={{ width: "100%", height: "100%", background: "#f4f4f5", backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)", backgroundSize: "12px 12px", position: "absolute" }} />
        <svg style={{ position: "absolute", width: "100%", height: "100%" }}>
          <path d="M 120 180 Q 180 70 240 100 T 320 140" fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 3" />
          <circle cx="120" cy="180" r="8" fill="var(--color-brand)" />
          <circle cx="240" cy="100" r="7" fill="red" />
        </svg>
        <div style={{ position: "absolute", bottom: "0.75rem", left: "0.75rem", right: "0.75rem", background: "white", padding: "0.75rem", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
          <div>
            <p style={{ fontWeight: 700, margin: 0, fontSize: "0.85rem" }}>{selectedQuoteName}</p>
            <p style={{ fontSize: "0.7rem", color: "#666", margin: 0 }}>Crew is arriving on site</p>
          </div>
          <span style={{ fontWeight: 800, color: "var(--color-brand)", fontSize: "1rem" }}>20 mins</span>
        </div>
      </div>

      {/* Crew Details */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
          {bookingType === "individual" ? "Worker" : "Crew Requirements"}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.625rem", background: "#fdfbfe", padding: "0.75rem", borderRadius: "10px", fontSize: "0.75rem", border: "1px solid #f1f0f5" }}>
          {workers.map((w, i) => (
            <span key={i}>{w.icon ?? "🛠️"} {w.label}{bookingType === "team" ? `: ${w.count}` : ""}</span>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", fontSize: "0.825rem", marginTop: "0.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#71717a" }}>Start Date</span>
            <span>{formatDate(booking.slot)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#71717a" }}>Duration</span>
            <span>{duration} Days</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #f1f0f5", paddingTop: "0.5rem" }}>
            <span style={{ color: "#71717a" }}>Total Amount</span>
            <span style={{ fontWeight: 700, color: "var(--color-brand)" }}>{formatPrice(booking.finalAmountPaise)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
