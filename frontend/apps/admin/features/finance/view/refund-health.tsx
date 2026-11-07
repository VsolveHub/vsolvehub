"use client";

import { Card, Skeleton } from "@vsolve/ui";

import { exceptionCopy } from "@/features/m2-cases/model/money";
import { useReconciliationSummary } from "@/features/m2-cases/queries";

function Tile({ label, value, hint, alarm }: { label: string; value: number; hint: string; alarm?: boolean }) {
  return (
    <div className="rounded-control border border-line p-4">
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      <p data-numeric className={`mt-1 text-2xl font-bold ${alarm && value > 0 ? "text-danger-text" : "text-text"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-text-secondary">{hint}</p>
    </div>
  );
}

/** The refunds that still need a person, counted by the server, above the refund tools. */
export function RefundHealth() {
  const summary = useReconciliationSummary();

  if (summary.isPending) return <Skeleton className="h-28 w-full" />;
  if (summary.isError || !summary.data) {
    return (
      <Card className="p-4 text-sm text-warning-text">
        Could not count pending refunds. Don&apos;t treat that as zero.
      </Card>
    );
  }

  const data = summary.data;
  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Refunds that need attention</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Tile
          label="Waiting on Razorpay"
          value={data.refunds_awaiting_provider}
          hint="Sent, not confirmed yet. The customer hasn't got the money."
        />
        <Tile
          label="Refused by Razorpay"
          value={data.failed_refunds}
          hint="Nothing was returned. Check each one with Reconcile a refund below."
          alarm
        />
      </div>
      {data.open_by_kind.length > 0 ? (
        <ul className="mt-3 flex list-none flex-wrap gap-2 p-0 text-xs">
          {data.open_by_kind.map((row) => (
            <li key={row.kind} className="rounded-full border border-line px-3 py-1 text-text-secondary">
              {exceptionCopy(row.kind).label}: <span className="font-semibold text-text">{row.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
