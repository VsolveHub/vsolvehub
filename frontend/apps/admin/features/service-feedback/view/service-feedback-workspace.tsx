"use client";

import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useMemo, useState } from "react";

import {
  FEEDBACK_WINDOWS,
  useServiceFeedback,
  type FeedbackWindow,
  type ServiceFeedbackRow,
} from "../queries";
import { ServiceFeedbackNotesPanel } from "./service-feedback-notes-panel";

/**
 * What customers say about each service, and about us.
 *
 * ## Two scores, side by side, never blended
 *
 * A service whose partners are rated 4.6 and whose booking experience is rated 3.1 is the entire
 * point of this page: the people are fine and the product is not. A single combined number
 * averages exactly that finding away, so the two are published separately and rendered together.
 *
 * ## Worst platform score first, and silence is not a bad score
 *
 * The reason to open this page is to find what to fix, so the ordering is worst-first. A service
 * nobody has answered about sorts **last**, not first — treating no answers as zero stars would
 * bury the services people actually complained about under the ones nobody has used yet.
 *
 * ## The unattributed row is kept
 *
 * Feedback on a visit that covered several services cannot honestly be assigned to one of them, so
 * it is counted on its own row. An operator reading per-service averages needs to know how much
 * was left out of them; dropping it would make the page quietly overclaim.
 */
export function ServiceFeedbackWorkspace() {
  const [days, setDays] = useState<FeedbackWindow>(90);
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<ServiceFeedbackRow | null>(null);
  const feedback = useServiceFeedback(days);

  const allRows = useMemo(() => feedback.data?.services ?? [], [feedback.data?.services]);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en-IN");
    if (term === "") return allRows;
    return allRows.filter(
      (row) =>
        row.variant_name.toLocaleLowerCase("en-IN").includes(term) ||
        row.service_name.toLocaleLowerCase("en-IN").includes(term) ||
        row.category_name.toLocaleLowerCase("en-IN").includes(term),
    );
  }, [allRows, search]);

  return (
    <section aria-labelledby="service-feedback-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="service-feedback-title" className="text-base font-bold text-text">
            Every service anyone has answered about
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Worst platform score first. Partner and platform scores are kept apart on purpose.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label="Period" className="w-40">
            <select
              value={days === null ? "all" : String(days)}
              /* Resolved back through the window list rather than parsed. `Number(value)` would
                 widen to `number` and let any integer become a period the list never offered. */
              onChange={(event) =>
                setDays(
                  FEEDBACK_WINDOWS.find(
                    (window) =>
                      (window.days === null ? "all" : String(window.days)) ===
                      event.target.value,
                  )?.days ?? null,
                )
              }
              className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-text"
            >
              {FEEDBACK_WINDOWS.map((window) => (
                <option key={window.label} value={window.days === null ? "all" : window.days}>
                  {window.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search service" className="w-full sm:w-64">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Service or category"
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      {feedback.isPending ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
          <Spinner size="sm" />
          Loading feedback…
        </p>
      ) : feedback.isError ? (
        <ErrorState
          className="mt-6"
          title="We could not load service feedback"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void feedback.refetch()}
        />
      ) : allRows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No feedback in this period"
          description="Customers are asked once a job finishes. Widen the period, or wait for the first completed jobs."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          className="mt-6"
          title="No matching service"
          description="Try a different service or category name."
          action={
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <li key={row.variant_id ?? "unattributed"}>
              <ServiceCard row={row} onOpenNotes={() => setOpenRow(row)} />
            </li>
          ))}
        </ul>
      )}

      <ServiceFeedbackNotesPanel
        row={openRow}
        days={days}
        open={openRow !== null}
        onOpenChange={(open) => {
          if (!open) setOpenRow(null);
        }}
      />
    </section>
  );
}

function ServiceCard({
  row,
  onOpenNotes,
}: {
  readonly row: ServiceFeedbackRow;
  readonly onOpenNotes: () => void;
}) {
  const unattributed = row.variant_id === null;
  const busiest = Math.max(1, ...row.tags.map((tag) => tag.count));

  if (unattributed) {
    return (
      <Card className="border-dashed border-line-strong bg-surface-sunken p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-text">Not attributed to a service</p>
          <p className="text-sm tabular-nums text-text-secondary">
            {row.platform_count + row.partner_count} answers
          </p>
        </div>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Jobs whose visit covered more than one service, so no single service can honestly claim
          them. Counted here rather than folded into an average.
        </p>
        {row.note_count > 0 ? (
          <Button variant="ghost" className="mt-3" onClick={onOpenNotes}>
            Read {row.note_count} {row.note_count === 1 ? "note" : "notes"}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text">{row.variant_name}</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            {row.service_name}
            {row.category_name ? ` · ${row.category_name}` : ""}
          </p>
        </div>
        {row.platform_score === null && row.partner_score === null ? (
          <Badge tone="neutral">No feedback yet</Badge>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        <ScorePair label="Partner" score={row.partner_score} count={row.partner_count} />
        <ScorePair label="Platform" score={row.platform_score} count={row.platform_count} />
      </div>

      {row.tags.length > 0 ? (
        <ul className="mt-4 flex list-none flex-col gap-1.5 p-0">
          {row.tags.map((tag) => (
            <li key={tag.code} className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-2 shrink-0 rounded-full bg-action"
                style={{ width: `${Math.max(6, (tag.count / busiest) * 100)}%`, maxWidth: "55%" }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                {tag.label}
              </span>
              <span className="text-sm font-semibold tabular-nums text-text">{tag.count}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {row.note_count > 0 ? (
        <div className="mt-4">
          <Button variant="outline" onClick={onOpenNotes}>
            Read {row.note_count} {row.note_count === 1 ? "note" : "notes"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * One score with its sample size.
 *
 * The count is never hidden: `★ 5.0 (1)` and `★ 5.0 (300)` are the same number and completely
 * different facts, and a score shown alone invites acting on the first as if it were the second.
 */
function ScorePair({
  label,
  score,
  count,
}: {
  readonly label: string;
  readonly score: number | null;
  readonly count: number;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {score === null ? (
        <p className="mt-0.5 text-sm text-text-muted">Nobody has answered</p>
      ) : (
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums text-text">★ {score.toFixed(1)}</span>
          <span className="text-sm tabular-nums text-text-secondary">({count})</span>
        </p>
      )}
    </div>
  );
}
