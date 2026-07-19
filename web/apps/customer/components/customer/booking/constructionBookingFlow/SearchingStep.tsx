import type { WorkerRow } from "./model";
import { ProgressRow } from "./shared";

type Props = {
  bookingType: "individual" | "team";
  activeWorkers: WorkerRow[];
  foundRows: Record<string, boolean>;
};

export function SearchingStep({ bookingType, activeWorkers, foundRows }: Props) {
  return (
    <div className="vsh-card stack text-center" style={{ padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div className="search-workers-animation" style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <div style={{ width: "12px", height: "12px", background: "var(--color-brand)", borderRadius: "50%", animation: "bounce 0.6s infinite alternate" }} />
        <div style={{ width: "12px", height: "12px", background: "var(--color-brand)", borderRadius: "50%", animation: "bounce 0.6s infinite 0.15s alternate" }} />
        <div style={{ width: "12px", height: "12px", background: "var(--color-brand)", borderRadius: "50%", animation: "bounce 0.6s infinite 0.3s alternate" }} />
      </div>
      <h3 style={{ fontWeight: 800, margin: 0, fontSize: "1.1rem" }}>
        {bookingType === "individual" ? "Finding your worker…" : "Searching nearby teams…"}
      </h3>
      <p style={{ color: "#666", fontSize: "0.8rem", margin: "0.375rem 0 1.5rem 0" }}>Verifying availability for your requirement</p>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "left", borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
        {activeWorkers.map((w) => (
          <ProgressRow key={w.rowId} label={w.label} count={w.count} active={!!foundRows[w.rowId]} />
        ))}
      </div>
      <style jsx>{`
        @keyframes bounce { to { transform: translateY(-8px); opacity: 0.4; } }
      `}</style>
    </div>
  );
}
