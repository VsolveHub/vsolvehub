import { Bell } from "lucide-react";
import { Medallion } from "@/components/graphics";
import { TabTitle } from "./TabTitle";
import { ALERT_META, type Props } from "./types";

/* ------------------------------------------------------------------ *
 * ALERTS tab.
 * ------------------------------------------------------------------ */
export function AlertsTab(p: Props) {
  return (
    <div className="vsh-rise">
      <TabTitle title="Notifications" subtitle="Stay in the loop" />
      {p.alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <Medallion icon={Bell} tone="slate" size={52} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold text-ink-900">You&apos;re all caught up</p>
          <p className="text-xs text-gray-500">New jobs and payout updates will show here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {p.alerts.map((n, i) => {
            const meta = ALERT_META[n.kind];
            return (
              <div key={i} className="flex gap-3 rounded-2xl border border-border bg-white p-3.5">
                <Medallion icon={meta.icon} tone={meta.tone} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-ink-900">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-gray-400">{n.when}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{n.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
