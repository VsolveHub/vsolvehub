import { CheckCircle2, Circle, Camera } from "lucide-react";
import { cn } from "@vsolve/ui";
import { inr } from "@/lib/format";
import { AddPartsPanel } from "./AddPartsPanel";
import type { HomeProps } from "./homeShared";

export function WorkingScreen(p: HomeProps) {
  const done = p.tasks.filter(Boolean).length;
  const total = p.tasks.length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;
  return (
    <div className="vsh-rise">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> IN PROGRESS
        </span>
        <span className="text-xs font-semibold text-gray-500">{inr(p.offer.fare)}</span>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-lg">
        <p className="text-sm font-bold">{p.offer.title}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-white/80">
          <span>Task progress</span>
          <span>
            {done}/{total} · {pct}%
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-accent-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Checklist</p>
      <div className="space-y-2">
        {p.offer.tasks.map((t, i) => {
          const checked = p.tasks[i];
          return (
            <button
              key={t}
              onClick={() => {
                const next = [...p.tasks];
                next[i] = !next[i];
                p.setTasks(next);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99]",
                checked ? "border-green-200 bg-green-50" : "border-border bg-white",
              )}
            >
              {checked ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-gray-300" />
              )}
              <span className={cn("text-sm", checked ? "text-gray-400 line-through" : "font-medium text-ink-900")}>{t}</span>
            </button>
          );
        })}
      </div>

      {p.offer.materials.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Materials used</p>
          <div className="flex flex-wrap gap-2">
            {p.offer.materials.map((m) => (
              <span key={m} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-gray-600">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {p.activeJob ? <AddPartsPanel bookingId={p.activeJob.bookingId} /> : null}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-border bg-white p-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Camera className="h-5 w-5" />
        </div>
        <p className="text-xs text-gray-500">Add before/after photos as proof of work.</p>
      </div>

      <button
        onClick={p.onComplete}
        disabled={!allDone || p.busy}
        className="mt-4 w-full rounded-xl bg-green-600 py-3.5 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
      >
        {p.busy ? "Completing…" : allDone ? "Mark Completed" : `Complete all tasks (${done}/${total})`}
      </button>
      {p.workError ? <p className="mt-3 text-center text-sm font-medium text-red-600">{p.workError}</p> : null}
    </div>
  );
}
