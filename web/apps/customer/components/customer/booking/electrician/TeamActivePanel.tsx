import { TeamTimeline } from "./TeamTimeline";
import type { StepDetails } from "./steps";

type Props = {
  teamName: string;
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails | null;
};

export function TeamActivePanel({ teamName, currentStatusIndex, getStepDetails }: Props) {
  return (
    <>
      {/* Raju Electricals Info Card */}
      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-900 flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-purple-950 m-0">{teamName}</h3>
            <p className="text-[10px] text-purple-750 font-bold mt-0.5 m-0 flex items-center gap-1 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
              Crew is arriving on site · 20 mins
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button type="button" className="flex-1 py-2 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
            📞 Call Team
          </button>
          <button type="button" className="flex-1 py-2 border border-purple-900 text-purple-900 hover:bg-purple-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
            💬 Chat
          </button>
        </div>
      </div>

      {/* 3D Map Card */}
      <div className="relative w-full h-44 bg-white border border-gray-100 rounded-3xl p-2.5 shadow-sm overflow-hidden select-none">
        <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-50 border border-gray-100 shadow-inner">
          <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=450" alt="map" className="w-full h-full object-cover opacity-80 filter brightness-95" />

          {/* Overlay Badges */}
          <div className="absolute top-2.5 left-3 bg-white/95 px-2.5 py-1 rounded-lg text-[9px] font-bold text-slate-700 shadow-md border border-slate-100 flex items-center gap-1">
            <span>🚩</span> 3.4 km to site
          </div>
          <div className="absolute top-2.5 right-3 bg-amber-100/90 text-amber-900 px-2 py-0.5 rounded-full text-[8px] font-black tracking-wide border border-amber-200/50">
            Fastest Route
          </div>
        </div>
      </div>

      {/* Crew Details grid */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 select-none">Crew Details</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Electricians", val: "2 Members", icon: "⚡" },
            { label: "Wiremen", val: "2 Members", icon: "🔌" },
            { label: "Helpers", val: "3 Members", icon: "🔧" },
            { label: "Supervisor", val: "1 Member", icon: "📋" }
          ].map((cell) => (
            <div key={cell.label} className="bg-white border border-gray-150 rounded-2xl p-3 flex items-center gap-2.5 shadow-sm">
              <span className="text-lg">{cell.icon}</span>
              <div>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">{cell.label}</span>
                <span className="text-xs font-bold text-gray-800 mt-0.5 block">{cell.val}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline status checklist */}
      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm flex flex-col gap-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-2 m-0 select-none">Timeline</p>
        <TeamTimeline currentStatusIndex={currentStatusIndex} getStepDetails={getStepDetails} />
      </div>
    </>
  );
}
