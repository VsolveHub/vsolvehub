"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Clock, Check, X, Bell, IndianRupee } from "lucide-react";

type JobOffer = {
  offerId: string;
  bookingRef: string;
  service: string;
  location: string;
  slot: string;
  archetype: string;
  quotedAmount: number; // paise
  expiresAt: string;
};

function fmtSlot(iso: string) {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? "Soon"
      : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "Soon";
  }
}

function fmtRupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * Polls /api/job-offers every 4 s and surfaces the next pending individual
 * dispatch offer as a top-of-screen accept/decline card.
 *
 * This mirrors CrewRequestPoller but handles JobAssignment (archetype A/B)
 * rather than CrewJobOffer (archetype C). It is shown to all ACTIVE partners
 * regardless of whether they have a crew, because individual dispatch is
 * independent of crew membership.
 */
export function JobOfferPoller() {
  const router = useRouter();
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/job-offers", { cache: "no-store" });
      if (res.ok) setOffers((await res.json()).offers ?? []);
    } catch {
      /* offline — keep last state */
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const top = offers[0];

  async function respond(offerId: string, action: "accept" | "decline") {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/job-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, action }),
      });
      setOffers((prev) => prev.filter((o) => o.offerId !== offerId));
      await load();
      if (action === "accept") router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!top) return null;

  const secondsLeft = Math.max(0, Math.round((new Date(top.expiresAt).getTime() - now) / 1000));

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-green-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-green-600 px-4 py-2 text-white">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
            <Bell className="h-3.5 w-3.5" /> New job offer
          </span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {secondsLeft}s
          </span>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="text-sm font-bold text-ink-900">{top.service}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {top.location}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {fmtSlot(top.slot)}
            </span>
            <span className="flex items-center gap-1 font-semibold text-green-700">
              <IndianRupee className="h-3.5 w-3.5" /> {fmtRupees(top.quotedAmount)}
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => respond(top.offerId, "decline")}
              disabled={busy}
              className="flex items-center justify-center gap-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-surface-muted disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Decline
            </button>
            <button
              type="button"
              onClick={() => respond(top.offerId, "accept")}
              disabled={busy || secondsLeft === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {busy ? "Accepting…" : "Accept job"}
            </button>
          </div>

          {offers.length > 1 ? (
            <p className="mt-2 text-center text-[11px] text-gray-400">
              +{offers.length - 1} more offer(s) waiting
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
