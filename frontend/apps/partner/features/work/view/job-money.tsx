"use client";

import { Card, formatMoney } from "@vsolve/ui";
import { Receipt } from "lucide-react";

import type { PartnerVisit } from "../queries";

/**
 * What this job is worth to **this Partner**.
 *
 * ## Why this is not the Customer's invoice
 *
 * The two are different numbers and only one is the Partner's business. The
 * Customer's total carries a platform fee and tax the Partner never receives, so
 * showing it here would tell someone they earned a figure that will never reach
 * them. The projection deliberately publishes no `order_id` for the same reason
 * — the Customer's bill is not addressable from the work surface at all.
 *
 * For the same reason there are no Customer details here: name, address and
 * contact arrive through the offer disclosure gate, scoped to the visit, not
 * through a booking record the Partner keeps.
 *
 * ## Before and after settlement
 *
 * Before: the task lines the Partner is working to, which is what the job is
 * *made of*. After: their actual ledger line — gross, the commission taken, and
 * the net that lands. The commission is shown rather than netted away silently,
 * because a Partner is entitled to see why they were paid what they were paid.
 *
 * Nothing here is computed. Every figure is a server field.
 */
export function JobMoney({ job }: { job: PartnerVisit }) {
  const earning = job.earning;
  const hasTasks = job.work_tasks.length > 0;

  if (!hasTasks && earning === null) return null;

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-text">
        <Receipt aria-hidden className="size-5 text-text-muted" />
        {earning === null ? "What this job pays" : "What you earned"}
      </h2>

      {hasTasks ? (
        <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
          {job.work_tasks.map((task) => (
            <div key={task.id} className="flex justify-between gap-3">
              <dt className="text-text">
                {task.label}
                {task.quantity > 1 ? (
                  <span className="text-text-secondary"> × {task.quantity}</span>
                ) : null}
              </dt>
              <dd data-numeric className="shrink-0 tabular-nums text-text">
                {formatMoney(task.amount_paise)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {earning === null ? (
        <p className="mt-4 border-t border-line pt-4 text-sm text-text-secondary">
          Your payment is worked out once the job is finished and confirmed.
        </p>
      ) : (
        <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">Job total</dt>
            <dd data-numeric className="tabular-nums text-text">
              {formatMoney(earning.gross_paise)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">Vsolve Hub fee</dt>
            <dd data-numeric className="tabular-nums text-text">
              −{formatMoney(earning.commission_paise)}
            </dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <dt className="text-base font-bold text-text">You get</dt>
            <dd data-numeric className="text-xl font-bold tabular-nums text-text">
              {formatMoney(earning.net_paise)}
            </dd>
          </div>
        </dl>
      )}

      {earning !== null && earning.status === "PENDING" ? (
        <p className="mt-3 rounded-card border border-warning-line bg-warning-surface p-3 text-sm text-warning-text">
          This is on hold while we look into something. You have still earned it.
        </p>
      ) : null}
    </Card>
  );
}
