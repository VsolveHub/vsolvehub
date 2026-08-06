"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import {
  canAbort,
  canArrive,
  canGoEnRoute,
  canRelease,
  canReportCompletion,
  canStartWork,
  useAbortWork,
  useMarkArrived,
  useMarkCustomerUnavailable,
  useMarkEnRoute,
  usePartnerVisit,
  useReleaseBooking,
  useSubmitCompletion,
  useVerifyStartOtp,
  type OutcomeInput,
  type PartnerVisit,
} from "../queries";
import { JobMoney } from "./job-money";

/**
 * The Partner's working surface for one visit.
 *
 * ## One action at a time, because that is what the machine allows
 *
 * `ALLOWED_TRANSITIONS` permits exactly one forward move from each state, so the
 * primary button is singular by construction rather than by layout choice. The
 * `can*` helpers pick which one; Django still refuses anything they get wrong.
 *
 * ## Release carries no consequence, because none exists
 *
 * M1 records a late release for manual Operations review and nothing else. No
 * score, no strike, no warning copy — inventing one here would be a product
 * decision made by a component, and a Partner who is genuinely unable to attend
 * should hand the job back early rather than be frightened into a no-show.
 *
 * ## The completion form makes every task explicit
 *
 * Django settles money from these outcomes: an unperformed line is refunded. A
 * form that let a task go unanswered would either refund work that happened or
 * pay for work that did not, so every task starts unset and must be answered.
 */

const OUTCOME_CHOICES: { value: OutcomeInput["outcome"]; label: string }[] = [
  { value: "COMPLETED", label: "Done" },
  { value: "PARTIAL", label: "Partly done" },
  { value: "NOT_STARTED", label: "Not started" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

function StartWorkForm({ visit }: { visit: PartnerVisit }) {
  const verify = useVerifyStartOtp();
  const [code, setCode] = useState("");

  return (
    <section aria-labelledby="start-work" className="mt-6 rounded-control bg-surface-sunken p-4">
      <h3 id="start-work" className="text-sm font-semibold text-text">
        Start code
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Ask the customer to read out the code we texted them. Typing it in starts the job.
      </p>
      {verify.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="That code did not work"
          message="Check the digits with the customer and try again. They can ask us to resend it."
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Code" className="max-w-32">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Button
          disabled={code.length === 0 || verify.isPending}
          loading={verify.isPending}
          loadingLabel="Checking"
          onClick={() =>
            verify.mutate({ bookingId: visit.id, expectedVersion: visit.version, code })
          }
        >
          Start work
        </Button>
      </div>
    </section>
  );
}

function CompletionForm({ visit }: { visit: PartnerVisit }) {
  const submit = useSubmitCompletion();
  const [outcomes, setOutcomes] = useState<Record<string, OutcomeInput["outcome"] | undefined>>({});
  const [notes, setNotes] = useState("");
  const [safety, setSafety] = useState(false);

  const unanswered = visit.work_tasks.filter((task) => !outcomes[task.id]);
  const ready = unanswered.length === 0 && visit.work_tasks.length > 0;

  return (
    <section aria-labelledby="report-work" className="mt-6 rounded-control border border-line p-4">
      <h3 id="report-work" className="text-sm font-semibold text-text">
        Report what was done
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Answer for every task. What you report here decides what the customer is charged.
      </p>

      <ul className="mt-3 list-none space-y-3">
        {visit.work_tasks.map((task) => (
          <li key={task.id}>
            <fieldset>
              <legend className="text-sm font-semibold text-text">
                {task.label}
                {task.quantity > 1 ? ` × ${task.quantity}` : ""}
              </legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {OUTCOME_CHOICES.map((choice) => (
                  <Button
                    key={choice.value}
                    size="sm"
                    variant={outcomes[task.id] === choice.value ? "primary" : "outline"}
                    aria-pressed={outcomes[task.id] === choice.value}
                    onClick={() =>
                      setOutcomes((current) => ({ ...current, [task.id]: choice.value }))
                    }
                  >
                    {choice.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>

      <label htmlFor="completion-notes" className="mt-4 block text-sm font-semibold text-text">
        Notes for the customer
      </label>
      <textarea
        id="completion-notes"
        className="mt-1 min-h-20 w-full rounded-control border border-line bg-surface p-2 text-sm"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={1000}
      />

      <label className="mt-3 flex items-start gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={safety}
          onChange={(event) => setSafety(event.target.checked)}
          className="mt-1"
        />
        There was a safety issue or damage at this site
      </label>

      {submit.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not send your report"
          message="Nothing has been recorded. We have re-checked the job — try again."
        />
      ) : null}

      {!ready && visit.work_tasks.length > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          {unanswered.length} task{unanswered.length === 1 ? "" : "s"} still to answer.
        </p>
      ) : null}

      <Button
        className="mt-3"
        disabled={!ready || submit.isPending}
        loading={submit.isPending}
        loadingLabel="Sending"
        onClick={() =>
          submit.mutate({
            bookingId: visit.id,
            expectedVersion: visit.version,
            notes,
            safetyDamageDeclared: safety,
            outcomes: visit.work_tasks.map((task) => ({
              work_task_id: task.id,
              // Guarded by `ready`, so every task has an answer by here.
              outcome: outcomes[task.id]!,
              quantity: task.quantity,
              reason: "",
            })),
          })
        }
      >
        Send report
      </Button>
    </section>
  );
}

function ReasonedAction({
  label,
  heading,
  prompt,
  pending,
  onSubmit,
}: {
  label: string;
  heading: string;
  prompt: string;
  pending: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-control border border-line p-4">
      <h4 className="text-sm font-semibold text-text">{heading}</h4>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{prompt}</p>
      <textarea
        aria-label={heading}
        className="mt-2 min-h-20 w-full rounded-control border border-line bg-surface p-2 text-sm"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={240}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          disabled={reason.trim().length === 0 || pending}
          loading={pending}
          loadingLabel="Sending"
          onClick={() => onSubmit(reason.trim())}
        >
          {label}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Back
        </Button>
      </div>
    </div>
  );
}

export function WorkPanel({ bookingId }: { bookingId: string }) {
  const visit = usePartnerVisit(bookingId);
  const enRoute = useMarkEnRoute();
  const arrived = useMarkArrived();
  const unavailable = useMarkCustomerUnavailable();
  const abort = useAbortWork();
  const release = useReleaseBooking();

  if (visit.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this job…
      </Card>
    );
  }

  if (visit.isError || !visit.data) {
    return (
      <ErrorState
        title="We could not load this job"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void visit.refetch()}
      />
    );
  }

  const data = visit.data;
  const versioned = { bookingId: data.id, expectedVersion: data.version };
  const gross = data.work_tasks.reduce((total, task) => total + task.amount_paise, 0);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Badge tone="info">{data.status.replaceAll("_", " ").toLowerCase()}</Badge>
        <span data-numeric className="text-sm text-text-secondary">
          {formatMoney(gross)} of work
        </span>
      </div>

      {/* The task list used to be a bare bulleted list with no amounts. What a
          job is worth is the thing a Partner most wants from this screen, and
          the projection already carried the per-task figures. */}
      <div className="mt-4">
        <JobMoney job={data} />
      </div>

      {canStartWork(data) ? <StartWorkForm visit={data} /> : null}
      {canReportCompletion(data) ? <CompletionForm visit={data} /> : null}

      <div className="mt-6 flex flex-wrap items-start gap-3">
        {canGoEnRoute(data) ? (
          <Button
            loading={enRoute.isPending}
            loadingLabel="Updating"
            onClick={() => enRoute.mutate(versioned)}
          >
            I am on my way
          </Button>
        ) : null}

        {canArrive(data) ? (
          <Button
            loading={arrived.isPending}
            loadingLabel="Updating"
            onClick={() => arrived.mutate(versioned)}
          >
            I have arrived
          </Button>
        ) : null}

        {data.status === "ARRIVED" && data.customer_unavailable_wait_started_at === null ? (
          <Button
            variant="outline"
            loading={unavailable.isPending}
            loadingLabel="Recording"
            onClick={() => unavailable.mutate(versioned)}
          >
            Customer is not here
          </Button>
        ) : null}

        {canAbort(data) ? (
          <ReasonedAction
            label="Stop this job"
            heading="Stop this job"
            prompt="Tell us what happened. Completed work is still settled — you will report it next."
            pending={abort.isPending}
            onSubmit={(reason) => abort.mutate({ ...versioned, reason })}
          />
        ) : null}

        {canRelease(data) ? (
          <ReasonedAction
            label="Hand this job back"
            heading="Hand this job back"
            prompt="Tell us why so we can find a replacement quickly. There is no penalty for handing a job back."
            pending={release.isPending}
            onSubmit={(reason) => release.mutate({ ...versioned, reason })}
          />
        ) : null}
      </div>
    </Card>
  );
}
