import { Navigation, Clock, MapPin } from "lucide-react";
import { inr } from "@/lib/format";
import { KIND_ICON } from "./types";
import { CountRing, Pill, type HomeProps } from "./homeShared";

export function OfferScreen(p: HomeProps) {
  const Icon = KIND_ICON[p.offer.kind];
  const pct = (p.offerLeft / 30) * 100;
  return (
    <div className="vsh-slideup flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> NEW JOB OFFER
        </span>
        <CountRing left={p.offerLeft} pct={pct} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-lg">
        <div className="flex items-center justify-between bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold">{p.offer.title}</p>
              <p className="text-xs text-white/70">{p.offer.area}</p>
            </div>
          </div>
          {p.offer.surge > 1 && (
            <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-bold text-ink-900">
              {p.offer.surge}× surge
            </span>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">You earn</p>
              <p className="text-3xl font-bold text-ink-900">{inr(p.offer.fare)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Duration</p>
              <p className="text-lg font-bold text-ink-900">~{p.offer.durationMin}m</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Pill icon={Navigation} label="Travel" value={`${p.offer.travelKm} km`} />
            <Pill icon={Clock} label="Arrive in" value={`${p.offer.etaMin} min`} />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted p-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p className="text-xs text-gray-600">{p.offer.drop}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-3 pt-4">
        <button
          onClick={p.onDecline}
          className="rounded-xl border border-border bg-white py-3.5 text-sm font-semibold text-gray-600 active:scale-[0.98]"
        >
          Decline
        </button>
        <button
          onClick={p.onAccept}
          className="col-span-2 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white shadow-lg active:scale-[0.98]"
        >
          Accept Job · {inr(p.offer.fare)}
        </button>
      </div>
    </div>
  );
}
