"use client";

import { Badge, Button, Card, EmptyState, Select, Spinner } from "@vsolve/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  useCaseQueueSummary,
  useOperationsCases,
  type CaseFilters,
} from "@/features/cases/queries";
import { CaseDetail } from "./case-detail";
import {
  CASE_KINDS,
  CASE_KIND_COPY,
  CASE_STATUS_LABEL,
  SEVERITY_TONE,
  caseKindLabel,
  teamLabel,
  type CaseStatus,
} from "../model/cases";

/**
 * The Operations case queue, in M2's vocabulary.
 *
 * This is the M1 console's route and the M1 console's endpoints. It is not a second case system —
 * `08-frontend-information-architecture.md` is explicit that "M2 case kinds join it rather than
 * forking a second case system", and the queue, claim, escalate, resolve and note hooks are
 * imported from `features/cases/queries.ts` rather than rewritten. What is new here is the
 * vocabulary Wave C6 published: five more kinds, two more subjects, six more event kinds, and the
 * three commands that decide a deadline, an appeal and an override.
 *
 * ## The kind filter lists every kind, from the type
 *
 * `CASE_KINDS` is derived from a map keyed on the generated enum, so the filter cannot quietly
 * omit a kind the server can return. A hand-written list of nine options is how the five M2 kinds
 * would have become unfilterable — visible in the queue, unreachable by anybody looking for them.
 *
 * ## The counts are the server's
 *
 * The queue is cursor-paginated, so counting the rows on screen would publish "the first fifty" as
 * a total and show a calm board over a queue that is drowning. `GET /operations/cases/summary/`
 * counts server-side and that is what the strip renders.
 */

/**
 * Derived from the label map, which is keyed on the generated enum.
 *
 * Hand-writing the five would be a second copy of the status vocabulary, and the first time the
 * contract gained a sixth this filter would quietly stop being able to reach it — cases visible
 * in one view and unreachable from the queue that is meant to find them.
 */
const STATUS_CHOICES = Object.keys(CASE_STATUS_LABEL) as CaseStatus[];

function QueueSummaryStrip() {
  const summary = useCaseQueueSummary();

  if (summary.isPending || !summary.data) return null;

  const data = summary.data;
  const cards: { label: string; value: string; tone: "neutral" | "warning" | "danger" }[] = [
    {
      label: "Past our SLA",
      value: String(data.breaching_sla),
      tone: data.breaching_sla > 0 ? "danger" : "neutral",
    },
    {
      label: "Oldest breach",
      value:
        data.oldest_overdue_minutes === null
          ? "None"
          : `${Math.round(data.oldest_overdue_minutes / 60)} h`,
      tone: data.oldest_overdue_minutes === null ? "neutral" : "warning",
    },
    { label: "Mine, open", value: String(data.mine_open), tone: "neutral" },
    {
      label: "Mine, due soon",
      value: String(data.mine_due_soon),
      tone: data.mine_due_soon > 0 ? "warning" : "neutral",
    },
    {
      label: "Holding payout",
      value: String(data.holding_payout),
      tone: data.holding_payout > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {card.label}
          </p>
          <p
            data-numeric
            className={[
              "mt-1 text-2xl font-bold",
              card.tone === "danger"
                ? "text-danger-text"
                : card.tone === "warning"
                  ? "text-warning-text"
                  : "text-text",
            ].join(" ")}
          >
            {card.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

function TeamDepths() {
  const summary = useCaseQueueSummary();
  if (summary.isPending || !summary.data || summary.data.teams.length === 0) return null;

  return (
    <p className="mt-3 text-sm text-text-secondary">
      {summary.data.teams
        .map(
          (team) =>
            `${teamLabel(team.owner_team)}: ${team.open} open, ${team.unclaimed} unclaimed`,
        )
        .join(" · ")}
    </p>
  );
}

export function CaseWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("case");

  const [filters, setFilters] = useState<CaseFilters>({ status: "OPEN" });
  const cases = useOperationsCases(filters);

  const rows = cases.data?.pages.flatMap((page) => page.results) ?? [];

  const select = (caseId: string) => {
    // A case is a thing people paste to each other. The id belongs in the URL so it survives a
    // reload and a handover, which is the whole reason this is a query parameter and not state.
    const next = new URLSearchParams(searchParams.toString());
    next.set("case", caseId);
    router.replace(`/operations/cases?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <QueueSummaryStrip />
      <TeamDepths />

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <div>
          <div className="flex flex-wrap gap-2">
            {STATUS_CHOICES.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filters.status === value ? "primary" : "outline"}
                aria-pressed={filters.status === value}
                onClick={() => setFilters({ ...filters, status: value })}
              >
                {CASE_STATUS_LABEL[value]}
              </Button>
            ))}
            <Button
              size="sm"
              variant={filters.overdue ? "primary" : "outline"}
              aria-pressed={Boolean(filters.overdue)}
              onClick={() => setFilters({ ...filters, overdue: !filters.overdue })}
            >
              Past SLA
            </Button>
            <Button
              size="sm"
              variant={filters.owner === "unclaimed" ? "primary" : "outline"}
              aria-pressed={filters.owner === "unclaimed"}
              onClick={() =>
                setFilters({
                  ...filters,
                  owner: filters.owner === "unclaimed" ? undefined : "unclaimed",
                })
              }
            >
              Unclaimed
            </Button>
            <Button
              size="sm"
              variant={filters.owner === "me" ? "primary" : "outline"}
              aria-pressed={filters.owner === "me"}
              onClick={() =>
                setFilters({ ...filters, owner: filters.owner === "me" ? undefined : "me" })
              }
            >
              Mine
            </Button>
          </div>

          <label className="mt-3 block text-sm font-medium text-text" htmlFor="case-kind-filter">
            Kind
          </label>
          <Select
            id="case-kind-filter"
            className="mt-1"
            value={filters.kind ?? ""}
            onChange={(event) =>
              setFilters({ ...filters, kind: event.target.value === "" ? undefined : event.target.value })
            }
          >
            <option value="">Every kind</option>
            {CASE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CASE_KIND_COPY[kind].label}
                {CASE_KIND_COPY[kind].isM2 ? " (M2)" : ""}
              </option>
            ))}
          </Select>

          {cases.isPending ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading cases…
            </p>
          ) : null}

          {!cases.isPending && rows.length === 0 ? (
            <EmptyState
              compact
              className="mt-4"
              title="No cases match this filter"
              description="An empty queue here is a real answer, not a missing one. Widen the filter to check."
            />
          ) : null}

          <ul className="mt-4 list-none space-y-2 p-0">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => select(row.id)}
                  aria-current={selectedId === row.id ? "true" : undefined}
                  className={[
                    "w-full rounded-card border p-3 text-left text-sm",
                    selectedId === row.id
                      ? "border-signal-300 bg-selected-surface"
                      : "border-line bg-surface hover:bg-surface-hover",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge>
                    {row.is_overdue ? <Badge tone="danger">Past SLA</Badge> : null}
                    {row.holds_payout ? <Badge tone="warning">Holds payout</Badge> : null}
                  </span>
                  <span className="mt-1 block font-semibold text-text">{row.summary}</span>
                  <span className="text-text-secondary">
                    {caseKindLabel(row.kind)} · {teamLabel(row.owner_team)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {cases.hasNextPage ? (
            <Button
              className="mt-3"
              variant="outline"
              loading={cases.isFetchingNextPage}
              loadingLabel="Loading"
              onClick={() => void cases.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </div>

        {selectedId === null ? (
          <Card className="p-6 text-sm text-text-secondary">
            Choose a case to see what was claimed, what was shown, and what may be decided.
          </Card>
        ) : (
          <CaseDetail caseId={selectedId} />
        )}
      </div>
    </div>
  );
}
