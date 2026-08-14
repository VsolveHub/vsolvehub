"use client";

import { Button, ConfirmAction, ErrorState, Field, Input, Select } from "@vsolve/ui";
import { useState, type ReactNode } from "react";

import { useEscalateCase, useResolveCase } from "@/features/cases/queries";
import {
  isPolicyUnavailable,
  isTransitionNotAllowed,
  isVersionConflict,
  useDecideCaseAppeal,
  useOverrideCaseOutcome,
  useSetCaseResponseDeadline,
  type CaseAppealOutcome,
} from "../queries";
import {
  appealPhase,
  formatMoment,
  heldEntryCount,
  isCaseClosed,
  resolutionLabel,
  resolutionMeaning,
  type OperationsCase,
} from "../model/cases";

/**
 * Every action on this screen states its consequence before it happens (`M2-FE-707`).
 *
 * ## Why the consequence is written out rather than implied
 *
 * These commands move a payout hold, reopen a decision, or start a clock a party is measured
 * against. The person pressing the button knows what they meant; the sentence exists for the
 * person who did not, and for the one reading the audit trail a month later asking what was on
 * screen at the time. `ConfirmAction` requires the `consequence` prop for that reason, and every
 * one of these fills it with what actually changes — including the halves that are unwelcome.
 *
 * ## Nothing here decides what a case may become
 *
 * `allowed_resolutions` comes down per case and is rendered as-is, on resolve and on override
 * alike. There is no map from kind to resolutions in this feature. An override is permission to
 * reach a **different documented outcome**, never an undocumented one, and the server checks it
 * against the same list — so offering a free-text outcome here would offer a resolution the
 * server refuses.
 *
 * ## Refusals are named, not retried
 *
 * `m2_policy_unavailable` on an appeal means the owner has not set the appeal window. It is not a
 * transient failure and a "Try again" button would be a lie about what fixes it.
 */

function CommandError({ error, whatFailed }: { error: unknown; whatFailed: string }): ReactNode {
  if (!error) return null;

  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        inline
        className="mt-3"
        severity="warning"
        title="The window this needs has not been set"
        message="The owner has not configured the window this command measures against, so it fails closed rather than guessing one. Nothing has changed. This is not a retry — it needs a configuration decision."
      />
    );
  }
  if (isVersionConflict(error)) {
    return (
      <ErrorState
        inline
        className="mt-3"
        title="This case moved while you were reading it"
        message="Nothing has changed. We have re-read the case — check what happened before acting again."
      />
    );
  }
  if (isTransitionNotAllowed(error)) {
    return (
      <ErrorState
        inline
        className="mt-3"
        title={whatFailed}
        message="The case is not in a state that allows this, or a required reason is missing. Nothing has changed."
      />
    );
  }
  return (
    <ErrorState
      inline
      className="mt-3"
      title={whatFailed}
      message="Nothing has changed. Try again, and check the case history before repeating it."
    />
  );
}

function Panel({
  id,
  heading,
  description,
  children,
}: {
  id: string;
  heading: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-control border border-line p-4">
      <h3 id={id} className="text-sm font-semibold text-text">
        {heading}
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Close the case
   --------------------------------------------------------------------------- */

function ResolvePanel({ item }: { item: OperationsCase }) {
  const resolve = useResolveCase();
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const held = heldEntryCount(item.held_ledger_entry_ids);
  const ready = resolution !== "" && note.trim() !== "";

  return (
    <Panel
      id="resolve-case"
      heading="Close this case"
      description="Name what actually happened. A case does not close because somebody was contacted."
    >
      <CommandError error={resolve.error} whatFailed="We could not close this case" />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label="Outcome"
          description="Straight from the server. This console carries no copy of which outcomes this kind allows."
        >
          <Select value={resolution} onChange={(event) => setResolution(event.target.value)}>
            <option value="">Choose an outcome…</option>
            {item.allowed_resolutions.map((value) => (
              <option key={value} value={value}>
                {resolutionLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What happened" description="Recorded on the case and readable in the audit trail.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>

      {resolution !== "" && resolutionMeaning(resolution) ? (
        <p className="mt-2 text-sm text-text-secondary">{resolutionMeaning(resolution)}</p>
      ) : null}

      <Button className="mt-3" disabled={!ready} onClick={() => setConfirming(true)}>
        Close case
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Close this case"
        confirmLabel="Close it"
        pending={resolve.isPending}
        consequence={
          <>
            <p>
              This records <strong>{resolutionLabel(resolution)}</strong> as what happened, and the
              case stops being open work.
            </p>
            {item.holds_payout ? (
              <p className="mt-2">
                It also <strong>releases the payout hold</strong> this case is carrying
                {held === null || held === 0
                  ? ""
                  : ` on ${held} ledger ${held === 1 ? "entry" : "entries"}`}
                . Any frozen vendor earnings become payable.
              </p>
            ) : null}
            <p className="mt-2">
              A party may appeal it. If an appeal is overturned the case reopens and the hold comes
              back — but the money released in the meantime will already have moved.
            </p>
          </>
        }
        onConfirm={() =>
          resolve.mutate(
            {
              caseId: item.id,
              expectedVersion: item.version,
              resolution,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(false);
                setNote("");
                setResolution("");
              },
            },
          )
        }
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   The parties' clock
   --------------------------------------------------------------------------- */

function ResponseDeadlinePanel({ item }: { item: OperationsCase }) {
  const setDeadline = useSetCaseResponseDeadline();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const chosen = value === "" ? null : new Date(value);
  const isFuture = chosen !== null && chosen.getTime() > new Date(item.server_now).getTime();
  const isLater =
    chosen !== null &&
    (item.response_due_at === null ||
      chosen.getTime() > new Date(item.response_due_at).getTime());
  const ready = chosen !== null && isFuture && isLater && reason.trim() !== "";

  return (
    <Panel
      id="response-deadline"
      heading="The deadline the parties answer by"
      description="Distinct from the SLA above, which is the clock Operations is measured on. This one is the window a Customer or a vendor has to respond before silence counts as an answer."
    >
      <CommandError error={setDeadline.error} whatFailed="We could not move this deadline" />

      <p className="mt-2 text-sm text-text-secondary">
        {item.response_due_at === null
          ? "No response deadline is set. The variant configured no window, so nobody is being timed out against a clock nobody set."
          : `Currently ${formatMoment(item.response_due_at)}.`}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label="New deadline"
          description="Forward only. A deadline moved backwards would time somebody out of a window they were still inside, so the server refuses it rather than clamping it."
          error={
            chosen !== null && !isFuture
              ? "That is in the past on the server's clock."
              : chosen !== null && !isLater
                ? "That is not later than the deadline already set."
                : undefined
          }
        >
          <Input
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <Field label="Why" description="Required. Recorded on the case as a DEADLINE_SET event.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>

      <Button className="mt-3" variant="outline" disabled={!ready} onClick={() => setConfirming(true)}>
        Move the deadline
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Move the parties' response deadline"
        confirmLabel="Move it"
        pending={setDeadline.isPending}
        consequence={
          <>
            <p>
              The Customer and the vendor get until{" "}
              <strong>{chosen === null ? "—" : formatMoment(chosen.toISOString())}</strong> to
              answer this case.
            </p>
            <p className="mt-2">
              It cannot be moved back afterwards. Everything downstream that waits on this window —
              a lapse, an escalation, an automatic finding — waits the longer time.
            </p>
          </>
        }
        onConfirm={() => {
          if (chosen === null) return;
          setDeadline.mutate(
            {
              caseId: item.id,
              expectedVersion: item.version,
              responseDueAt: chosen.toISOString(),
              reason: reason.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(false);
                setValue("");
                setReason("");
              },
            },
          );
        }}
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Appeal
   --------------------------------------------------------------------------- */

function AppealPanel({ item }: { item: OperationsCase }) {
  const decide = useDecideCaseAppeal();
  const [outcome, setOutcome] = useState<CaseAppealOutcome | "">("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const phase = appealPhase(item);
  if (phase === "NONE") return null;

  if (phase === "DECIDED") {
    return (
      <Panel
        id="appeal"
        heading="Appeal"
        description="This case was appealed and the appeal has been decided."
      >
        <p className="mt-2 text-sm text-text">
          Raised {item.appeal_requested_at ? formatMoment(item.appeal_requested_at) : "—"}, decided{" "}
          {item.appeal_decided_at ? formatMoment(item.appeal_decided_at) : "—"} as{" "}
          <strong>{resolutionLabel(item.appeal_outcome || "—")}</strong>.
        </p>
        {item.appeal_reason ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
            {item.appeal_reason}
          </p>
        ) : null}
      </Panel>
    );
  }

  const ready = outcome !== "" && note.trim() !== "";

  return (
    <Panel
      id="appeal"
      heading="An appeal is waiting on a decision"
      description="A party asked for this case to be looked at again. Read what they said before deciding — the appeal is a second decision, not a re-run of the first."
    >
      <CommandError error={decide.error} whatFailed="We could not decide this appeal" />

      <p className="mt-2 text-sm text-text-secondary">
        Raised {item.appeal_requested_at ? formatMoment(item.appeal_requested_at) : "—"}.
      </p>
      {item.appeal_reason ? (
        <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm leading-6 text-text">
          {item.appeal_reason}
        </blockquote>
      ) : (
        <p className="mt-2 text-sm italic text-text-secondary">
          The appeal carries no reason text.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Decision">
          <Select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as CaseAppealOutcome | "")}
          >
            <option value="">Choose…</option>
            <option value="UPHELD">Uphold the original outcome</option>
            <option value="OVERTURNED">Overturn it and reopen the case</option>
          </Select>
        </Field>
        <Field label="Why" description="Required. Both parties are entitled to a reason.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>

      <Button className="mt-3" disabled={!ready} onClick={() => setConfirming(true)}>
        Record the decision
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={outcome === "OVERTURNED" ? "Overturn and reopen" : "Uphold the outcome"}
        confirmLabel={outcome === "OVERTURNED" ? "Overturn it" : "Uphold it"}
        destructive={outcome === "OVERTURNED"}
        pending={decide.isPending}
        consequence={
          outcome === "OVERTURNED" ? (
            <>
              <p>
                The case <strong>reopens to in-progress</strong> and its resolution is cleared. It
                does not get a new outcome from this — somebody has to work it again and decide.
              </p>
              <p className="mt-2">
                The <strong>payout hold comes back</strong>, because the reason the money was
                released — this case being finished — has just stopped being true.
              </p>
            </>
          ) : (
            <p>
              The original outcome stands and the case stays closed. This is the party&rsquo;s one
              appeal; there is not another.
            </p>
          )
        }
        onConfirm={() => {
          if (outcome === "") return;
          decide.mutate(
            {
              caseId: item.id,
              expectedVersion: item.version,
              outcome,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(false);
                setOutcome("");
                setNote("");
              },
            },
          );
        }}
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Override
   --------------------------------------------------------------------------- */

function OverridePanel({ item }: { item: OperationsCase }) {
  const override = useOverrideCaseOutcome();
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const ready = resolution !== "" && resolution !== item.resolution && note.trim() !== "";

  return (
    <Panel
      id="override"
      heading="Override the outcome by hand"
      description="For when the recorded outcome is wrong and the appeal route is not the right one. The audit is the whole of the control: the previous result stays in the trail, so it reads “we said this, then we said that, and here is who and why”."
    >
      <CommandError error={override.error} whatFailed="We could not override this outcome" />

      <p className="mt-2 text-sm text-text-secondary">
        Currently closed as <strong>{resolutionLabel(item.resolution || "—")}</strong>
        {item.resolution_note ? ` — ${item.resolution_note}` : ""}.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label="New outcome"
          description="Still checked against this kind's allowed outcomes. An override reaches a different documented outcome, never an undocumented one."
        >
          <Select value={resolution} onChange={(event) => setResolution(event.target.value)}>
            <option value="">Choose an outcome…</option>
            {item.allowed_resolutions
              .filter((value) => value !== item.resolution)
              .map((value) => (
                <option key={value} value={value}>
                  {resolutionLabel(value)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Why" description="Required, and permanent.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>

      <Button
        className="mt-3"
        variant="outline"
        disabled={!ready}
        onClick={() => setConfirming(true)}
      >
        Override the outcome
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Override this case's outcome"
        confirmLabel="Override it"
        destructive
        confirmPhrase="override"
        pending={override.isPending}
        consequence={
          <>
            <p>
              The recorded outcome changes from{" "}
              <strong>{resolutionLabel(item.resolution || "—")}</strong> to{" "}
              <strong>{resolutionLabel(resolution)}</strong>, under your name, permanently.
            </p>
            <p className="mt-2">
              Both results stay visible in the history. Money already moved on the first outcome
              does not move back on its own — if it needs to, that is a separate decision through
              the product that owns it.
            </p>
          </>
        }
        onConfirm={() =>
          override.mutate(
            {
              caseId: item.id,
              expectedVersion: item.version,
              resolution,
              note: note.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(false);
                setResolution("");
                setNote("");
              },
            },
          )
        }
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Escalate
   --------------------------------------------------------------------------- */

function EscalatePanel({ item }: { item: OperationsCase }) {
  const escalate = useEscalateCase();
  const [confirming, setConfirming] = useState(false);

  if (item.severity === "URGENT") return null;

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)}>
        Escalate to urgent
      </Button>
      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Escalate this case to urgent"
        confirmLabel="Escalate it"
        pending={escalate.isPending}
        consequence={
          <p>
            The SLA deadline Operations is measured on tightens to the urgent window, and this case
            moves to the top of its team&rsquo;s queue ahead of everything else waiting there.
          </p>
        }
        onConfirm={() =>
          escalate.mutate(
            { caseId: item.id, expectedVersion: item.version, severity: "URGENT" },
            { onSuccess: () => setConfirming(false) },
          )
        }
      />
    </>
  );
}

/* ---------------------------------------------------------------------------
   Composition
   --------------------------------------------------------------------------- */

export function CaseCommands({ item }: { item: OperationsCase }) {
  const closed = isCaseClosed(item);
  const notes = <AppealPanel item={item} />;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {notes}
      {closed ? <OverridePanel item={item} /> : null}
      {!closed ? <ResponseDeadlinePanel item={item} /> : null}
      {!closed ? <ResolvePanel item={item} /> : null}
    </div>
  );
}

export { EscalatePanel };
