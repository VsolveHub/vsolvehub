"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Calendar, Check, X, Bell } from "lucide-react";
import { roleLabel } from "@/lib/crew-constants";
import { jsonFetch, pqk } from "@/lib/query";

type CrewRequest = {
  offerId: string;
  service: string;
  location: string;
  durationDays: number;
  startDate: string | null;
  roles: { roleId: string; count: number }[];
  expiresAt: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/**
 * Polls for real crew broadcast requests and surfaces the newest one as an
 * accept/decline card. Works whether or not the partner is "online" — crew
 * requests are independent of the individual-dispatch toggle.
 */
export function CrewRequestPoller() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const { data } = useQuery({
    queryKey: pqk.crewRequests(),
    queryFn: () => jsonFetch<{ requests: CrewRequest[] }>("/api/crew-requests", { cache: "no-store" }),
    refetchInterval: 4000,
    staleTime: 0,
  });
  const requests = data?.requests ?? [];

  // 1s ticker for the accept-window countdown (pure UI, not data).
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const respondMutation = useMutation({
    mutationFn: (vars: { offerId: string; action: "accept" | "decline" }) =>
      jsonFetch("/api/crew-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: pqk.crewRequests() });
      if (vars.action === "accept") router.refresh();
    },
  });
  const busy = respondMutation.isPending;

  const top = requests[0];

  const respond = (offerId: string, action: "accept" | "decline") =>
    respondMutation.mutate({ offerId, action });

  if (!top) return null;

  const secondsLeft = Math.max(0, Math.round((new Date(top.expiresAt).getTime() - now) / 1000));

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-xl">
        <div className="flex items-center justify-between bg-brand-600 px-4 py-2 text-white">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
            <Bell className="h-3.5 w-3.5" /> New crew request
          </span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tabular-nums">{secondsLeft}s</span>
        </div>

        <div className="p-4">
          <p className="text-sm font-bold text-ink-900">{top.service} · Team</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {top.location}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {fmtDate(top.startDate) ?? "Soon"} · {top.durationDays}{" "}
              {top.durationDays === 1 ? "day" : "days"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {top.roles.map((r) => (
              <span key={r.roleId} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-900">
                {roleLabel(r.roleId)} × {r.count}
              </span>
            ))}
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
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {busy ? "Accepting…" : "Accept job"}
            </button>
          </div>
          {requests.length > 1 ? (
            <p className="mt-2 text-center text-[11px] text-gray-400">+{requests.length - 1} more request(s) waiting</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
