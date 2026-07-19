type Props = {
  pickup: string;
  setPickup: (val: string) => void;
  drop: string;
  setDrop: (val: string) => void;
  onBack: () => void;
  onGoToSetPickup: () => void;
};

const SUGGESTIONS = [
  { title: "Inorbit Mall", sub: "Cyberabad, Madhapur, Hyderabad • 1.2 km", icon: "📍" },
  { title: "Cyber Towers", sub: "Hitech City Main Rd, Patrika Nagar • 0.8 km", icon: "📍" },
  { title: "Hitech City Metro Station", sub: "Blue Line, Kukatpally Housing Board • 2.1 km", icon: "🚇" },
  { title: "Mindspace Madhapur", sub: "Titus Towers, HITEC City, Hyderabad • 1.5 km", icon: "📍" },
];

export function SearchRideScreen({ pickup, setPickup, drop, setDrop, onBack, onGoToSetPickup }: Props) {
  return (
    <div className="flex flex-col flex-grow bg-white h-full relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 text-slate-900 select-none">
        <button type="button" onClick={onBack} className="text-xl leading-none text-slate-600 hover:text-slate-900 cursor-pointer border-none bg-transparent">
          ←
        </button>
        <span className="font-extrabold text-sm">Search Ride</span>
      </div>

      <div className="p-4 flex flex-col gap-3.5">
        {/* Input boxes */}
        <div className="flex flex-col gap-2 bg-slate-50/50 border border-gray-150 rounded-2xl p-3">
          {/* Pickup input */}
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-200/60">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div className="flex-grow">
              <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-wider block">Pickup</span>
              <input
                type="text"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-xs font-bold text-slate-800 p-0 mt-0.5"
              />
            </div>
          </div>

          {/* Drop-off input */}
          <div className="flex items-center gap-2.5 pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <div className="flex-grow">
              <span className="text-[8px] font-extrabold text-purple-700 uppercase tracking-wider block">Drop-Off</span>
              <input
                type="text"
                placeholder="Where are you going?"
                value={drop}
                onChange={(e) => setDrop(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-xs font-bold text-slate-900 p-0 mt-0.5"
              />
            </div>
            {drop && (
              <button type="button" onClick={() => setDrop("")} className="text-gray-400 text-xs font-bold bg-transparent border-none cursor-pointer">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Current location shortcut */}
        <button type="button" className="flex items-center gap-2 text-purple-800 text-xs font-extrabold hover:text-purple-950 bg-transparent border-none cursor-pointer self-start pl-1 select-none">
          🧭 Use current location
        </button>

        {/* Suggestions List */}
        <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
          {SUGGESTIONS.map((item) => (
            <div
              key={item.title}
              onClick={() => { setDrop(item.title + ", Hyderabad"); onGoToSetPickup(); }}
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-purple-50/50 cursor-pointer transition-all border-b border-gray-50 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-base select-none">{item.icon}</span>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 m-0">{item.title}</h4>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">{item.sub}</p>
                </div>
              </div>
            </div>
          ))}

          <div onClick={onGoToSetPickup} className="flex items-center justify-between p-3 rounded-2xl hover:bg-purple-50/50 cursor-pointer transition-all">
            <div className="flex items-center gap-3">
              <span className="text-base select-none">🗺️</span>
              <div>
                <h4 className="font-extrabold text-xs text-slate-800 m-0">Set on Map</h4>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 m-0">Drag pin to select exact location</p>
              </div>
            </div>
            <span className="text-gray-400 font-bold select-none">›</span>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex flex-col z-30 select-none">
        <button
          type="button"
          onClick={onGoToSetPickup}
          className="w-full py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all text-center"
        >
          Confirm Drop-off
        </button>
      </div>
    </div>
  );
}
