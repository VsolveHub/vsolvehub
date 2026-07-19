import { PaymentMethodOption } from "./PaymentMethodOption";

type PaymentMethod = "upi" | "card" | "wallet" | "cod";

type Props = {
  priceVal: string;
  categoryVal: string;
  pickupAddress: string;
  dropAddress: string;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (val: PaymentMethod) => void;
  showBreakup: boolean;
  setShowBreakup: (val: boolean) => void;
  onPay: () => void;
};

export function RidePaymentScreen({
  priceVal,
  categoryVal,
  pickupAddress,
  dropAddress,
  paymentMethod,
  setPaymentMethod,
  showBreakup,
  setShowBreakup,
  onPay,
}: Props) {
  return (
    <div className="flex flex-col flex-grow bg-white h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 text-slate-900 select-none">
        <span className="font-extrabold text-sm">Payment</span>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-purple-100 shadow-sm">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Payment Content */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto pb-28">
        {/* Amount Box Card */}
        <div className="bg-purple-900 text-white rounded-3xl p-5 shadow-lg flex flex-col gap-3.5 select-none relative overflow-hidden">
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-25 text-5xl">
            🖐️
          </div>
          <div>
            <span className="text-[10px] font-bold text-purple-200 uppercase tracking-wider block">Total amount to pay</span>
            <p className="font-black text-3xl m-0 mt-0.5">{priceVal}</p>
          </div>
          <div className="bg-purple-950/60 rounded-xl p-2.5 text-[10px] font-bold border border-purple-850/40">
            {categoryVal.toUpperCase()} Ride · 4.8 km · 12 min <br />
            <span className="text-purple-300 font-semibold">{pickupAddress.split(",")[0]} → {dropAddress.split(",")[0]}</span>
          </div>
        </div>

        {/* Select Payment Method */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 select-none">Select Payment Method</p>
          <div className="flex flex-col gap-3">
            <PaymentMethodOption
              selected={paymentMethod === "upi"}
              selectedBorderClass="border-purple-600"
              icon="🏦"
              title="UPI (GPay / PhonePe / Paytm)"
              subtitle="Instant & secure digital payment"
              badge="Recommended"
              onSelect={() => setPaymentMethod("upi")}
            />
            <PaymentMethodOption
              selected={paymentMethod === "wallet"}
              icon="💳"
              title="VSolve Wallet"
              subtitle="Balance: ₹1,250"
              onSelect={() => setPaymentMethod("wallet")}
            />
            <PaymentMethodOption
              selected={paymentMethod === "card"}
              icon="💳"
              title="Credit / Debit Card"
              subtitle="Visa, Mastercard, RuPay"
              onSelect={() => setPaymentMethod("card")}
            />
            <PaymentMethodOption
              selected={paymentMethod === "cod"}
              icon="💵"
              title="Cash to Captain"
              subtitle="Pay after the ride ends"
              onSelect={() => setPaymentMethod("cod")}
            />
          </div>
        </div>

        {/* Collapse Fare Breakup details */}
        <div className="bg-slate-50 border border-gray-150 rounded-2xl p-4 flex flex-col gap-3 select-none">
          <div
            onClick={() => setShowBreakup(!showBreakup)}
            className="flex justify-between items-center cursor-pointer"
          >
            <span className="font-black text-purple-955 text-xs">View Fare Breakup</span>
            <span className="font-extrabold text-purple-700 text-xs">{showBreakup ? "▼" : "▶"}</span>
          </div>

          {showBreakup && (
            <div className="flex flex-col gap-2.5 pt-1 text-[11px] text-slate-600 border-t border-gray-200/50">
              <div className="flex justify-between">
                <span>Base Fare (First 2 km)</span>
                <span className="font-bold text-slate-800">₹40</span>
              </div>
              <div className="flex justify-between">
                <span>Distance (Additional km)</span>
                <span className="font-bold text-slate-800">₹96</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-600 text-xs pt-1 border-t border-dashed border-gray-200">
                <span>🛡️ Secure Transaction</span>
                <span>{priceVal}</span>
              </div>
            </div>
          )}
        </div>

        <p className="text-[9px] text-center text-gray-400 font-semibold select-none m-0 uppercase tracking-wide">
          🔒 End-to-end encrypted
        </p>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex flex-col z-30 select-none">
        <button
          type="button"
          onClick={onPay}
          className="w-full py-3.5 bg-purple-700 hover:bg-purple-850 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center flex items-center justify-center gap-1.5"
        >
          Pay {priceVal} →
        </button>
      </div>
    </div>
  );
}
