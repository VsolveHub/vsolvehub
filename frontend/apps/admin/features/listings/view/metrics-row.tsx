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
      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
          <BriefcaseBusiness className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-text">{totalCount}</div>
          <div className="text-xs font-medium text-text-muted">Total Postings</div>
        </div>
      </div>

      <div
        onClick={() => onSelectFilter("PENDING")}
        className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 shadow-sm transition-all ${
          Number.parseInt(String(pendingCount), 10) > 0
            ? "border-amber-300 bg-amber-50/70 hover:bg-amber-100/50"
            : "border-line bg-surface hover:bg-surface-hover"
        }`}
      >
        <div
          className={`rounded-lg p-3 ${
            Number.parseInt(String(pendingCount), 10) > 0 ? "bg-amber-200 text-amber-900" : "bg-surface-sunken text-text-secondary"
          }`}
        >
          <Clock className="size-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-text">{pendingCount}</span>
            {Number.parseInt(String(pendingCount), 10) > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                Action Needed
              </span>
            )}
          </div>
          <div className="text-xs font-medium text-text-secondary">Pending Moderation</div>
        </div>
      </div>

      <div
        onClick={() => onSelectFilter("ACTIVE")}
        className="flex cursor-pointer items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm transition-all hover:bg-surface-hover"
      >
        <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
          <CheckCircle2 className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-text">{activeCount}</div>
          <div className="text-xs font-medium text-text-muted">Active / Published</div>
        </div>
      </div>

      <div
        onClick={() => onSelectFilter("REMOVED")}
        className="flex cursor-pointer items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm transition-all hover:bg-surface-hover"
      >
        <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
          <ShieldAlert className="size-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-text">{removedCount}</div>
          <div className="text-xs font-medium text-text-muted">Takedowns / Removed</div>
        </div>
      </div>
    </div>
  );
}
