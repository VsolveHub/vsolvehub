import Link from "next/link";

type Props = {
  bookingRef: string;
  driverName: string;
  priceVal: string;
  paymentMethod: string;
  loading: boolean;
  onReset: () => void;
};

export function RidePaidScreen({ bookingRef, driverName, priceVal, paymentMethod, loading, onReset }: Props) {
  return (
    <div className="flex flex-col flex-grow p-4 gap-4 justify-center items-center h-full">
      <div className="bg-white border border-purple-100 rounded-3xl p-6 shadow-xl w-full text-center flex flex-col items-center gap-4 select-none animate-[slideUp_0.2s_ease-out]">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-2xl shadow-inner">
          ✓
        </div>
        <div>
          <h2 className="font-black text-slate-900 text-base m-0">Ride Completed!</h2>
          <p className="text-[10px] text-gray-500 mt-1 m-0">Ref: #{bookingRef}</p>
        </div>

        <div className="w-full flex flex-col gap-3.5 border-t border-b border-gray-100 py-4 my-1 text-xs text-left">
          <div className="flex justify-between">
            <span className="font-bold text-gray-400">Driver Captain:</span>
            <span className="font-extrabold text-slate-800">{driverName}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-gray-400">Total Amount Paid:</span>
            <span className="font-black text-purple-950">{priceVal}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-gray-400">Payment status:</span>
            <span className="font-bold text-emerald-600">PAID via {paymentMethod.toUpperCase()}</span>
          </div>
        </div>

        <Link href="/" className="w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-black rounded-xl shadow-md text-center no-underline transition-all">
          Back to Home
        </Link>
        {/* Reset simulator control button inside success card */}
        <button
          type="button"
          onClick={onReset}
          disabled={loading}
          className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-sm text-center cursor-pointer mt-1"
        >
          {loading ? "Resetting..." : "Reset Simulation (Demo)"}
        </button>
      </div>
    </div>
  );
}
