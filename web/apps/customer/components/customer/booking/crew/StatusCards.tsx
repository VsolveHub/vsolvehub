import { formatPrice } from "@/lib/format";

export function SearchingCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ textAlign: "center", padding: "1.75rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-brand)", animation: `vsh-bounce 0.6s ${i * 0.15}s infinite alternate` }} />
        ))}
      </div>
      <h3 style={{ margin: 0, fontWeight: 800, fontSize: "1.05rem" }}>Finding a crew…</h3>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#71717a" }}>{message}</p>
      <style jsx>{`@keyframes vsh-bounce { to { transform: translateY(-8px); opacity: 0.4; } }`}</style>
    </div>
  );
}

export function NoCrewFoundCard({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ textAlign: "center", padding: "1.5rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem" }}>
      <span style={{ fontSize: "2rem" }}>😕</span>
      <h3 style={{ margin: 0, fontWeight: 800, fontSize: "1rem" }}>No crew accepted in time</h3>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#71717a" }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        style={{ marginTop: "0.5rem", background: "var(--color-brand)", color: "white", border: "none", borderRadius: 12, padding: "0.65rem 1.5rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", opacity: retrying ? 0.6 : 1 }}
      >
        {retrying ? "Resending…" : "Retry request"}
      </button>
    </div>
  );
}

export function EscrowPaymentCard({ amountPaise, onPay }: { amountPaise: number; onPay: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ border: "1px solid var(--color-brand)", background: "var(--color-brand-light)" }}>
      <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: "var(--color-brand)" }}>Confirm your crew</p>
      <p style={{ margin: "0.25rem 0 0.75rem 0", fontSize: "0.8rem", color: "#52525b" }}>
        Pay {formatPrice(amountPaise)} into secure escrow to confirm. It's only released as work is done —
        no-shows are refunded automatically.
      </p>
      <button
        type="button"
        onClick={onPay}
        style={{ width: "100%", background: "var(--color-brand)", color: "white", border: "none", borderRadius: 12, padding: "0.8rem", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer" }}
      >
        Pay {formatPrice(amountPaise)} to confirm
      </button>
    </div>
  );
}

type ExtensionProps = {
  extensionDays: number;
  extensionChargePaise: number;
  busy: boolean;
  onDecline: () => void;
  onApprove: () => void;
};

export function ExtensionRequestCard({ extensionDays, extensionChargePaise, busy, onDecline, onApprove }: ExtensionProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ border: "1px solid #f59e0b", background: "#fffbeb" }}>
      <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: "#b45309" }}>
        Crew requested {extensionDays} more {extensionDays === 1 ? "day" : "days"}
      </p>
      <p style={{ margin: "0.25rem 0 0.75rem 0", fontSize: "0.8rem", color: "#52525b" }}>
        Approve to add the {extensionDays === 1 ? "day" : "days"} at the same rates —{" "}
        {formatPrice(extensionChargePaise)} more into escrow.
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" onClick={onDecline} disabled={busy} style={{ flex: 1, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 12, padding: "0.65rem", fontWeight: 700, fontSize: "0.82rem", color: "#71717a", cursor: "pointer" }}>
          Decline
        </button>
        <button type="button" onClick={onApprove} disabled={busy} style={{ flex: 1, background: "var(--color-brand)", color: "white", border: "none", borderRadius: 12, padding: "0.65rem", fontWeight: 800, fontSize: "0.82rem", cursor: "pointer" }}>
          Approve & pay
        </button>
      </div>
    </div>
  );
}

export function NoShowCard({ busy, onReport }: { busy: boolean; onReport: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ border: "1px solid #fecaca" }}>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "#3f3f46" }}>Crew hasn't turned up?</p>
      <button type="button" onClick={onReport} disabled={busy} style={{ marginTop: "0.5rem", background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: "0.55rem 1rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
        Report a no-show
      </button>
    </div>
  );
}

type DisputeProps = {
  isDisputed: boolean;
  canDispute: boolean;
  busy: boolean;
  onReportIssue: () => void;
};

export function DisputeSection({ isDisputed, canDispute, busy, onReportIssue }: DisputeProps) {
  if (isDisputed) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ border: "1px solid #f59e0b", background: "#fffbeb", fontSize: "0.82rem", color: "#b45309" }}>
        ⚠ Issue reported — the payment is on hold while our team reviews it.
      </div>
    );
  }
  if (!canDispute) return null;
  return (
    <button
      type="button"
      onClick={onReportIssue}
      disabled={busy}
      style={{ background: "transparent", border: "1px solid var(--color-border)", color: "#71717a", borderRadius: 12, padding: "0.6rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
    >
      Report an issue with this job
    </button>
  );
}

type CancelProps = {
  cancellable: boolean;
  cancelling: boolean;
  cancelPreview: { feePaise: number; finalPaise: number; free: boolean } | null;
  onCancel: () => void;
};

export function CancelButton({ cancellable, cancelling, cancelPreview, onCancel }: CancelProps) {
  if (!cancellable) return null;
  return (
    <button
      type="button"
      onClick={onCancel}
      disabled={cancelling}
      style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: "0.6rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", opacity: cancelling ? 0.6 : 1 }}
    >
      {cancelling
        ? "Cancelling…"
        : cancelPreview && !cancelPreview.free
          ? `Cancel booking · fee ${formatPrice(cancelPreview.finalPaise)}`
          : "Cancel booking"}
    </button>
  );
}
