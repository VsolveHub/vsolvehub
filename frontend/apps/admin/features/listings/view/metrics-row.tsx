import { BriefcaseBusiness, CheckCircle2, Clock, ShieldAlert } from "lucide-react";

export interface MetricsRowProps {
  /** A number, or "50+" when only the first page was counted. */
  totalCount: number | string;
  pendingCount: number | string;
  activeCount: number | string;
  removedCount: number | string;
  onSelectFilter: (filter: string) => void;
}

export function MetricsRow({
  totalCount,
  pendingCount,
  activeCount,
  removedCount,
  onSelectFilter,
}: MetricsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
          <BriefcaseBusiness className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{totalCount}</div>
          <div className="text-xs font-medium text-slate-500">Total Postings</div>
        </div>
      </div>

      <div
        onClick={() => onSelectFilter("PENDING")}
        className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 shadow-sm transition-all ${
          Number.parseInt(String(pendingCount), 10) > 0
            ? "border-amber-300 bg-amber-50/70 hover:bg-amber-100/50"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <div
          className={`rounded-lg p-3 ${
            Number.parseInt(String(pendingCount), 10) > 0 ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-600"
          }`}
        >
          <Clock className="size-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{pendingCount}</span>
            {Number.parseInt(String(pendingCount), 10) > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                Action Needed
              </span>
            )}
          </div>
          <div className="text-xs font-medium text-slate-600">Pending Moderation</div>
        </div>
      </div>

      <div
        onClick={() => onSelectFilter("ACTIVE")}
        className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:bg-slate-50"
      >
        <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
          <CheckCircle2 className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{activeCount}</div>
          <div className="text-xs font-medium text-slate-500">Active / Published</div>
        </div>
      </div>

      <div
        onClick={() => onSelectFilter("REMOVED")}
        className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:bg-slate-50"
      >
        <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
          <ShieldAlert className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{removedCount}</div>
          <div className="text-xs font-medium text-slate-500">Takedowns / Removed</div>
        </div>
      </div>
    </div>
  );
}
