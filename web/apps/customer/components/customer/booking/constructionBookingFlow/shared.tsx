import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export const hireCardStyle: React.CSSProperties = {
  width: "100%",
  padding: "1.1rem",
  textAlign: "left",
  display: "flex",
  gap: "0.75rem",
  alignItems: "center",
  borderRadius: "14px",
  border: "1px solid #f1f0f5",
};
export const hireSubStyle: React.CSSProperties = { fontSize: "0.78rem", color: "#666", margin: "0.125rem 0 0 0" };
export const recommendedPillStyle: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", padding: "0.15rem 0.4rem", borderRadius: "4px" };

export function FooterBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button onClick={onClick} block style={{ borderRadius: "14px", height: "46px", fontWeight: 700 }}>
      {children}
    </Button>
  );
}

export function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={last ? undefined : { borderBottom: "1px solid #f3f4f6", paddingBottom: "0.625rem" }}>
      <p style={{ fontSize: "0.8rem", color: "#71717a", margin: 0 }}>{label}</p>
      <p style={{ fontWeight: 600, margin: "0.125rem 0 0 0", fontSize: "0.9rem", lineHeight: 1.35 }}>{value}</p>
    </div>
  );
}

export function ScheduleFields({
  startDate,
  setStartDate,
  duration,
  setDuration,
}: {
  startDate: string;
  setStartDate: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.375rem 0" }}>Start Date</p>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.375rem 0" }}>Duration (Days)</p>
        <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", height: "42px", justifyContent: "space-between", padding: "0 0.5rem", background: "#ffffff" }}>
          <button type="button" onClick={() => setDuration(Math.max(1, duration - 1))} style={{ border: "none", background: "none", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }}>-</button>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{duration} Days</span>
          <button type="button" onClick={() => setDuration(duration + 1)} style={{ border: "none", background: "none", fontSize: "1.2rem", fontWeight: 700, cursor: "pointer" }}>+</button>
        </div>
      </div>
    </div>
  );
}

export function StepperRow({
  label,
  value,
  onChange,
  icon,
  onRemove,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: string;
  onRemove?: () => void;
}) {
  return (
    <div className="vsh-stepper-row">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
        <span style={{ fontSize: "1.2rem" }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#18181b" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="button" className="vsh-btn-stepper" onClick={() => onChange(Math.max(0, value - 1))}>-</button>
        <span style={{ minWidth: "1.25rem", textAlign: "center", fontWeight: 700, fontSize: "0.9rem" }}>{value}</span>
        <button type="button" className="vsh-btn-stepper" onClick={() => onChange(value + 1)}>+</button>
        {onRemove && (
          <button type="button" className="vsh-row-remove" aria-label={`Remove ${label}`} onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function ProgressRow({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
      <span style={{ color: "#3f3f46", fontWeight: 500 }}>{label} ({count})</span>
      {active ? (
        <span style={{ color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.25rem" }}>✓ Found</span>
      ) : (
        <span style={{ color: "#a1a1aa", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <span className="dot-spinner" style={{ width: "6px", height: "6px", background: "var(--color-brand)", borderRadius: "50%", display: "inline-block", animation: "flash 0.8s infinite alternate" }} /> Searching
        </span>
      )}
      <style jsx>{`
        @keyframes flash { to { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
