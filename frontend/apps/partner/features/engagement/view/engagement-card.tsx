"use client";

import { Badge, Card, formatMoney } from "@vsolve/ui";
import {
  activeStage,
  agreedTotals,
  isEngagementDisputed,
  orderedStages,
  stageProgress,
  type Engagement,
} from "@vsolve/query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { shortDate } from "@/lib/format";

import {
  describeEngagementStatus,
  stageTitle,
  type StageWording,
} from "../model/engagement-copy";

/**
 * One engagement in the vendor's list.
 *
 * Half of `M2-FE-501` and `M2-FE-601`. Every value is one the server sent or a
 * label for one.
 *
 * ## What the row shows and why that
 *
 * The money is `staged_total_paise` — "now owed" — because that is the number the
 * work is against today. `total_paise` never moves, so on an engagement with an
 * accepted amendment the two differ, and showing the original here would print a
 * figure nobody is owed. The agreement screen shows all three side by side;
 * a list row has space for one and it is the live one.
 *
 * ## What is deliberately not here
 *
 * **The customer's name and address.** `Engagement` publishes neither, at any
 * status, and `contact_released_at` records only *when* disclosure becomes
 * permitted rather than disclosing anything. Nothing stands in for them.
 *
 * **A crew count.** Nothing on the wire says how many people are on a shift-day.
 * That is the same absence the crew-needed bucket names, and it is not filled in
 * here from the proposal's `worker_count` either — an agreed headcount and
 * today's headcount are different facts and a row that showed one as the other
 * would be lying on the days they diverge.
 */

const TONE = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  danger: "danger",
  success: "success",
} as const;

export interface EngagementCardProps {
  readonly engagement: Engagement;
  readonly wording: StageWording;
}

/**
 * Every engagement opens on `/work/jobs/[id]`, whichever archetype it is —
 * that route resolves the kind itself. The old `/workforce/shifts/[id]` and
 * `/projects/stages/[id]` are 308 redirects to it.
 */
const JOB_HREF = (id: string) => `/work/jobs/${id}`;

export function EngagementCard({ engagement, wording }: EngagementCardProps) {
  const status = describeEngagementStatus(engagement, wording);
  const totals = agreedTotals(engagement);
  const progress = stageProgress(engagement);
  const current = activeStage(engagement);
  const stages = orderedStages(engagement);
  const first = stages[0];

  // The dates on the record, not a schedule this client assembled. A stage with
  // no `scheduled_on` is ordinary — an A5 milestone often has none — so the
  // absence is skipped rather than printed as a blank.
  const startsOn = first?.scheduled_on ?? null;

  return (
    <Card className="p-0">
      <Link
        href={JOB_HREF(engagement.id)}
        className="flex min-h-20 items-center justify-between gap-3 rounded-card px-4 py-3 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-text">
              {formatMoney(totals.owedPaise)}
            </span>
            {status ? (
              <Badge tone={TONE[status.tone]} dot>
                {status.label}
              </Badge>
            ) : (
              <Badge tone="neutral">State not recognised</Badge>
            )}
            {isEngagementDisputed(engagement) && engagement.status !== "DISPUTED" ? (
              <Badge tone="warning">One {wording.one} disputed</Badge>
            ) : null}
          </span>

          <span className="text-xs text-text-secondary">
            {progress.done} of {progress.total} {wording.many} settled
            {startsOn === null ? "" : ` · from ${shortDate(startsOn)}`}
          </span>

          {current ? (
            <span className="truncate text-xs text-text-muted">
              Next: {stageTitle(current, wording)}
            </span>
          ) : null}

          {totals.changedByPaise === 0 ? null : (
            <span className="text-xs text-text-muted">
              Agreed {formatMoney(totals.agreedPaise)}, changed by{" "}
              {totals.changedByPaise > 0 ? "+" : "−"}
              {formatMoney(Math.abs(totals.changedByPaise))}
            </span>
          )}
        </span>

        <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
      </Link>
    </Card>
  );
}
