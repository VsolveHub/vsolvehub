import { X, Star, Phone, MapPin, Navigation, Clock } from "lucide-react";
import { MiniMap, type HomeProps } from "./homeShared";
import { Stat } from "./Stat";
import { ReleaseJobControl } from "./ReleaseJobControl";

export function EnrouteScreen(p: HomeProps) {
  return (
    <div className="vsh-rise">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={p.onDecline} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
          <X className="h-4 w-4 text-gray-600" />
        </button>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">EN ROUTE</span>
        <div className="w-9" />
      </div>

      <MiniMap progress />

      <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 font-bold text-white">
              {p.offer.customer.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900">{p.offer.customer.name}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Star className="h-3 w-3 fill-accent-400 text-accent-400" /> {p.offer.customer.rating} · Member since{" "}
                {p.offer.customer.since}
              </p>
            </div>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-green-50 text-green-600">
            <Phone className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-muted p-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p className="text-xs text-gray-600">{p.offer.drop}</p>
        </div>

        {p.activeJob && p.activeJob.details.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.activeJob.details.map((d) => (
              <span key={d.label} className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                {d.label}: {d.value}
              </span>
            ))}
          </div>
        ) : null}
        {p.activeJob?.note ? (
          <p className="mt-2 rounded-lg bg-surface-muted px-2.5 py-1.5 text-[11px] italic text-gray-600">“{p.activeJob.note}”</p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat icon={Navigation} tone="brand" label="Distance" value={`${p.offer.travelKm} km`} />
        <Stat icon={Clock} tone="violet" label="ETA" value={`${p.offer.etaMin} min`} />
      </div>

      <button
        onClick={p.onArrived}
        disabled={p.busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-50"
      >
        <Navigation className="h-5 w-5" /> {p.busy ? "Updating…" : "I've Arrived"}
      </button>

      <ReleaseJobControl
        confirmRelease={p.confirmRelease}
        setConfirmRelease={p.setConfirmRelease}
        onRelease={p.onRelease}
        busy={p.busy}
      />
      {p.workError ? <p className="mt-3 text-center text-sm font-medium text-red-600">{p.workError}</p> : null}
    </div>
  );
}
