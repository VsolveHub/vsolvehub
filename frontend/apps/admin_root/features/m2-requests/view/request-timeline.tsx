"use client";

import {
  bookingFeeStatement,
  timelineEntries,
  timelineSources,
  touchVerdict,
  type TimelineActor,
  type TimelineEntry,
  type TimelineSource,
  type TouchMetric,
} from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Spinner, Timeline, TimelineEvent, formatMoney } from "@vsolve/ui";
import { useMemo, useState } from "react";

import { maskId } from "@/features/shared/identifiers";

import { useRequestTimeline, useTouchMetric } from "../queries";

/**
 * `M2-FE-702` and `M2-FE-703`: one request end to end, and who did what.
 *
 * ## Every accountable entry states its actor, or states that none was published
 *
 * `M2-FE-703` asks for actor, source, timestamp and reason on every privileged
 * or commercial state change. Only **two** of the fifteen published event types
 * carry an actor at all — `REQUIREMENT_TRANSITION` and `OPERATIONS_TOUCH`, both
 * as a bare user id. The other thirteen are assembled from aggregates that never
 * recorded one.
 *
 * So the honest rendering is the one below: where an actor is published it is
 * shown (masked, because a full id on screen is a full id in a screenshot);
 * where it is not, the row says **"actor not published"** in the same place, in
 * the same weight. It is never inferred from the event's shape. Putting
 * "Operations" beside a booking-fee row because booking fees are usually
 * Operations' doing would be a guess printed next to money, on the screen a
 * support agent makes a refund decision from.
 *
 * "Source" is the aggregate the event was assembled from — a restatement of the
 * published `type`, not a claim about a person.
 *
 * ## A `WAIVED` booking fee is not a charge
 *
 * Contract 1.32.0's third trap. `BookingFeeStatusEnum` gained `WAIVED`; a waived
 * fee carries the published amount and **collected nothing** — it is the free
 * re-dispatch after a vendor no-show. This screen renders it as "replacement
 * crew, no charge" and does not put the amount beside it as money anybody paid.
 *
 * ## An unrecognised event kind is loud, not blank
 *
 * `TimelineEvent.type` is a bare string, so a sixteenth kind cannot be caught by
 * `tsc`. It is caught here instead: anything outside the published fifteen
 * renders with its raw type, a warning tone and its whole detail object, rather
 * than as a blank row. 1.32.0 added six case-event kinds on the neighbouring
 * surface for exactly this reason.
 */

const SOURCE_LABELS: Record<TimelineSource, string> = {
  requirement: "Request transitions",
  matching: "Matching",
  clarification: "Clarifications",
  proposal: "Quotes",
  site_visit: "Site visits",
  money: "Money",
  engagement: "Engagement",
  case: "Cases",
  cancellation: "Cancellations",
  operations: "Operations touches",
  unrecognised: "Unrecognised",
};

const MONEY_LABELS: Record<string, string> = {
  amount_paise: "Amount",
  total_paise: "Total",
  travel_compensation_paise: "Lead travel compensation",
  platform_share_paise: "Platform share",
  vendor_payout_paise: "Vendor payout",
};

const REASON_LABELS: Record<string, string> = {
  reason: "Reason",
  reason_code: "Reason code",
  remedy_code: "Remedy",
  settlement_reason_code: "Settlement reason",
  cancellation_reason_code: "Cancellation reason",
  resolution: "Resolution",
};

function humanise(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

function ActorLine({ actor }: { actor: TimelineActor }) {
  if (actor.kind === "actor") {
    return (
      <span className="text-text">
        Actor <span className="font-mono">{maskId(actor.actorId)}</span>
      </span>
    );
  }
  if (actor.kind === "not_published") {
    // Said plainly and in the same place a name would go. The alternative —
    // omitting the line — reads as "nobody" to somebody scanning a column.
    return <span className="text-warning-text">Actor not published for this record</span>;
  }
  return <span className="text-text-muted">No actor applies</span>;
}

/**
 * The money on one entry, formatted from server-sent paise and never combined.
 *
 * Several entries carry two or three amounts — a booking fee carries a travel
 * share and a platform share, a visit share carries three. They are listed, not
 * added: the sum of a subset of published components is a number the server did
 * not publish and does not stand behind.
 */
function MoneyLines({ entry }: { entry: TimelineEntry }) {
  const fee = entry.type === "BOOKING_FEE" ? bookingFeeStatement(entry.detail) : null;

  return (
    <>
      {fee !== null ? (
        <p className="mt-1">
          {fee.kind === "no_charge" ? (
            // The published amount is deliberately absent. A `WAIVED` fee carries
            // one and collected nothing; printing it beside "no charge" is the
            // wrong thing to show in the one place it matters most.
            <Badge tone="info">{fee.sentence}</Badge>
          ) : fee.kind === "unrecognised" ? (
            <Badge tone="warning">
              Unrecognised booking-fee status {fee.status === "" ? "(absent)" : fee.status} — the
              amount is not shown, because whether it was collected is unknown
            </Badge>
          ) : (
            <span>
              <strong className="text-text" data-numeric>
                {formatMoney(fee.paise)}
              </strong>{" "}
              — {fee.sentence}
            </span>
          )}
        </p>
      ) : null}

      {entry.money.length > 0 ? (
        <ul className="mt-1 list-none space-y-0.5 p-0">
          {entry.money.map((row) => (
            <li key={row.key}>
              {MONEY_LABELS[row.key] ?? humanise(row.key)}: {formatMoney(row.paise)}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function toneFor(entry: TimelineEntry): "neutral" | "active" | "success" | "warning" | "danger" {
  if (!entry.recognised) return "warning";
  if (entry.descriptor.source === "operations") return "active";
  if (entry.descriptor.source === "case" || entry.descriptor.source === "cancellation") {
    return "danger";
  }
  if (entry.descriptor.source === "money") return "success";
  return "neutral";
}

function EntryRow({ entry }: { entry: TimelineEntry }) {
  const partnerName = typeof entry.detail.partner_name === "string" ? entry.detail.partner_name : null;

  return (
    <TimelineEvent
      title={entry.descriptor.title}
      timestamp={new Date(entry.at).toLocaleString("en-IN")}
      tone={toneFor(entry)}
    >
      <div className="space-y-1">
        <p className="text-xs text-text-muted">
          Source: {SOURCE_LABELS[entry.descriptor.source]}
          {entry.recognised ? null : ` · raw type "${entry.type}"`}
        </p>

        {entry.descriptor.accountable ? (
          <p className="text-xs">
            <ActorLine actor={entry.actor} />
          </p>
        ) : null}

        {partnerName !== null ? <p className="font-medium text-text">{partnerName}</p> : null}

        {entry.status !== null ? (
          <p>
            <Badge tone="neutral">{humanise(entry.status)}</Badge>
          </p>
        ) : null}

        {entry.reasons.map((reason) => (
          <p key={reason.key}>
            <span className="text-text-secondary">
              {REASON_LABELS[reason.key] ?? humanise(reason.key)}:{" "}
            </span>
            <span className="text-text">{humanise(reason.value)}</span>
          </p>
        ))}

        <MoneyLines entry={entry} />

        {!entry.recognised ? (
          // Everything, so nothing is lost while somebody works out what it is.
          <pre className="mt-1 overflow-x-auto rounded-control bg-surface-sunken p-2 text-xs">
            {JSON.stringify(entry.detail, null, 2)}
          </pre>
        ) : null}
      </div>
    </TimelineEvent>
  );
}

/**
 * The touches on this request, and the null that is not false.
 *
 * `within_budget` is nullable and `null` means the owner has not set a budget —
 * `false` would read as a breach and `true` as a pass, and neither is known. So
 * there is a third rendering, and it says exactly that.
 */
function TouchMetricCard({ metric }: { metric: TouchMetric }) {
  const verdict = touchVerdict(metric);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-text">What this request has cost Operations</h2>
      <p className="mt-2 text-2xl font-bold text-text">{metric.touches}</p>
      <p className="text-sm text-text-secondary">
        touches, against {formatMoney(metric.platform_revenue_paise)} of settled platform revenue.
      </p>
      <p className="mt-3">
        {verdict === "no_budget_set" ? (
          <Badge tone="neutral">No budget set — the count is real, the judgement is not</Badge>
        ) : verdict === "within_budget" ? (
          <Badge tone="success">Within the budget of {metric.budget}</Badge>
        ) : (
          <Badge tone="danger">Over the budget of {metric.budget}</Badge>
        )}
      </p>

      {metric.touches_detail.length > 0 ? (
        <ul className="mt-3 list-none space-y-2 p-0 text-sm">
          {metric.touches_detail.map((touch) => (
            <li key={touch.id} className="border-l-2 border-line pl-3">
              <span className="font-semibold text-text">{humanise(touch.action)}</span>
              <span className="text-text-secondary">
                {" · "}
                <time dateTime={touch.occurred_at}>
                  {new Date(touch.occurred_at).toLocaleString("en-IN")}
                </time>
              </span>
              {touch.reason ? <p className="mt-0.5 text-text-secondary">{touch.reason}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function RequestTimelineView({ requirementId }: { requirementId: string }) {
  const timeline = useRequestTimeline(requirementId);
  const metric = useTouchMetric(requirementId);
  const [source, setSource] = useState<TimelineSource | "all">("all");

  const entries = useMemo(
    () => (timeline.data ? timelineEntries(timeline.data) : []),
    [timeline.data],
  );
  const sources = useMemo(() => timelineSources(entries), [entries]);
  const visible = source === "all" ? entries : entries.filter((e) => e.descriptor.source === source);

  if (timeline.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this request…
      </Card>
    );
  }

  if (timeline.isError || !timeline.data) {
    return (
      <ErrorState
        title="We could not load this request"
        message="Either the id is not a request, or nothing has changed and it can be tried again. Existence itself is private, so an id you are not entitled to reads the same as one that does not exist."
        actionLabel="Try again"
        onAction={() => void timeline.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={source === "all" ? "primary" : "outline"}
              aria-pressed={source === "all"}
              onClick={() => setSource("all")}
            >
              Everything
            </Button>
            {sources.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={source === value ? "primary" : "outline"}
                aria-pressed={source === value}
                onClick={() => setSource(value)}
              >
                {SOURCE_LABELS[value]}
              </Button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 text-sm text-text-secondary">
              Nothing has happened on this request under that filter.
            </p>
          ) : (
            <Timeline className="mt-6" label="Everything that happened to this request">
              {visible.map((entry) => (
                <EntryRow key={`${entry.at}-${entry.type}-${JSON.stringify(entry.detail)}`} entry={entry} />
              ))}
            </Timeline>
          )}
        </Card>

        <div className="space-y-4">
          {metric.isPending ? (
            <Card className="flex items-center gap-2 p-4 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading the touch count…
            </Card>
          ) : metric.isError || !metric.data ? (
            <Card className="p-4 text-sm text-text-secondary">
              The touch count could not be read. It is a measure, not a control — nothing on this
              screen depends on it.
            </Card>
          ) : (
            <TouchMetricCard metric={metric.data} />
          )}
        </div>
      </div>
    </div>
  );
}
