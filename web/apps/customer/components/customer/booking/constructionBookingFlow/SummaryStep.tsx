import type { QuoteOption, WorkerRow } from "./model";
import { formatDateLabel } from "./model";
import { SummaryRow } from "./shared";

type Props = {
  bookingType: "individual" | "team";
  activeWorkers: WorkerRow[];
  startDate: string;
  duration: number;
  siteLocation: string;
  proceedChoice: "auto" | "quotes";
  selectedQuote: QuoteOption | undefined;
  dailyRate: number;
  totalAmount: number;
};

export function SummaryStep({ bookingType, activeWorkers, startDate, duration, siteLocation, proceedChoice, selectedQuote, dailyRate, totalAmount }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      <SummaryRow label="Project Type" value={bookingType === "individual" ? "Individual Worker" : "Construction Crew"} />
      <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.625rem" }}>
        <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>{bookingType === "individual" ? "Worker" : "Crew"}</p>
        <p style={{ margin: "0.125rem 0 0 0", fontSize: "0.85rem", color: "#18181b", lineHeight: 1.5 }}>
          {activeWorkers.map((w) => `${w.icon} ${w.label}${bookingType === "team" ? ` (${w.count})` : ""}`).join("  ·  ")}
        </p>
      </div>
      <SummaryRow label="Start Date" value={formatDateLabel(startDate)} />
      <SummaryRow label="Duration" value={`${duration} Days`} />
      <SummaryRow label="Location" value={siteLocation} />
      {proceedChoice === "quotes" && selectedQuote && <SummaryRow label={bookingType === "individual" ? "Selected Worker" : "Selected Team"} value={selectedQuote.name} last />}

      <div style={{ borderTop: "1px dashed #e4e4e7", paddingTop: "0.875rem", marginTop: "0.375rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#71717a" }}>
          <span>Daily wage × {duration} days</span>
          <span>₹{dailyRate}/day</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 800, color: "var(--color-brand)", marginTop: "0.75rem", borderTop: "1px solid #e4e4e7", paddingTop: "0.75rem" }}>
          <span>Total Amount</span>
          <span>₹{totalAmount}</span>
        </div>
      </div>
    </div>
  );
}
