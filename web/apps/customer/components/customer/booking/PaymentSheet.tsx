"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";

type Method = { id: string; label: string; detail: string; icon: string };

const METHODS: Method[] = [
  { id: "upi", label: "UPI", detail: "Google Pay, PhonePe, Paytm", icon: "📲" },
  { id: "card", label: "Credit / Debit Card", detail: "Visa, Mastercard, RuPay", icon: "💳" },
  { id: "netbanking", label: "Net Banking", detail: "All major banks", icon: "🏦" },
  { id: "wallet", label: "Wallet", detail: `Balance: ${formatPrice(WALLET_BALANCE_PAISE)}`, icon: "👛" },
];

/**
 * Demo payment gateway sheet. Simulates a gateway round-trip, then calls
 * onConfirm(method) so the caller can persist the payment.
 */
export function PaymentSheet({
  amountPaise,
  onClose,
  onConfirm,
}: {
  amountPaise: number;
  onClose: () => void;
  onConfirm: (method: string) => Promise<void>;
}) {
  const [method, setMethod] = useState("upi");
  const [stage, setStage] = useState<"select" | "processing" | "done">("select");

  async function pay() {
    setStage("processing");
    await new Promise((r) => setTimeout(r, 1400)); // simulate the gateway
    try {
      await onConfirm(method);
      setStage("done");
      setTimeout(onClose, 1200);
    } catch {
      setStage("select");
    }
  }

  return (
    <div
      onClick={stage === "select" ? onClose : undefined}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 430, background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}
      >
        {/* Gateway header */}
        <div style={{ background: "linear-gradient(135deg,#6d28d9,#4c1d95)", color: "white", padding: "1.1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", opacity: 0.85, fontWeight: 700 }}>VSolve Secure Pay</span>
            {stage === "select" && (
              <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "white", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
            )}
          </div>
          <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.78rem", opacity: 0.85 }}>Amount payable</p>
          <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>{formatPrice(amountPaise)}</p>
        </div>

        <div style={{ padding: "1.1rem 1.25rem 1.5rem" }}>
          {stage === "processing" ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div style={{ width: 40, height: 40, margin: "0 auto", border: "3px solid #ede9fe", borderTopColor: "var(--color-brand)", borderRadius: "50%", animation: "vsh-spin 0.8s linear infinite" }} />
              <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#52525b", fontWeight: 600 }}>Processing payment…</p>
              <style jsx>{`@keyframes vsh-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : stage === "done" ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div style={{ width: 56, height: 56, margin: "0 auto", background: "#dcfce7", color: "#16a34a", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "1.6rem" }}>✓</div>
              <p style={{ marginTop: "0.75rem", fontWeight: 800, fontSize: "1rem", color: "#16a34a" }}>Payment successful</p>
            </div>
          ) : (
            <>
              <p style={{ margin: "0 0 0.6rem 0", fontSize: "0.78rem", fontWeight: 700, color: "#71717a", textTransform: "uppercase" }}>Choose payment method</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", borderRadius: 14, border: `1.5px solid ${method === m.id ? "var(--color-brand)" : "#ececf0"}`, background: method === m.id ? "#faf5ff" : "#fff", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ fontSize: "1.25rem" }}>{m.icon}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: "0.88rem", color: "#18181b" }}>{m.label}</span>
                      <span style={{ display: "block", fontSize: "0.74rem", color: "#71717a" }}>{m.detail}</span>
                    </span>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${method === m.id ? "var(--color-brand)" : "#d4d4d8"}`, background: method === m.id ? "var(--color-brand)" : "transparent" }} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={pay}
                style={{ marginTop: "1rem", width: "100%", background: "var(--color-brand)", color: "white", border: "none", borderRadius: 14, padding: "0.9rem", fontWeight: 800, fontSize: "0.95rem", cursor: "pointer" }}
              >
                Pay {formatPrice(amountPaise)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
