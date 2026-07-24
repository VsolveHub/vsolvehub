import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";

export type ConfirmSlipRow = {
  label: string;
  value: string;
  highlight?: boolean;
};

type Props = {
  title: string;
  subtitle: string;
  bookingRef: string;
  status: string;
  statusMessage: string;
  rows: ConfirmSlipRow[];
  totalLabel: string;
  totalValue: string;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  trackHref: string;
  trackLabel?: string;
  secondaryHref: string;
  secondaryLabel: string;
  isTeam?: boolean;
};

export function BookingConfirmSlip({
  title,
  subtitle,
  bookingRef,
  status,
  statusMessage,
  rows,
  totalLabel,
  totalValue,
  paymentMethod,
  paymentStatus,
  trackHref,
  trackLabel = "Track booking",
  secondaryHref,
  secondaryLabel,
  isTeam,
}: Props) {
  if (isTeam) {
    return (
      <div className="flow-page-shell">
        <div className="flow-page-shell__inner">
        {/* Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 text-purple-900 shadow-sm select-none">
          <Link href="/" className="text-xl leading-none text-purple-800 hover:text-purple-955 cursor-pointer no-underline">
            ←
          </Link>
          <span className="font-extrabold text-sm truncate">Electrician — Team</span>
        </div>

        {/* Step Badge */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-purple-50 border-b border-purple-100/60 select-none">
          <span className="w-5 h-5 flex items-center justify-center bg-purple-600 text-white font-bold rounded-full text-[10px] shadow-sm">
            10
          </span>
          <span className="font-bold text-xs text-purple-900">Final Confirmation</span>
        </div>

        {/* Scrollable confirmation details */}
        <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
          <div className="flex flex-col items-center text-center gap-3 mt-4 select-none">
            <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-3xl shadow-sm">
              ✓
            </div>
            <h1 className="text-xl font-black text-purple-950 tracking-tight m-0">Team Booked!</h1>
            <p className="text-xs text-gray-500 font-semibold leading-relaxed max-w-[280px] m-0">
              Team A · Raju Electricals is assigned to your project
            </p>
          </div>

          {/* Project ID Card */}
          <div className="bg-white border border-gray-150 rounded-2xl p-4 flex justify-between items-center shadow-sm">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Project ID</span>
              <p className="font-mono font-black text-sm text-purple-955 mt-0.5 m-0">#{bookingRef}</p>
            </div>
            <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none">
              Confirmed
            </span>
          </div>

          {/* Dates & Duration Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Start Date</span>
              <p className="font-extrabold text-xs text-gray-800 mt-1 m-0">20 May, 2026</p>
            </div>
            <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Duration</span>
              <p className="font-extrabold text-xs text-gray-800 mt-1 m-0">3 Days</p>
            </div>
          </div>

          {/* Crew Summary Card */}
          <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Crew Summary</span>
              <span className="text-[10px] text-amber-700 font-bold">★ 4.9 (120+ Reviews)</span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Overlapping avatars */}
              <div className="flex -space-x-2 select-none">
                <Image className="w-8 h-8 rounded-full border-2 border-white object-cover animate-pulse" width={32} height={32} src="https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=60" alt="avatar" />
                <Image className="w-8 h-8 rounded-full border-2 border-white object-cover animate-pulse" width={32} height={32} src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60" alt="avatar" />
                <Image className="w-8 h-8 rounded-full border-2 border-white object-cover animate-pulse" width={32} height={32} src="https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=60" alt="avatar" />
                <div className="w-8 h-8 rounded-full border-2 border-white bg-purple-50 text-purple-700 text-[10px] font-black flex items-center justify-center">+2</div>
              </div>
              <p className="text-xs font-bold text-gray-700 m-0">5 Experts Assigned. Led by Senior Raju</p>
            </div>
          </div>

          {/* Map pin layout */}
          <div className="relative w-full h-40 bg-slate-50 border border-gray-150 rounded-2xl overflow-hidden shadow-inner mt-1">
            <svg className="absolute inset-0 w-full h-full text-slate-200" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="50" x2="500" y2="50" stroke="currentColor" strokeWidth="6" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="6" />
              <line x1="140" y1="0" x2="140" y2="250" stroke="currentColor" strokeWidth="6" />
              <line x1="300" y1="0" x2="300" y2="250" stroke="currentColor" strokeWidth="6" />
            </svg>
            <div className="absolute bottom-3 left-3 bg-white border border-gray-100 rounded-lg px-2.5 py-1 text-[9px] font-bold text-gray-700 shadow-sm flex items-center gap-1 z-10">
              📍 Sector 45, Gurgaon
            </div>
          </div>
        </div>

        {/* Sticky Actions */}
        <div className="flow-page-shell__footer flex gap-3">
          <Link href={trackHref} className="block w-full py-3 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center no-underline">
            Track Project Status →
          </Link>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-page-shell">
      <div className="flow-page-shell__inner">
        <div className="flow-page-shell__body gap-5">
      {/* Success Animation Ring & Titles */}
      <div className="flex flex-col items-center text-center gap-3 mt-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-3xl shadow-sm animate-bounce">
          ✓
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight m-0">{title}</h1>
        <p className="text-xs text-gray-500 leading-relaxed max-w-[280px] m-0">{subtitle}</p>
      </div>

      {/* Receipt Slip Container */}
      <article className="bg-white rounded-2xl border border-purple-100 shadow-md p-5 flex flex-col gap-4 relative overflow-hidden">
        {/* Notch details for receipt styling */}
        <div className="absolute top-[80px] -left-2 w-4 h-4 rounded-full bg-gray-50 border-r border-purple-100" />
        <div className="absolute top-[80px] -right-2 w-4 h-4 rounded-full bg-gray-50 border-l border-purple-100" />

        <header className="flex justify-between items-center border-b border-gray-100 pb-3">
          <div className="flex items-center gap-1.5 font-bold text-purple-900 text-xs">
            <span className="w-5 h-5 flex items-center justify-center bg-purple-700 text-white rounded-md text-[11px]">V</span>
            <span>V Solve Hub</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 uppercase tracking-wider">
            {status.replace(/_/g, " ")}
          </span>
        </header>

        <div className="flex justify-between items-center py-1 mt-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Booking reference</span>
          <span className="font-mono font-bold text-xs text-purple-900 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100/50">{bookingRef}</span>
        </div>

        {/* Dotted Perforation Line */}
        <div className="flex justify-between items-center gap-1 my-2 overflow-hidden select-none">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-purple-50 flex-shrink-0" />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between items-start gap-4">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{row.label}</span>
              <span className={`text-xs text-right text-gray-800 ${row.highlight ? "font-bold text-purple-800" : ""}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center font-bold text-sm text-gray-800 pt-3.5 border-t border-gray-100">
          <span>{totalLabel}</span>
          <span className="text-purple-700 text-base font-extrabold">{totalValue}</span>
        </div>

        {(paymentMethod || paymentStatus) && (
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-[11px] text-gray-600 font-semibold mt-1">
            <span className="text-purple-600 text-xs">💳</span>
            <span className="truncate">
              Payment: {paymentMethod?.toUpperCase()} · {paymentStatus}
            </span>
          </div>
        )}

        <footer className="border-t border-gray-100 pt-3.5 flex flex-col gap-3">
          <p className="text-[10px] text-center text-gray-400 m-0 leading-relaxed">{statusMessage}</p>
          <div className="flex justify-center items-end gap-1 opacity-25 select-none" aria-hidden>
            {Array.from({ length: 32 }).map((_, i) => (
              <span key={i} className="w-[3px] bg-gray-900 rounded-t" style={{ height: `${8 + (i % 5) * 4}px` }} />
            ))}
          </div>
        </footer>
      </article>

      <div className="flow-page-shell__footer flex flex-col gap-2">
        <Link href={trackHref} className="block w-full py-3 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all text-center no-underline">
          {trackLabel}
        </Link>
        <Link href={secondaryHref} className="block w-full py-3 border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center no-underline">
          {secondaryLabel}
        </Link>
      </div>
        </div>
      </div>
    </div>
  );
}
