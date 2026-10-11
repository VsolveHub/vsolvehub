"use client";

import { Badge, Button, Card, ErrorState, Spinner, Textarea } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { useAddCaseNote, useClaimCase, useOperationsCase } from "@/features/cases/queries";
import { maskId } from "@/features/shared/identifiers";
import { CaseCommands, EscalatePanel } from "./case-commands";
import { CaseEventTrail, CaseEvidencePanel } from "./case-record";
import {
  CASE_KIND_COPY,
  SEVERITY_TONE,
  CASE_STATUS_LABEL,
  caseKindLabel,
  caseRequirementId,
  caseSubjects,
  describeRelative,
  formatMoment,
  heldEntryCount,
  isCaseClosed,
  isKnownCaseKind,
  resolutionLabel,
  teamLabel,
  type OperationsCase,
} from "../model/cases";

/**
 * One case, end to end.
 *
 * ## Two clocks, never merged
 *
 * `due_at` is the deadline **Operations** is measured on and `is_overdue` is published against
 * it. `response_due_at` is the deadline **the parties** are measured on, and it is nullable
 * because a variant may have configured no window. Collapsing them into one "due" would hide
 * whichever one is not breached, and they breach for different reasons and land on different
 * people.
 *
 * ## Overdue is shown, never computed
 *
 * `is_overdue` and `server_now` are both published. A console that compared `due_at` to a browser
 * clock would call a breached case on-time on a laptop running slow — which is exactly the case
 * somebody needs to see.
 *
 * ## The subject is read from all five fields
 *
 * 1.32.0 added `requirement_id` and `engagement_id`, and the M2 kinds are mostly about those two.
 * A reader that checked the original three would render every cancellation conflict, attendance
 * dispute and disputed milestone as a case about nothing at all.
 */

function SubjectRow({ item }: { item: OperationsCase }) {
  const subjects = caseSubjects(item);
  const requirementId = caseRequirementId(item);

  if (subjects.length === 0) {
    return (
      <p className="mt-2 text-sm text-warning-text">
        This case names no subject. A case is opened about exactly one booking, order, partner,
        request or engagement, so a case with none is a record that needs looking at directly
        rather than worked from this screen.
      </p>
    );
  }

  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
      {subjects.map((subject) => (
        <div key={subject.key}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {subject.label}
          </dt>
          <dd className="m-0 text-sm text-text">
            {subject.key === "requirement_id" && requirementId !== null ? (
              <Link
                href={`/operations/requests/${requirementId}`}
                className="text-text-link hover:underline"
              >
                {maskId(subject.id)}
              </Link>
            ) : subject.key === "booking_id" ? (
              <Link
                href={`/operations/visits?id=${subject.id}`}
                className="text-text-link hover:underline"
              >
                {maskId(subject.id)}
              </Link>
            ) : (
              maskId(subject.id)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The cancellation-conflict review (`M2-FE-709`, Operations half).
 *
 * The dual confirmation itself happens between the two parties in their own apps: one side
 * cancels, the other confirms or disputes, and disputing settles nothing. What lands here is the
 * disagreement — and it lands as a case that freezes the vendor's unpaid earnings until somebody
 * decides.
 *
 * **What this panel does not show, and why it says so.** The cancellation record carries
 * `contact_disclosed`, `work_reported_started`, `requires_counterparty_confirmation`,
 * `confirmation_due_at` and the per-product `remedy` breakdown — and every published read of it is
 * scoped to the two parties. Operations has no read of those fields at 1.32.0; the request
 * timeline's `CANCELLATION` event publishes only the id, status, actor role, reason code and
 * remedy code. Inventing the missing half from the case summary would be the console asserting
 * facts about money it has not been told, so it names the gap instead.
 */
function CancellationConflictPanel({ item }: { item: OperationsCase }) {
  if (item.kind !== "CANCELLATION_CONFLICT") return null;
  const requirementId = caseRequirementId(item);

  return (
    <section
      aria-labelledby="cancellation-conflict"
      className="mt-6 rounded-control border border-warning-line bg-warning-surface p-4"
    >
      <h3 id="cancellation-conflict" className="text-sm font-semibold text-warning-text">
        A cancellation both sides describe differently
      </h3>
      <p className="mt-1 text-sm leading-6 text-text">
        One party called this job off and the other disputed it. <strong>Nothing was executed</strong>{" "}
        — no refund, no forfeit, no payout — and the vendor&rsquo;s unpaid earnings are frozen by
        this case rather than by a timer. Silence does not settle it either: a confirmation window
        that lapsed arrives here the same way a dispute does.
      </p>
      <p className="mt-2 text-sm leading-6 text-text">
        The disputing party&rsquo;s account is in the case detail above and their evidence is below.
        The other side&rsquo;s account is on the request.
      </p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Whether contact had been disclosed, whether work was reported started, and the remedy the
        server calculated are on the cancellation record, which only the two parties may read at
        contract 1.32.0. This console does not have them and does not guess them.
      </p>
      {requirementId === null ? null : (
        <Link
          href={`/operations/requests/${requirementId}`}
          className="mt-3 inline-block text-sm font-semibold text-text-link hover:underline"
        >
          Open the request console for the full history
        </Link>
      )}
    </section>
  );
}

function PayoutHoldPanel({ item }: { item: OperationsCase }) {
  if (!item.holds_payout) return null;
  const held = heldEntryCount(item.held_ledger_entry_ids);

  return (
    <section
      aria-labelledby="payout-hold"
      className="mt-6 rounded-control border border-line bg-surface-sunken p-4"
    >
      <h3 id="payout-hold" className="text-sm font-semibold text-text">
        This case is holding money
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {held === null
          ? "The server did not publish a countable list of held entries, so no number is shown here rather than a guessed one."
          : held === 0
            ? "No earnings are frozen yet. The hold belongs to the case rather than to a list of entries — a case about a partner or a booking with no engagement behind it freezes nothing today and still refuses to be paid past."
            : `${held} ledger ${held === 1 ? "entry is" : "entries are"} frozen while this case is open.`}{" "}
        The hold exists because somebody has said the work did not happen as recorded. Closing the
        case releases it; an overturned appeal puts it back.
      </p>
    </section>
  );
}

function NotesPanel({ item }: { item: OperationsCase }) {
  const addNote = useAddCaseNote();
  const [body, setBody] = useState("");
  const [isCommunication, setIsCommunication] = useState(false);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">Add a note</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        A note never moves the case. Sending somebody a message is not progress, and a case that
        advanced on &ldquo;note added&rdquo; would be a case that closes by being talked about.
      </p>
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
        This records something sent to a person
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
        Add note
      </Button>
    </Card>
  );
}

export function CaseDetail({ caseId }: { caseId: string }) {
  const detail = useOperationsCase(caseId);
  const claim = useClaimCase();

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
        message="Nothing has changed. It may not exist, or it may not be yours to see — existence itself is private here, so a missing case and a forbidden one look the same on purpose."
        actionLabel="Try again"
        onAction={() => void detail.refetch()}
      />
    );
  }

  const item: OperationsCase = detail.data;
  const closed = isCaseClosed(item);
  const kindCopy = isKnownCaseKind(item.kind) ? CASE_KIND_COPY[item.kind] : null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[item.severity]}>{item.severity}</Badge>
          <Badge tone="neutral">{CASE_STATUS_LABEL[item.status]}</Badge>
          <Badge tone="neutral">{caseKindLabel(item.kind)}</Badge>
          {kindCopy?.isM2 ? <Badge tone="action">M2</Badge> : null}
          {item.is_overdue ? <Badge tone="danger">Past our SLA</Badge> : null}
          {item.holds_payout ? <Badge tone="warning">Holding payout</Badge> : null}
        </div>

        <h2 className="mt-3 text-lg font-bold text-text">{item.summary}</h2>
        {kindCopy ? (
          <p className="mt-1 text-sm leading-6 text-text-secondary">{kindCopy.claim}</p>
        ) : (
          <p className="mt-1 text-sm leading-6 text-warning-text">
            A case kind this build has no copy for ({item.kind}). Everything else on this screen is
            the server&rsquo;s and is safe to act on; only the explanatory sentence is missing.
          </p>
        )}

        <SubjectRow item={item} />

        <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Our SLA
            </dt>
            <dd className="m-0 text-sm text-text">
              {formatMoment(item.due_at)}{" "}
              <span className="text-text-secondary">
                ({describeRelative(item.due_at, item.server_now)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              The parties answer by
            </dt>
            <dd className="m-0 text-sm text-text">
              {item.response_due_at === null ? (
                <span className="text-text-secondary">
                  No window configured — nobody is being timed out
                </span>
              ) : (
                <>
                  {formatMoment(item.response_due_at)}{" "}
                  <span className="text-text-secondary">
                    ({describeRelative(item.response_due_at, item.server_now)})
                  </span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Owning team
            </dt>
            <dd className="m-0 text-sm text-text">{teamLabel(item.owner_team)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Claimed by
            </dt>
            <dd className="m-0 text-sm text-text">
              {item.owner_id === null ? (
                <span className="text-text-secondary">Nobody yet</span>
              ) : (
                `Operator ${maskId(item.owner_id)}`
              )}
            </dd>
          </div>
        </dl>

        {item.detail ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text">{item.detail}</p>
        ) : null}

        {closed ? (
          <p className="mt-4 rounded-control bg-surface-sunken p-4 text-sm text-text-secondary">
            Closed {item.resolved_at ? formatMoment(item.resolved_at) : ""} as{" "}
            <strong>{resolutionLabel(item.resolution || "—")}</strong>
            {item.resolution_note ? ` — ${item.resolution_note}` : ""}
          </p>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            {item.owner_id === null ? (
              <Button
                loading={claim.isPending}
                loadingLabel="Claiming"
                onClick={() =>
                  claim.mutate({ caseId: item.id, expectedVersion: item.version })
                }
              >
                Claim this case
              </Button>
            ) : null}
            <EscalatePanel item={item} />
          </div>
        )}

        <CancellationConflictPanel item={item} />
        <PayoutHoldPanel item={item} />

        <CaseCommands item={item} />
      </Card>

      <CaseEvidencePanel evidence={item.evidence} />
      <CaseEventTrail events={item.events} />
      <NotesPanel item={item} />
    </div>
  );
}
