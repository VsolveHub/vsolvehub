import Link from "next/link";
import Image from "next/image";

type Props = {
  pickupAddress: string;
  dropAddress: string;
  priceVal: string;
  categoryVal: string;
  loading: boolean;
  cancelling: boolean;
  onSimulateNext: () => void;
  onCancel: () => void;
};

export function RideRequestedScreen({ pickupAddress, dropAddress, priceVal, categoryVal, loading, cancelling, onSimulateNext, onCancel }: Props) {
  return (
    <div className="flex flex-col flex-grow relative h-full">
      {/* Top status capsule */}
      <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-4 z-10 select-none">
        <Link href="/" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100 no-underline">
          ←
        </Link>
        <div className="bg-white/95 px-4 py-1.5 rounded-full shadow-md border border-purple-100/50 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-ping" />
          <span className="text-[10px] font-black text-slate-800 tracking-wide uppercase">Finding Captain</span>
        </div>
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
          <Image src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" width={36} height={36} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Radar Map view */}
      <div className="flex-grow h-[55vh] bg-slate-100 relative overflow-hidden select-none">
        <svg className="absolute inset-0 w-full h-full text-slate-300" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="6" />
          <line x1="0" y1="280" x2="500" y2="280" stroke="currentColor" strokeWidth="6" />
          <line x1="160" y1="0" x2="160" y2="600" stroke="currentColor" strokeWidth="6" />
        </svg>

        {/* Radar pulse circles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-0">
          <div className="relative w-48 h-48 flex items-center justify-center">
            <div className="absolute w-48 h-48 rounded-full bg-purple-500/10 border border-purple-500/20 radar-pulse-ring" style={{ animationDelay: "0s" }} />
            <div className="absolute w-48 h-48 rounded-full bg-purple-500/10 border border-purple-500/20 radar-pulse-ring" style={{ animationDelay: "1s" }} />

            {/* Outer static ring */}
            <div className="w-28 h-28 rounded-full border border-purple-500/35 bg-purple-500/5 flex items-center justify-center shadow-inner">
              {/* Pulsating center */}
              <div className="w-12 h-12 rounded-full bg-purple-600 border-2 border-white shadow-lg flex items-center justify-center text-xl font-bold text-white relative">
                <span className="absolute inset-0 rounded-full border border-white animate-ping opacity-60" />
                {categoryVal === "bike" ? "🏍️" : categoryVal === "taxi" || categoryVal === "premium" ? "🚗" : "🛺"}
              </div>
            </div>
          </div>
        </div>

        {/* Autos nearby */}
        <div className="absolute top-1/3 left-1/4 text-2xl animate-pulse">🛺</div>
        <div className="absolute bottom-1/3 right-1/4 text-2xl animate-bounce">🛺</div>
      </div>

      {/* Bottom Sheet */}
      <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-4 border-t border-purple-50 z-20">
        <div className="flex flex-col items-center gap-3 pt-2 text-center select-none">
          {/* Circular spin spinner */}
          <div className="relative w-20 h-20 flex items-center justify-center select-none">
            {/* Spinning outer circle */}
            <div className="absolute inset-0 rounded-full border-4 border-purple-100 border-t-purple-650 animate-spin" />
            {/* Centered static icon */}
            <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-2xl shadow-inner border border-purple-100/40">
              {categoryVal === "bike" ? "🏍️" : categoryVal === "taxi" || categoryVal === "premium" ? "🚗" : "🛺"}
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 m-0">Looking for nearby captains...</h3>
            <p className="text-[10px] text-gray-500 font-semibold mt-1 m-0">Connecting you to the fastest available ride</p>
          </div>
        </div>

        {/* Progress loader bar */}
        <div className="w-full h-1.5 bg-purple-100 rounded-full overflow-hidden relative">
          <div className="w-1/3 bg-purple-650 h-full rounded-full custom-progress-bar" />
        </div>

        {/* Trip summary details */}
        <div className="bg-purple-50/40 border border-purple-100/60 rounded-2xl p-3.5 flex justify-between items-center select-none">
          <div>
            <h4 className="font-extrabold text-xs text-slate-800 m-0">{pickupAddress.split(",")[0]} → {dropAddress.split(",")[0]}</h4>
            <p className="text-[10px] text-gray-400 font-bold mt-0.5 m-0">🛺 {categoryVal.toUpperCase()}</p>
          </div>
          <div className="text-right">
            <p className="font-black text-sm text-purple-950 m-0">{priceVal}</p>
            <p className="text-[8px] text-gray-400 font-bold m-0 mt-0.5">Fixed Fare</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSimulateNext}
          disabled={loading}
          className="w-full py-3.5 bg-purple-900 hover:bg-purple-955 text-white font-black rounded-xl text-xs transition-all text-center cursor-pointer mb-2"
        >
          {loading ? "Matching..." : "Simulate Captain Acceptance (Demo)"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="w-full py-3 border border-red-500 text-red-500 hover:bg-red-55 text-red-650 font-black rounded-xl text-xs transition-all text-center cursor-pointer"
        >
          {cancelling ? "Cancelling..." : "✕ Cancel Ride"}
        </button>
      </div>
    </div>
  );
}
