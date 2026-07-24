import Image from "next/image";

type Props = {
  onBack: () => void;
  onSetDrop: (drop: string) => void;
  onGoToSearch: () => void;
};

export function DestinationSearchScreen({ onBack, onSetDrop, onGoToSearch }: Props) {
  return (
    <div className="flex flex-col flex-grow relative h-full">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 select-none">
        <button type="button" onClick={onBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-purple-900 font-extrabold cursor-pointer border border-gray-100">
          ←
        </button>
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-md">
          <Image src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80" alt="avatar" width={36} height={36} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Map canvas */}
      <div className="flex-grow h-[60vh] bg-slate-50 relative overflow-hidden select-none">
        <svg className="absolute inset-0 w-full h-full text-slate-200" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="8" />
          <line x1="0" y1="280" x2="500" y2="280" stroke="currentColor" strokeWidth="8" />
          <line x1="160" y1="0" x2="160" y2="600" stroke="currentColor" strokeWidth="8" />
          <line x1="320" y1="0" x2="320" y2="600" stroke="currentColor" strokeWidth="8" />
        </svg>

        {/* Centered Pickup Marker */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-10">
          <div className="bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
            Pickup point
          </div>
          <div className="w-6 h-6 rounded-full bg-emerald-500 border-4 border-white flex items-center justify-center shadow-md animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-white inline-block" />
          </div>
        </div>

        {/* GPS Target Overlay Button */}
        <button type="button" className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg border border-gray-150 text-slate-700 font-bold cursor-pointer">
          🎯
        </button>
      </div>

      {/* Bottom Sheet */}
      <div className="bg-white rounded-t-[32px] p-5 shadow-2xl flex flex-col gap-4 border-t border-purple-50 z-20">
        <h2 className="text-lg font-black text-slate-900 m-0">Where are you going?</h2>

        {/* Search Drop Box */}
        <div
          onClick={onGoToSearch}
          className="w-full bg-purple-50/50 border border-purple-100 rounded-2xl p-3 flex items-center gap-2.5 text-slate-400 text-xs font-semibold cursor-pointer hover:bg-purple-50 transition-all select-none"
        >
          <span className="text-base text-purple-600">🔍</span>
          <span>Search drop location</span>
        </div>

        {/* Quick Pills */}
        <div className="flex gap-2.5 select-none">
          <button type="button" onClick={() => { onSetDrop("Home (Gurgaon)"); onGoToSearch(); }} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
            🏠 Home
          </button>
          <button type="button" onClick={() => { onSetDrop("Work (HITEC City)"); onGoToSearch(); }} className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
            💼 Work
          </button>
          <button type="button" className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-gray-200/60 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all cursor-pointer">
            📍 Add Place
          </button>
        </div>

        {/* Recent Destinations */}
        <div className="flex flex-col gap-2.5 pt-2">
          <div className="flex justify-between items-center select-none">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Destinations</span>
            <button type="button" className="text-[10px] font-extrabold text-purple-700 hover:text-purple-900 underline cursor-pointer">Clear</button>
          </div>

          <div
            onClick={() => { onSetDrop("HITEC City, Hyderabad"); onGoToSearch(); }}
            className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-purple-50/40 cursor-pointer transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm select-none">
              🕒
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-slate-800 m-0">HITEC City</h4>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">Hyderabad, Telangana, India</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
