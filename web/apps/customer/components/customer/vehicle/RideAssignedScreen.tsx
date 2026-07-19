import Link from "next/link";

type Props = {
  driverName: string;
  driverRating: number;
  vehicleNumber: string;
  driverPhone: string;
  vehicleName: string;
  priceVal: string;
  loading: boolean;
  onSimulateNext: () => void;
  onCancel: () => void;
};

export function RideAssignedScreen({ driverName, driverRating, vehicleNumber, driverPhone, vehicleName, priceVal, loading, onSimulateNext, onCancel }: Props) {
  return (
    <div className="flex flex-col flex-grow relative h-full">
      {/* Top green toast status */}
      <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-4 z-10 select-none">
        <Link href="/" className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100 no-underline">
          ←
        </Link>
        <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-md border border-emerald-500 flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-white text-emerald-600 flex items-center justify-center text-[10px] font-bold">✓</span>
          <span className="text-[9px] font-black tracking-wide uppercase">Captain accepted your ride!</span>
        </div>
        <button type="button" className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 border border-gray-100 font-bold cursor-pointer">
          🛡️
        </button>
      </div>

      {/* Map perspective view */}
      <div className="flex-grow h-[45vh] bg-slate-100 relative overflow-hidden select-none">
        <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=450" alt="map" className="w-full h-full object-cover opacity-80 filter brightness-95" />

        {/* Tooltip arriving info overlay */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
          <div className="bg-purple-950 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg border border-purple-900">
            Arriving in 4 min
          </div>
          <div className="w-7 h-7 rounded-full border-4 border-white bg-purple-600 flex items-center justify-center text-xs shadow-md">
            🛺
          </div>
        </div>

        {/* Marker pin target */}
        <div className="absolute bottom-16 right-20 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow animate-pulse" />
      </div>

      {/* Bottom Sheet Details */}
      <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-3.5 border-t border-purple-50 z-20">
        {/* Driver profile card */}
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <div className="flex items-center gap-3">
            <img src="https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=100" alt="driver" className="w-11 h-11 rounded-full object-cover border border-purple-100" />
            <div>
              <h3 className="font-extrabold text-sm text-slate-800 m-0">{driverName}</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5 m-0">★ {driverRating} (1,240 trips)</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-black text-xs text-purple-900 m-0 tracking-wide">{vehicleNumber}</p>
            <p className="text-[9px] text-gray-400 font-bold m-0 mt-0.5">{vehicleName}</p>
          </div>
        </div>

        {/* Call/Message buttons */}
        <div className="flex gap-3 select-none">
          <a href={`tel:${driverPhone}`} className="flex-grow py-2.5 bg-purple-900 hover:bg-purple-955 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer no-underline shadow">
            📞 Call {driverName.split(" ")[0]}
          </a>
          <button type="button" className="w-11 h-11 rounded-2xl border border-gray-250 text-slate-600 hover:bg-gray-50 flex items-center justify-center text-sm cursor-pointer transition-all">
            💬
          </button>
        </div>

        {/* Simulation control button inside sheet */}
        <button
          type="button"
          onClick={onSimulateNext}
          disabled={loading}
          className="w-full py-2.5 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-xl shadow-sm text-center cursor-pointer transition-all mt-1"
        >
          {loading ? "Simulating..." : "Simulate Next Step (Demo)"}
        </button>

        {/* OTP block */}
        <div className="bg-purple-100/30 border border-dashed border-purple-300 rounded-2xl p-4 flex flex-col items-center gap-2 select-none">
          <p className="text-[10px] font-black text-purple-955 uppercase tracking-wide m-0">OTP TO START RIDE</p>
          <div className="flex gap-2.5 my-1">
            {["4", "8", "2", "1"].map((char, index) => (
              <div
                key={index}
                className="w-8 h-10 bg-white border border-gray-250 rounded-xl flex items-center justify-center font-extrabold text-sm text-purple-955 shadow-sm"
              >
                {char}
              </div>
            ))}
          </div>
          <p className="text-[9px] text-gray-400 font-semibold m-0">Share with your captain to start</p>
        </div>

        {/* Payment selector block */}
        <div className="flex justify-between items-center bg-slate-50 border border-gray-150 rounded-xl p-2.5 text-xs select-none">
          <span className="font-bold text-slate-500">💵 Payment: Cash</span>
          <span className="font-black text-purple-955">{priceVal} ›</span>
        </div>

        {/* Footnotes links */}
        <div className="flex justify-between items-center px-1 text-[10px] font-bold select-none pt-1">
          <button type="button" className="text-purple-800 hover:text-purple-955 bg-transparent border-none cursor-pointer">
            🔗 Share trip
          </button>
          <button type="button" onClick={onCancel} className="text-red-500 hover:text-red-750 bg-transparent border-none cursor-pointer">
            ✕ Cancel ride
          </button>
        </div>
      </div>
    </div>
  );
}
