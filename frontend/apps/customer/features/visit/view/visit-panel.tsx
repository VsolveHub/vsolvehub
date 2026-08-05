"use client";

import { Badge, Button, Card, ErrorState, Readout, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import {
  canCancel,
  canRequestStartOtp,
  canRespondToCompletion,
  useConfirmCompletion,
  useDisputeCompletion,
  useRequestStartOtp,
  useVisit,
  type Visit,
} from "../queries";
import { VISIT_STATUS_DESCRIPTIONS, VisitStatusBadge } from "./visit-status";

/**
 * One visit, with only the actions the server currently allows.
 *
 * ## The start code is shown, never sent
 *
 * `POST /bookings/{id}/start-otp/` returns the code's *length*, not the code —
 * the customer reads the real one off their own SMS. This panel therefore shows
 * a prompt and a resend, and has nothing to display in the code's place. That
 * asymmetry is the mechanism working: if this screen could show the code, the
 * OTP would prove only that someone reached this screen, not that a professional
 * is standing at the door.
 *
 * ## Confirm and Report sit side by side
 *
 * A completion report offers exactly two answers and neither is the default.
 * Making Confirm the prominent one and Report a quiet link would be the platform
 * nudging a customer past a problem it has an interest in not hearing about.
 *
 * ## Nothing here claims an outcome before the server does
 *
 * Every mutation re-reads. An ambiguous failure leaves the panel showing what
 * Django last said plus an honest error, never an optimistic transition.
 */

function VisitTasks({ visit }: { visit: Visit }) {
  if (visit.work_tasks.length === 0) return null;

  return (
    <section aria-labelledby="visit-tasks" className="mt-6">
      <h3 id="visit-tasks" className="text-sm font-semibold text-text">
        What was booked
      </h3>
      <ul className="mt-2 list-none space-y-2">
        {visit.work_tasks.map((task) => (
          <li key={task.id} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-text-secondary">
              {task.label}
              {task.quantity > 1 ? ` × ${task.quantity}` : ""}
              {task.kind === "AMENDMENT" ? (
                <Badge tone="action" className="ml-2">
                  Added
                </Badge>
              ) : null}
            </span>
            <span data-numeric className="shrink-0 text-text">
              {formatMoney(task.amount_paise)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StartCodePrompt({ visit }: { visit: Visit }) {
  const requestOtp = useRequestStartOtp();
  const [requested, setRequested] = useState(false);

  return (
    <section aria-labelledby="visit-start-code" className="mt-6 rounded-control bg-surface-sunken p-4">
      <h3 id="visit-start-code" className="text-sm font-semibold text-text">
        Your start code
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        We will text you a {requestOtp.data?.code_length ?? 4}-digit code. Read it out to your
        professional so they can start — it is how we confirm the right person is at your door.
      </p>
      {requestOtp.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not send the code"
          message="Nothing has changed. Try again in a moment."
        />
      ) : null}
      <Button
        className="mt-3"
        variant={requested ? "outline" : "primary"}
        loading={requestOtp.isPending}
        loadingLabel="Sending"
        onClick={() =>
          requestOtp.mutate(
            { bookingId: visit.id, expectedVersion: visit.version },
            { onSuccess: () => setRequested(true) },
          )
        }
      >
        {requested ? "Send again" : "Send my start code"}
      </Button>
    </section>
  );
}

function CompletionDecision({ visit }: { visit: Visit }) {
  const confirm = useConfirmCompletion();
  const dispute = useDisputeCompletion();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = confirm.isPending || dispute.isPending;

  return (
    <section aria-labelledby="visit-completion" className="mt-6 rounded-control border border-line p-4">
      <h3 id="visit-completion" className="text-sm font-semibold text-text">
        Your professional says the work is done
      </h3>
      {visit.completion?.notes ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{visit.completion.notes}</p>
      ) : null}

      {confirm.isError || dispute.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not record that"
          message="Nothing has changed. We have re-checked the visit — try again."
        />
      ) : null}

      {reporting ? (
        <div className="mt-3">
          <label htmlFor="dispute-reason" className="text-sm font-semibold text-text">
            What is wrong?
          </label>
          <textarea
            id="dispute-reason"
            className="mt-1 min-h-24 w-full rounded-control border border-line bg-surface p-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={240}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              disabled={reason.trim().length === 0 || busy}
              loading={dispute.isPending}
              loadingLabel="Sending"
              onClick={() =>
                dispute.mutate({
                  bookingId: visit.id,
                  expectedVersion: visit.version,
                  disputeReason: reason.trim(),
                })
              }
            >
              Send report
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setReporting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        // Equal weight on purpose. A quiet "report a problem" link beside a
        // prominent Confirm is a nudge past a problem, not a choice.
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            loading={confirm.isPending}
            loadingLabel="Confirming"
            disabled={busy}
            onClick={() =>
              confirm.mutate({ bookingId: visit.id, expectedVersion: visit.version })
            }
          >
            Confirm it is done
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setReporting(true)}>
            Report a problem
          </Button>
        </div>
      )}
    </section>
  );
}

export function VisitPanel({ bookingId }: { bookingId: string }) {
  const visit = useVisit(bookingId);

  if (visit.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this visit…
      </Card>
    );
  }

  if (visit.isError || !visit.data) {
    return (
      <ErrorState
        title="We could not load this visit"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void visit.refetch()}
      />
    );
  }

  const data = visit.data;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <VisitStatusBadge status={data.status} />
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {VISIT_STATUS_DESCRIPTIONS[data.status]}
          </p>
        </div>
        <Readout label="Professional" value={data.partner_display_name} />
      </div>

      <VisitTasks visit={data} />
      {canRequestStartOtp(data) ? <StartCodePrompt visit={data} /> : null}
      {canRespondToCompletion(data) ? <CompletionDecision visit={data} /> : null}

      {canCancel(data) ? (
        <p className="mt-6 text-sm text-text-secondary">
          Need to change this visit? Cancellation and rescheduling are on the booking below.
        </p>
      ) : null}
    </Card>
  );
}
