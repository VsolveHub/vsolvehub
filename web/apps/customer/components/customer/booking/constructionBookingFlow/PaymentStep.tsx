import type { PaymentMethodType } from "@/lib/bookings/types";
import { hireCardStyle, hireSubStyle } from "./shared";

type Props = {
  totalAmount: number;
  paymentMethod: PaymentMethodType | null;
  setPaymentMethod: (v: PaymentMethodType) => void;
  error: string;
};

const METHODS = ["upi", "card", "wallet", "cod"] as const;

const LABELS: Record<(typeof METHODS)[number], string> = {
  upi: "UPI (Paytm, GPay, PhonePe)",
  card: "Credit / Debit Card",
  wallet: "Wallets",
  cod: "Cash on Service",
};

const DETAILS: Record<(typeof METHODS)[number], string> = {
  upi: "Pay using any UPI app",
  card: "Visa, MasterCard, Rupay",
  wallet: "Pay from wallet",
  cod: "Pay after service completion",
};

export function PaymentStep({ totalAmount, paymentMethod, setPaymentMethod, error }: Props) {
  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="vsh-card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)", color: "white", padding: "1.25rem", borderRadius: "18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.85, margin: 0 }}>Total Amount to Pay</p>
          <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, marginTop: "0.125rem" }}>₹{totalAmount}</p>
        </div>
        <span style={{ fontSize: "2rem" }}>🏗️</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {METHODS.map((methodType) => (
          <button key={methodType} type="button" className={`card address-card ${paymentMethod === methodType ? "selected" : ""}`} style={{ ...hireCardStyle, padding: "1rem" }} onClick={() => setPaymentMethod(methodType)}>
            <input type="radio" checked={paymentMethod === methodType} readOnly />
            <div>
              <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>{LABELS[methodType]}</p>
              <p style={hireSubStyle}>{DETAILS[methodType]}</p>
            </div>
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
