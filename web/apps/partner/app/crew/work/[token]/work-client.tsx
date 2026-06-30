"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle2, Clock, LogIn } from "lucide-react";

type Job = { bookingRef: string; service: string; location: string; status: string; paid: boolean; clockState: string; assignedToMe: boolean };

const CLOCK_LABEL: Record<string, { text: string; cls: string }> = {
  out: { text: "Not clocked in", cls: "bg-surface-muted text-gray-500" },
  in: { text: "Clocked in · working", cls: "bg-green-50 text-green-700" },
  done: { text: "Clocked out", cls: "bg-surface-muted text-gray-500" },
};

export function WorkClient({ token, name, crewName, jobs }: { token: string; name: string; crewName: string; jobs: Job[] }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    if (busy || otp.trim().length < 4) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/crew-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Could not record attendance" });
      } else {
        setMsg({ kind: "ok", text: data.message ?? "Done" });
        setOtp("");
        router.refresh();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">Hi {name.split(" ")[0]} 👋</p>
        <h1 className="text-xl font-bold text-ink-900">{crewName}</h1>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-gray-500">
          No active job right now. Your lead will let you know when there's work.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {jobs.map((j) => {
              const cs = CLOCK_LABEL[j.clockState] ?? { text: "Not clocked in", cls: "bg-surface-muted text-gray-500" };
              return (
                <div key={j.bookingRef} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-ink-900">{j.service} · Team</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cs.cls}`}>{cs.text}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5" /> {j.location}
                  </p>
                  {!j.assignedToMe ? (
                    <p className="mt-2 text-xs text-amber-700">Your lead hasn't added you to this job yet.</p>
                  ) : !j.paid ? (
                    <p className="mt-2 text-xs text-amber-700">Waiting for the customer to pay before work can start.</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
              <LogIn className="h-4 w-4 text-brand-600" /> Enter the customer's code
            </p>
            <p className="mb-3 mt-0.5 text-xs text-gray-600">
              Ask the customer for the <b>start code</b> to clock in, or the <b>finish code</b> when the work is done.
            </p>
            <div className="flex gap-2">
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit code"
                className="h-12 w-36 rounded-lg border border-border bg-white px-3 text-center text-xl font-bold tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || otp.trim().length < 4}
                className="flex-1 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40"
              >
                {busy ? "Checking…" : "Submit"}
              </button>
            </div>
            {msg ? (
              <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${msg.kind === "ok" ? "text-green-700" : "text-danger"}`}>
                {msg.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />} {msg.text}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
