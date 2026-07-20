import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { computeAccommodationPayment } from "@/lib/accommodation/pricing";
import type { AccommodationBookingDraft } from "@/lib/accommodation/types";

const PAYMENT_OPTIONS = [
  { id: "upi" as const, label: "UPI", detail: "Google Pay, PhonePe, Paytm" },
  { id: "card" as const, label: "Card", detail: "Debit / credit card" },
  { id: "wallet" as const, label: "Wallet", detail: `Balance: ${formatPrice(WALLET_BALANCE_PAISE)}` },
  { id: "cod" as const, label: "Pay at property", detail: "Cash on arrival" },
];

type Props = {
  propertyPricePaise: number;
  draft: AccommodationBookingDraft;
  setDraft: (updater: (d: AccommodationBookingDraft) => AccommodationBookingDraft) => void;
  loading: boolean;
  onConfirm: () => void;
};

export function PaymentStep({ propertyPricePaise, draft, setDraft, loading, onConfirm }: Props) {
  const payment = computeAccommodationPayment(propertyPricePaise, draft.includeFirstMonthRent);

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment breakdown</h2>
        <div className="flex items-center justify-between gap-2">
          <span>Token advance</span>
          <span>{formatPrice(payment.tokenAdvancePaise)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Booking fee</span>
          <span>{formatPrice(payment.bookingFeePaise)}</span>
        </div>
        <label className="acc-filter-check">
          <input
            type="checkbox"
            checked={draft.includeFirstMonthRent}
            onChange={(e) =>
              setDraft((d) => ({ ...d, includeFirstMonthRent: e.target.checked }))
            }
          />
          Pay first month rent now ({formatPrice(propertyPricePaise)}) — optional
        </label>
        <div className="flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.5rem" }}>
          <span className="mb-1 text-[15px] font-semibold text-gray-900">Total</span>
          <span className="text-lg font-black text-gray-900" style={{ margin: 0 }}>
            {formatPrice(payment.totalPaidPaise)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {PAYMENT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`card address-card ${draft.paymentMethod === opt.id ? "selected" : ""}`}
            onClick={() => setDraft((d) => ({ ...d, paymentMethod: opt.id }))}
          >
            <p className="address-label">{opt.label}</p>
            <p className="address-text">{opt.detail}</p>
          </button>
        ))}
      </div>

      <Button block onClick={onConfirm} loading={loading} disabled={loading}>
        Confirm booking
      </Button>
    </>
  );
}
