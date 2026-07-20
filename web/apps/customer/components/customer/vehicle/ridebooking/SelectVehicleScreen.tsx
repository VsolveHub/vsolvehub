type RideType = "bike" | "auto" | "taxi" | "premium";

type Props = {
  rideType: RideType;
  setRideType: (val: RideType) => void;
  fares: Record<string, number>;
  loading: boolean;
  error: string;
  onBack: () => void;
  onBookRide: () => void;
  getVehicleLabel: (type: string) => string;
};

const VEHICLES = [
  { id: "auto", label: "Auto", desc: "Popular, open air wind", icon: "🛺" },
  { id: "bike", label: "Bike", desc: "Fastest travel, eco", icon: "🏍️" },
  { id: "taxi", label: "Cab/Taxi", desc: "Comfortable sedans, AC", icon: "🚗" },
  { id: "premium", label: "Premium", desc: "Luxury ride, top captains", icon: "✨" },
] as const;

export function SelectVehicleScreen({ rideType, setRideType, fares, loading, error, onBack, onBookRide, getVehicleLabel }: Props) {
  return (
    <div className="flex flex-col flex-grow relative h-full">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 select-none">
        <button type="button" onClick={onBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100">
          ←
        </button>
        <span className="font-black text-sm text-purple-955 bg-white/90 px-3 py-1 rounded-full shadow-sm">VSolveHub</span>
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Map showing route path */}
      <div className="flex-grow h-[42vh] bg-slate-100 relative overflow-hidden select-none">
        <svg className="absolute inset-0 w-full h-full text-slate-300" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" strokeWidth="6" />
          <line x1="0" y1="240" x2="500" y2="240" stroke="currentColor" strokeWidth="6" />
          <line x1="180" y1="0" x2="180" y2="500" stroke="currentColor" strokeWidth="6" />
          {/* Purple route connecting line */}
          <path d="M 180,240 L 260,240 L 260,100" fill="none" stroke="#7c3aed" strokeWidth="5" strokeLinecap="round" className="animate-[dash_2s_linear_infinite]" />
        </svg>

        {/* Pins */}
        <div className="absolute top-[230px] left-[180px] -translate-x-1/2 -translate-y-1/2 text-lg">🟢</div>
        <div className="absolute top-[90px] left-[260px] -translate-x-1/2 -translate-y-1/2 text-lg">📍</div>
      </div>

      {/* Bottom Sheet Selector */}
      <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-3.5 border-t border-purple-50 z-20">
        <div className="flex justify-between items-center select-none pb-1">
          <h2 className="text-sm font-black text-purple-955 uppercase tracking-wide m-0">Choose your ride</h2>
          <span className="text-[10px] text-gray-400 font-bold">Distance: ~4.8 km</span>
        </div>

        {/* Vehicles list */}
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
          {VEHICLES.map((vehicle) => {
            const isSelected = rideType === vehicle.id;
            const fare = fares[vehicle.id];

            return (
              <div
                key={vehicle.id}
                onClick={() => setRideType(vehicle.id as RideType)}
                className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? "border-purple-600 bg-purple-50/40 shadow-sm"
                    : "border-gray-150 hover:bg-gray-50 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl select-none">{vehicle.icon}</span>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 m-0">
                      {vehicle.label}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">
                      {vehicle.desc}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-xs text-purple-955 m-0">₹{fare}</p>
                  <p className="text-[8px] text-gray-400 font-bold m-0 mt-0.5">Fixed Fare</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment quick info */}
        <div className="flex justify-between items-center bg-slate-50 border border-gray-150 rounded-2xl p-3 select-none text-xs">
          <span className="font-bold text-slate-500">💵 Payment Mode</span>
          <span className="font-extrabold text-purple-900 bg-purple-100/60 px-2.5 py-1 rounded-lg border border-purple-200/50">
            Cash / Pay after ride
          </span>
        </div>

        {error && <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)] text-center py-2 text-[11px]">{error}</div>}

        {/* Directly book ride on click */}
        <button
          type="button"
          onClick={onBookRide}
          disabled={loading}
          className="w-full py-3.5 bg-purple-900 hover:bg-purple-955 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center flex items-center justify-center gap-1.5"
        >
          {loading ? "Processing..." : `Book ${getVehicleLabel(rideType)}`}
        </button>
      </div>
    </div>
  );
}
