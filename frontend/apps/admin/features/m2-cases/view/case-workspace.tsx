"use client";

import { Button, Card, EmptyState, Field, Input, Select, Skeleton } from "@vsolve/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  useCaseQueueSummary,
  useOperationsCases,
  type CaseFilters,
  type CaseQueueSummary,
  type OperationsCaseRow,
} from "@/features/cases/queries";
import { filterChipStyles } from "@/features/money/service-tabs";
import { useDebounced } from "@/features/shared/use-debounced";
import { CaseDetail } from "./case-detail";
import { CASE_KINDS, CASE_KIND_COPY, TEAM_LABEL, caseKindLabel, teamLabel } from "../model/cases";

/** Every state a case can be in while it is still somebody's work. */
const STILL_OPEN = "OPEN,IN_PROGRESS,WAITING";

/** The queue's quick views. Exported for tests. */
export const CASE_VIEWS = [
  { key: "pick-up", label: "To pick up", filters: { status: STILL_OPEN, owner: "unclaimed" } },
  { key: "mine", label: "Mine", filters: { status: STILL_OPEN, owner: "me" } },
  { key: "late", label: "Past deadline", filters: { overdue: true } },
  { key: "open", label: "All open", filters: { status: STILL_OPEN } },
  {
    key: "off-platform",
    label: "Paid outside the app",
    filters: { status: STILL_OPEN, kind: "OFF_PLATFORM" },
  },
  { key: "chargebacks", label: "Chargebacks", filters: { status: STILL_OPEN, kind: "CHARGEBACK" } },
  { key: "closed", label: "Closed", filters: { status: "RESOLVED,CANCELLED" } },
] as const satisfies readonly { key: string; label: string; filters: CaseFilters }[];

export type CaseViewKey = (typeof CASE_VIEWS)[number]["key"];

/** The server's count for a view, or null when it publishes none. Exported for tests. */
export function viewCount(view: CaseViewKey, summary: CaseQueueSummary | undefined): number | null {
  if (!summary) return null;
  switch (view) {
    case "pick-up":
      return summary.teams.reduce((sum, team) => sum + team.unclaimed, 0);
    case "mine":
      return summary.mine_open;
    case "late":
      return summary.breaching_sla;
    case "open":
      return summary.teams.reduce((sum, team) => sum + team.open, 0);
    default:
      return null;
  }
}

const SEVERITY_DOT: Record<string, string> = {
  URGENT: "bg-danger-text",
  HIGH: "bg-warning-text",
  NORMAL: "bg-info-text",
  LOW: "bg-text-muted",
};

/** "Overdue 3h" / "Due in 45m", against the server's clock. */
function dueLabel(row: OperationsCaseRow, serverNow: string | undefined): string {
  const now = serverNow ? Date.parse(serverNow) : Date.now();
  const minutes = Math.round((Date.parse(row.due_at) - now) / 60_000);
  const span = (m: number) => {
    const abs = Math.abs(m);
    if (abs < 60) return `${abs}m`;
    if (abs < 60 * 48) return `${Math.round(abs / 60)}h`;
    return `${Math.round(abs / 1440)}d`;
  };
  return minutes < 0 ? `Overdue ${span(minutes)}` : `Due in ${span(minutes)}`;
}

function CaseRow({
  row,
  selected,
  serverNow,
  onSelect,
}: {
  row: OperationsCaseRow;
  selected: boolean;
  serverNow: string | undefined;
  onSelect: () => void;
}) {
  const who = row.people[0];
  const closed = row.status === "RESOLVED" || row.status === "CANCELLED";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={[
        "flex w-full items-start gap-3 rounded-card border p-3 text-left",
        selected ? "border-[#EA580C] bg-selected-surface" : "border-line bg-surface hover:bg-surface-hover",
      ].join(" ")}
    >
      <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${SEVERITY_DOT[row.severity] ?? "bg-text-muted"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{row.summary}</span>
        <span className="block truncate text-xs text-text-secondary">
          {caseKindLabel(row.kind)}
          {who ? ` · ${who.name || who.role}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {closed ? (
            <span className="text-text-secondary">Closed</span>
          ) : (
            <span className={row.is_overdue ? "font-semibold text-danger-text" : "text-text-secondary"}>
              {dueLabel(row, serverNow)}
            </span>
          )}
          <span className="text-text-secondary">{row.owner_name ?? "Unclaimed"}</span>
          {row.holds_payout ? <span className="font-semibold text-warning-text">Payout on hold</span> : null}
        </span>
      </span>
    </button>
  );
}

/**
 * The case queue: pick a view, search, open a case. Counts are the server's own totals; the list
 * pages from the server, so search and filters cover every case, not the ones on screen.
 */
export function CaseWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("case");

  const [view, setView] = useState<CaseViewKey>("pick-up");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [severity, setSeverity] = useState("");
  const [team, setTeam] = useState("");
  const q = useDebounced(search.trim());
  const summary = useCaseQueueSummary();

  const viewFilters = CASE_VIEWS.find((entry) => entry.key === view)?.filters ?? {};
  const filters: CaseFilters = {
    ...viewFilters,
    ...(kind ? { kind } : {}),
    ...(severity ? { severity } : {}),
    ...(team ? { ownerTeam: team } : {}),
    ...(q ? { q } : {}),
  };
  const cases = useOperationsCases(filters);
  const rows = cases.data?.pages.flatMap((page) => page.results) ?? [];

  const select = (caseId: string) => {
    // In the URL so a case survives a reload and can be pasted to a colleague.
    const next = new URLSearchParams(searchParams.toString());
    next.set("case", caseId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Case views" className="flex flex-wrap gap-2">
        {CASE_VIEWS.map((entry) => {
          const count = viewCount(entry.key, summary.data);
          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={view === entry.key}
              className={filterChipStyles(view === entry.key)}
              onClick={() => setView(entry.key)}
            >
              {entry.label}
              {count !== null ? <span className="tabular-nums opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
        <div className="flex flex-col gap-3">
          <Field label="Search">
            <Input
              value={search}
              placeholder="Customer or partner name, phone, words, or an id"
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Kind">
              <Select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="">Any</option>
                {CASE_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {CASE_KIND_COPY[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="">Any</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Low</option>
              </Select>
            </Field>
            <Field label="Team">
              <Select value={team} onChange={(event) => setTeam(event.target.value)}>
                <option value="">Any</option>
                {Object.keys(TEAM_LABEL).map((value) => (
                  <option key={value} value={value}>
                    {teamLabel(value)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {cases.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : null}
          {cases.isError ? (
            <p role="alert" className="text-sm text-danger-text">
              Cases could not be loaded. Try again in a moment.
            </p>
          ) : null}
          {!cases.isPending && !cases.isError && rows.length === 0 ? (
            <EmptyState
              compact
              title={view === "pick-up" && !q ? "Nothing to pick up" : "No cases match"}
              description={view === "pick-up" && !q ? "Every open case has someone on it." : "Try another view or clear the search."}
            />
          ) : null}

          <ul className="list-none space-y-2 p-0">
            {rows.map((row) => (
              <li key={row.id}>
                <CaseRow
                  row={row}
                  selected={selectedId === row.id}
                  serverNow={summary.data?.server_now}
                  onSelect={() => select(row.id)}
                />
              </li>
            ))}
          </ul>

          {cases.hasNextPage ? (
            <Button
              variant="outline"
              loading={cases.isFetchingNextPage}
              loadingLabel="Loading"
              onClick={() => void cases.fetchNextPage()}
            >
              Show more cases
            </Button>
          ) : null}
        </div>

        <div className="min-w-0">
          {selectedId === null ? (
            <Card className="p-6 text-sm text-text-secondary">
              Pick a case on the left to see who it&apos;s about and what you can do.
            </Card>
          ) : (
            <CaseDetail key={selectedId} caseId={selectedId} />
          )}
        </div>
      </div>
    </div>
  );
}
