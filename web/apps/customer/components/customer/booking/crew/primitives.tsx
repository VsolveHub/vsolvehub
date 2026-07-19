export function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "0.78rem", color: "#71717a" }}>{label}</span>
      <span style={{ fontSize: bold ? "1.05rem" : "0.85rem", fontWeight: bold ? 800 : 600, color: tone ?? (bold ? "var(--color-brand)" : "#3f3f46") }}>
        {value}
      </span>
    </div>
  );
}

export function OtpCard({ label, code, hint }: { label: string; code: string; hint: string }) {
  return (
    <div className="vsh-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", border: "1px dashed var(--color-brand)", background: "var(--color-brand-light)" }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, color: "var(--color-brand)", textTransform: "uppercase" }}>{label}</p>
        <p style={{ margin: "0.1rem 0 0 0", fontSize: "0.72rem", color: "#71717a" }}>{hint}</p>
      </div>
      <span style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "0.25rem", color: "var(--color-brand)" }}>{code}</span>
    </div>
  );
}

export function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

export function fmtTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;
}
