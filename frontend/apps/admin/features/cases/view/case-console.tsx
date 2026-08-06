"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

import {
  useAddCaseNote,
  useClaimCase,
  useEscalateCase,
  useOperationsCase,
  useOperationsCases,
  useResolveCase,
  type CaseFilters,
  type OperationsCase,
} from "../queries";

/**
 * The Operations case workspace.
 *
 * ## The resolution list is the server's, always
 *
 * `allowed_resolutions` comes down on every case and is rendered as-is. There is no map from
 * kind to resolutions anywhere in this file — that rule lives in Django, differs per case kind,
 * and a copy here would offer a reviewer a resolution the server refuses the first time the two
 * drift apart.
 *
 * ## Overdue is shown, not computed
 *
 * `is_overdue` is published. Deriving it from `due_at` against a browser clock would make a case
 * look on-time on a device running slow, which is precisely the case somebody needs to see.
 *
 * ## Adding a note never advances anything
 *
 * The plan is explicit that a case may not close merely because a notification was sent. This UI
 * does not move the status when a note is added, and there is no affordance that suggests it
 * would.
 */

const SEVERITY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  LOW: "neutral",
  NORMAL: "info",
  HIGH: "warning",
  URGENT: "danger",
};

const TEAM_LABELS: Record<string, string> = {
  DISPATCH: "Dispatch",
  BOOKING_SUPPORT: "Booking support",
  QUALITY_SUPPORT: "Quality",
  SAFETY: "Safety",
  FINANCE: "Finance",
};

function CaseDetail({ caseId }: { caseId: string }) {
  const detail = useOperationsCase(caseId);
  const claim = useClaimCase();
  const escalate = useEscalateCase();
  const resolve = useResolveCase();
  const addNote = useAddCaseNote();

  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [isCommunication, setIsCommunication] = useState(false);

  if (detail.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this case…
      </Card>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        title="We could not load this case"
        message="Nothing has changed. Try again."
        actionLabel="Try again"
        onAction={() => void detail.refetch()}
      />
    );
  }

  const item: OperationsCase = detail.data;
  const isClosed = item.status === "RESOLVED" || item.status === "CANCELLED";
  const versioned = { caseId: item.id, expectedVersion: item.version };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[item.severity] ?? "neutral"}>{item.severity}</Badge>
            <Badge tone="neutral">{item.status.replaceAll("_", " ")}</Badge>
            {item.is_overdue ? <Badge tone="danger">Overdue</Badge> : null}
            {item.holds_payout ? <Badge tone="warning">Holding payout</Badge> : null}
          </div>
          <h2 className="mt-2 text-lg font-bold text-text">{item.summary}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {TEAM_LABELS[item.owner_team] ?? item.owner_team} · due{" "}
            <time dateTime={item.due_at}>{new Date(item.due_at).toLocaleString("en-IN")}</time>
          </p>
        </div>
      </div>

      {item.detail ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
          {item.detail}
        </p>
      ) : null}

      {!isClosed ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {item.owner_id === null ? (
            <Button
              loading={claim.isPending}
              loadingLabel="Claiming"
              onClick={() => claim.mutate(versioned)}
            >
              Claim this case
            </Button>
          ) : null}
          {item.severity !== "URGENT" ? (
            <Button
              variant="outline"
              loading={escalate.isPending}
              loadingLabel="Escalating"
              onClick={() => escalate.mutate({ ...versioned, severity: "URGENT" })}
            >
              Escalate to urgent
            </Button>
          ) : null}
        </div>
      ) : null}

      {!isClosed ? (
        <section aria-labelledby="resolve-case" className="mt-6 rounded-control border border-line p-4">
          <h3 id="resolve-case" className="text-sm font-semibold text-text">
            Close this case
          </h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Name what actually happened. A case does not close because somebody was contacted.
          </p>

          {resolve.isError ? (
            <ErrorState
              inline
              className="mt-3"
              title="We could not close this case"
              message="Nothing has changed. It may have moved while you were reading it — we have re-checked it."
            />
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Outcome">
              <Select value={resolution} onChange={(event) => setResolution(event.target.value)}>
                <option value="">Choose an outcome…</option>
                {/* Straight from the server. No local map of kind → resolutions exists. */}
                {item.allowed_resolutions.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="What happened">
              <Input value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>

          <Button
            className="mt-3"
            disabled={resolution === "" || note.trim() === "" || resolve.isPending}
            loading={resolve.isPending}
            loadingLabel="Closing"
            onClick={() => resolve.mutate({ ...versioned, resolution, note: note.trim() })}
          >
            Close case
          </Button>
        </section>
      ) : (
        <p className="mt-6 rounded-control bg-surface-sunken p-4 text-sm text-text-secondary">
          Closed as <strong>{item.resolution.replaceAll("_", " ").toLowerCase()}</strong>
          {item.resolution_note ? ` — ${item.resolution_note}` : ""}
        </p>
      )}

      <section aria-labelledby="case-history" className="mt-6">
        <h3 id="case-history" className="text-sm font-semibold text-text">
          History
        </h3>
        <ol className="mt-2 list-none space-y-2 text-sm">
          {item.events.map((event) => (
            <li key={event.id} className="border-l-2 border-line pl-3">
              <span className="font-semibold text-text">
                {event.kind.replaceAll("_", " ").toLowerCase()}
              </span>
              <span className="text-text-secondary">
                {" · "}
                <time dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleString("en-IN")}
                </time>
              </span>
              {event.body ? (
                <p className="mt-1 text-text-secondary">{event.body}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="add-note" className="mt-6">
        <h3 id="add-note" className="text-sm font-semibold text-text">
          Add a note
        </h3>
        <textarea
          aria-label="Note"
          className="mt-2 min-h-20 w-full rounded-control border border-line bg-surface p-2 text-sm"
          value={noteBody}
          onChange={(event) => setNoteBody(event.target.value)}
          maxLength={1000}
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isCommunication}
            onChange={(event) => setIsCommunication(event.target.checked)}
          />
          This records something sent to a person
        </label>
        <Button
          className="mt-2"
          variant="outline"
          disabled={noteBody.trim() === "" || addNote.isPending}
          loading={addNote.isPending}
          loadingLabel="Saving"
          onClick={() =>
            addNote.mutate(
              { caseId: item.id, body: noteBody.trim(), isCommunication },
              { onSuccess: () => setNoteBody("") },
            )
          }
        >
          Add note
        </Button>
      </section>
    </Card>
  );
}

export function CaseConsole() {
  const [filters, setFilters] = useState<CaseFilters>({ status: "OPEN" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cases = useOperationsCases(filters);

  const rows = cases.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
      <div>
        <div className="flex flex-wrap gap-2">
          {["OPEN", "IN_PROGRESS", "RESOLVED"].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filters.status === value ? "primary" : "outline"}
              aria-pressed={filters.status === value}
              onClick={() => setFilters({ ...filters, status: value })}
            >
              {value.replaceAll("_", " ").toLowerCase()}
            </Button>
          ))}
          <Button
            size="sm"
            variant={filters.overdue ? "primary" : "outline"}
            aria-pressed={Boolean(filters.overdue)}
            onClick={() => setFilters({ ...filters, overdue: !filters.overdue })}
          >
            Overdue
          </Button>
        </div>

        {cases.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading cases…
          </p>
        ) : null}

        {!cases.isPending && rows.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">No cases match this filter.</p>
        ) : null}

        <ul className="mt-4 list-none space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelectedId(row.id)}
                aria-current={selectedId === row.id ? "true" : undefined}
                className={[
                  "w-full rounded-card border p-3 text-left text-sm",
                  selectedId === row.id
                    ? "border-signal-300 bg-selected-surface"
                    : "border-line bg-surface hover:bg-surface-hover",
                ].join(" ")}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY_TONE[row.severity] ?? "neutral"}>{row.severity}</Badge>
                  {row.is_overdue ? <Badge tone="danger">Overdue</Badge> : null}
                  {row.holds_payout ? <Badge tone="warning">Holds payout</Badge> : null}
                </span>
                <span className="mt-1 block font-semibold text-text">{row.summary}</span>
                <span className="text-text-secondary">
                  {TEAM_LABELS[row.owner_team] ?? row.owner_team}
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
          Choose a case to see its history and close it.
        </Card>
      ) : (
        <CaseDetail caseId={selectedId} />
      )}
    </div>
  );
}
