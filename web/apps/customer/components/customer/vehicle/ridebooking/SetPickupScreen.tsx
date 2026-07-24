import Image from "next/image";

type Props = {
  onBack: () => void;
  onChangePickup: () => void;
  onConfirmPickup: () => void;
};

export function SetPickupScreen({ onBack, onChangePickup, onConfirmPickup }: Props) {
  return (
    <div className="flex flex-col flex-grow relative h-full">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 select-none">
        <button type="button" onClick={onBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100">
          ←
        </button>
        <span className="font-black text-sm text-purple-955 bg-white/90 px-3 py-1 rounded-full shadow-sm">VSolveHub</span>
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
          <Image src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" width={36} height={36} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Dark purple theme map canvas */}
      <div className="flex-grow h-[55vh] bg-purple-950 relative overflow-hidden select-none">
        {/* Dark grid street map */}
        <svg className="absolute inset-0 w-full h-full text-purple-900/60 opacity-30" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="80" x2="500" y2="80" stroke="currentColor" strokeWidth="6" />
          <line x1="0" y1="200" x2="500" y2="200" stroke="currentColor" strokeWidth="6" />
          <line x1="0" y1="380" x2="500" y2="380" stroke="currentColor" strokeWidth="6" />
          <line x1="120" y1="0" x2="120" y2="600" stroke="currentColor" strokeWidth="6" />
          <line x1="280" y1="0" x2="280" y2="600" stroke="currentColor" strokeWidth="6" />
          {/* Route path line */}
          <path d="M 120,380 L 200,380 L 200,200 L 280,200" fill="none" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" className="opacity-70" />
        </svg>

        {/* Destination Red Pin (Top of map) */}
        <div className="absolute top-[80px] left-[280px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
          <div className="bg-white text-[8px] font-bold px-2 py-0.5 rounded shadow-md border border-gray-100">
            Destination
          </div>
          <span className="text-xl">📍</span>
        </div>

        {/* Centered Yellow Ring Marker */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
          <div className="bg-purple-900 text-white text-[10px] font-extrabold px-3 py-1 rounded-full shadow-lg border border-purple-800 flex items-center gap-1 cursor-pointer whitespace-nowrap">
            Set your pickup point ✎
          </div>
          <div className="w-8 h-8 rounded-full border-4 border-amber-400 bg-white flex items-center justify-center shadow-lg">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block animate-ping" />
          </div>
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-4 border-t border-purple-50 z-20">
        {/* Pickup location block */}
        <div className="flex justify-between items-start border-b border-gray-100 pb-3">
          <div>
            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider block">★ Pickup Location</span>
            <h3 className="font-extrabold text-sm text-purple-955 mt-1 m-0">Gachibowli Rd, near DLF</h3>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">Cyber City, Hyderabad, 500032</p>
          </div>
          <button type="button" onClick={onChangePickup} className="text-xs font-black text-purple-800 hover:text-purple-955 underline cursor-pointer">
            Change
          </button>
        </div>

        {/* Quick Pills */}
        <div className="flex gap-2.5 select-none">
          <button type="button" className="flex-grow py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
            🏠 Home
          </button>
          <button type="button" className="flex-grow py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
            💼 Work
          </button>
          <button type="button" className="flex-grow py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
            ⏰ Schedule
          </button>
        </div>

        <button
          type="button"
          onClick={onConfirmPickup}
          className="w-full py-3 bg-purple-700 hover:bg-purple-850 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center mt-1"
        >
          Confirm pickup
        </button>
      </div>
    </div>
  );
}
