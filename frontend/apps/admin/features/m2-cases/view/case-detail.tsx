"use client";

import { Badge, Button, Card, ErrorState, Skeleton, Textarea } from "@vsolve/ui";
import { ExternalLink, Phone } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { useAddCaseNote, useClaimCase, useOperationsCase } from "@/features/cases/queries";
import { filterChipStyles } from "@/features/money/service-tabs";
import { CaseEventTrail, CaseEvidencePanel } from "./case-record";
import {
  AppealPanel,
  EscalatePanel,
  OverridePanel,
  ResolvePanel,
  ResponseDeadlinePanel,
} from "./case-commands";
import { SourceDecisionPanel, sourceDecisionKind } from "./source-decision";
import {
  CASE_KIND_COPY,
  CASE_STATUS_LABEL,
  SEVERITY_TONE,
  appealPhase,
  caseKindLabel,
  caseRequirementId,
  describeRelative,
  formatMoment,
  isCaseClosed,
  isKnownCaseKind,
  resolutionLabel,
  teamLabel,
  type OperationsCase,
} from "../model/cases";

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/** The actions an open or closed case offers, in the order an operator reaches for them. */
type ActionKey = "close" | "deadline" | "note" | "appeal" | "change";

function availableActions(item: OperationsCase): { key: ActionKey; label: string }[] {
  const closed = isCaseClosed(item);
  const actions: { key: ActionKey; label: string }[] = [];
  if (appealPhase(item) === "AWAITING_DECISION") actions.push({ key: "appeal", label: "Decide the appeal" });
  if (!closed) actions.push({ key: "close", label: "Close case" });
  if (!closed) actions.push({ key: "deadline", label: "Change reply deadline" });
  if (closed) actions.push({ key: "change", label: "Change outcome" });
  actions.push({ key: "note", label: "Add a note" });
  return actions;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="m-0 text-sm text-text">{children}</dd>
    </div>
  );
}

/** Who the case is about, with a call link each: the first thing an operator needs. */
function People({ item }: { item: OperationsCase }) {
  if (item.people.length === 0) return null;
  return (
    <ul className="mt-4 grid gap-2 xl:grid-cols-2">
      {item.people.map((person) => (
        <li
          key={`${person.role}-${person.phone || person.name}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-sunken px-3 py-2"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase text-text-muted">{person.role}</span>
            <span className="block break-words text-sm font-semibold text-text">{person.name || "No name"}</span>
          </span>
          {person.phone ? (
            <a
              href={`tel:${person.phone}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-text-link hover:border-line-strong"
            >
              <Phone aria-hidden className="size-3.5" /> {person.phone}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Where to go to act on what the case is about. */
function LinkedRecords({ item }: { item: OperationsCase }) {
  const requirementId = caseRequirementId(item);
  const links: { href: string; label: string }[] = [];
  if (item.booking_id) links.push({ href: `/operations/visits?id=${item.booking_id}`, label: "Open the visit" });
  if (requirementId) links.push({ href: `/operations/requests/${requirementId}`, label: "Open the request" });
  if (links.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-sm font-semibold text-text-link hover:border-line-strong"
        >
          {link.label} <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      ))}
    </div>
  );
}

function NotePanel({ item }: { item: OperationsCase }) {
  const addNote = useAddCaseNote();
  const [body, setBody] = useState("");
  const [isCommunication, setIsCommunication] = useState(false);

  return (
    <section aria-labelledby="add-note" className="rounded-control border border-line p-4">
      <h3 id="add-note" className="text-sm font-semibold text-text">
        Add a note
      </h3>
      <p className="mt-1 text-sm text-text-secondary">Saved in the history. A note does not change the case.</p>
      <Textarea
        aria-label="Note"
        className="mt-3"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
      />
      <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={isCommunication}
          onChange={(event) => setIsCommunication(event.target.checked)}
        />
        I called or messaged someone
      </label>
      <Button
        className="mt-3"
        variant="outline"
        disabled={body.trim() === "" || addNote.isPending}
        loading={addNote.isPending}
        loadingLabel="Saving"
        onClick={() =>
          addNote.mutate(
            { caseId: item.id, body: body.trim(), isCommunication },
            { onSuccess: () => setBody("") },
          )
        }
      >
        Save note
      </Button>
    </section>
  );
}

function ActionPanel({ action, item }: { action: ActionKey; item: OperationsCase }) {
  switch (action) {
    case "close":
      return <ResolvePanel item={item} />;
    case "deadline":
      return <ResponseDeadlinePanel item={item} />;
    case "appeal":
      return <AppealPanel item={item} />;
    case "change":
      return <OverridePanel item={item} />;
    case "note":
      return <NotePanel item={item} />;
  }
}

export function CaseDetail({ caseId }: { caseId: string }) {
  const detail = useOperationsCase(caseId);
  const claim = useClaimCase();
  const [action, setAction] = useState<ActionKey | null>(null);

  if (detail.isPending) {
    return (
      <Card className="space-y-3 p-6" aria-busy="true">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        title="We could not load this case"
        message="It may have been removed, or you may not have access to it."
        actionLabel="Try again"
        onAction={() => void detail.refetch()}
      />
    );
  }

  const item: OperationsCase = detail.data;
  const closed = isCaseClosed(item);
  const kindCopy = isKnownCaseKind(item.kind) ? CASE_KIND_COPY[item.kind] : null;
  const actions = availableActions(item);
  const current = action !== null && actions.some((entry) => entry.key === action) ? action : null;
  // A disputed stage or a safety report is decided on its own record first; the case follows it.
  const decideFirst = !closed && sourceDecisionKind(item) !== null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_LABEL[item.severity] ?? item.severity}</Badge>
          <Badge tone="neutral">{caseKindLabel(item.kind)}</Badge>
          <Badge tone={closed ? "success" : "neutral"}>{CASE_STATUS_LABEL[item.status]}</Badge>
          {item.is_overdue && !closed ? <Badge tone="danger">Past deadline</Badge> : null}
          {item.holds_payout ? <Badge tone="warning">Partner payout on hold</Badge> : null}
        </div>

        <h2 className="mt-3 text-lg font-bold text-text">{item.summary}</h2>
        {kindCopy ? <p className="mt-1 text-sm text-text-secondary">{kindCopy.claim}</p> : null}
        {item.detail ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text">{item.detail}</p> : null}

        <People item={item} />
        <LinkedRecords item={item} />

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 2xl:grid-cols-4">
          <Fact label={closed ? "Was due" : "Due"}>
            <span className={item.is_overdue && !closed ? "font-semibold text-danger-text" : undefined}>
              {describeRelative(item.due_at, item.server_now)}
            </span>
            <span className="block text-xs text-text-secondary">{formatMoment(item.due_at)}</span>
          </Fact>
          <Fact label="They reply by">
            {item.response_due_at === null ? (
              <span className="text-text-secondary">No deadline</span>
            ) : (
              <>
                {describeRelative(item.response_due_at, item.server_now)}
                <span className="block text-xs text-text-secondary">{formatMoment(item.response_due_at)}</span>
              </>
            )}
          </Fact>
          <Fact label="Team">{teamLabel(item.owner_team)}</Fact>
          <Fact label="Handled by">
            {item.owner_name ?? <span className="text-text-secondary">Nobody yet</span>}
          </Fact>
        </dl>

        {closed ? (
          <p className="mt-4 rounded-control bg-success-surface p-3 text-sm text-success-text">
            Closed {item.resolved_at ? formatMoment(item.resolved_at) : ""} as{" "}
            <strong>{resolutionLabel(item.resolution || "—")}</strong>
            {item.resolution_note ? `: ${item.resolution_note}` : ""}
          </p>
        ) : null}
        {item.holds_payout && !closed ? (
          <p className="mt-4 rounded-control bg-warning-surface p-3 text-sm text-warning-text">
            The partner can&apos;t be paid for this work until the case is closed.
          </p>
        ) : null}
      </Card>

      {decideFirst ? (
        <Card className="border-warning-line p-5">
          <h3 className="text-sm font-bold text-text">Decide this first</h3>
          <p className="mt-1 text-sm text-text-secondary">
            This case came from a report that needs its own decision before the case can be closed.
          </p>
          <div className="mt-3">
            <SourceDecisionPanel item={item} />
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {!closed && item.owner_id === null ? (
            <Button
              loading={claim.isPending}
              loadingLabel="Taking it"
              onClick={() => claim.mutate({ caseId: item.id, expectedVersion: item.version })}
            >
              I&apos;ll handle this
            </Button>
          ) : null}
          {actions.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={current === entry.key}
              className={filterChipStyles(current === entry.key)}
              onClick={() => setAction(current === entry.key ? null : entry.key)}
            >
              {entry.label}
            </button>
          ))}
          {!closed ? <EscalatePanel item={item} /> : null}
        </div>
        {current !== null ? (
          <div className="mt-4">
            <ActionPanel action={current} item={item} />
          </div>
        ) : null}
        {appealPhase(item) === "DECIDED" && current === null ? (
          <div className="mt-4">
            <AppealPanel item={item} />
          </div>
        ) : null}
      </Card>

      <details className="group rounded-card border border-line bg-surface">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-text marker:hidden">
          History and evidence
          <span className="ml-2 text-xs font-normal text-text-secondary">
            {item.events.length} {item.events.length === 1 ? "event" : "events"} · {item.evidence.length} evidence
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-line p-4">
          <CaseEvidencePanel evidence={item.evidence} />
          <CaseEventTrail events={item.events} />
        </div>
      </details>
    </div>
  );
}
