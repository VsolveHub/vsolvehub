"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Skeleton,
  Textarea,
} from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { isStepUpRequired, type StepUpSession } from "@/features/finance/queries";
import { StepUpGate } from "@/features/finance/view/step-up-gate";

import {
  usePrivacyRequestCommand,
  usePrivacyRequestQueue,
  type PrivacyRequestRow,
  type QueueState,
} from "../queries";

/**
 * Account deletions and data-copy requests, the queue Operations works.
 *
 * Deletions run themselves: the account closes when the person asks, and Django erases it
 * hourly once its date passes. This screen is for the exceptions: a request held because money
 * is owed or work is open (the hold says what), a hold Operations places for a dispute or a
 * legal request, a person who calls to keep their account, and "erase now". Holds are Django's
 * answer on each read, never worked out here.
 */

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

const STATUS: Record<PrivacyRequestRow["status"], { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  RECEIVED: { label: "Scheduled", tone: "info" },
  IN_REVIEW: { label: "On hold", tone: "warning" },
  COMPLETED: { label: "Done", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

type TextCommand = "hold" | "cancel" | "reject" | "complete";

const TEXT_COMMAND: Record<
  TextCommand,
  { title: string; description: string; label: string; confirm: string; danger: boolean }
> = {
  hold: {
    title: "Put this deletion on hold?",
    description:
      "The account stays closed but is not erased until you release it. Use this for a dispute, a legal request or anything still being looked into.",
    label: "Why",
    confirm: "Put on hold",
    danger: false,
  },
  cancel: {
    title: "Keep this account?",
    description:
      "For someone who asked support to keep their account. The deletion is cancelled; they sign in as usual.",
    label: "How they asked",
    confirm: "Cancel the deletion",
    danger: false,
  },
  reject: {
    title: "Reject this request?",
    description: "It is closed without being carried out. Say why, in words you can tell the person.",
    label: "Reason",
    confirm: "Reject",
    danger: true,
  },
  complete: {
    title: "Mark the data copy as sent?",
    description: "Record how the copy reached the person.",
    label: "How it was sent",
    confirm: "Mark as sent",
    danger: false,
  },
};

function TextCommandDialog({
  row,
  command,
  onClose,
}: {
  row: PrivacyRequestRow;
  command: TextCommand;
  onClose: () => void;
}) {
  const mutation = usePrivacyRequestCommand(command);
  const [text, setText] = useState("");
  const copy = TEXT_COMMAND[command];

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose();
      }}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Go back
          </Button>
          <Button
            variant={copy.danger ? "danger" : "primary"}
            disabled={!text.trim()}
            loading={mutation.isPending}
            loadingLabel="Saving"
            onClick={() => mutation.mutate({ id: row.id, text: text.trim() }, { onSuccess: onClose })}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      <Field label={copy.label} description="Kept in the request's history." required>
        <Textarea rows={3} value={text} maxLength={480} onChange={(event) => setText(event.target.value)} />
      </Field>
      {mutation.error ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {friendlyErrorMessage(mutation.error)}
        </p>
      ) : null}
    </Dialog>
  );
}

function EraseNowDialog({
  row,
  onClose,
  onStepUpRequired,
}: {
  row: PrivacyRequestRow;
  onClose: () => void;
  onStepUpRequired: (reason: string) => void;
}) {
  const erase = usePrivacyRequestCommand("erase");

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !erase.isPending) onClose();
      }}
      title="Erase this account now?"
      description="This cannot be undone. Their name, number, photo, documents, bank details and addresses are removed now. Bookings, payments and payouts stay, without their name."
      footer={
        <>
          <Button variant="outline" disabled={erase.isPending} onClick={onClose}>
            Go back
          </Button>
          <Button
            variant="danger"
            loading={erase.isPending}
            loadingLabel="Erasing"
            onClick={() =>
              erase.mutate(
                { id: row.id },
                {
                  onSuccess: onClose,
                  onError: (error) => {
                    if (isStepUpRequired(error)) {
                      onClose();
                      onStepUpRequired("Erasing an account needs a fresh confirmation.");
                    }
                  },
                },
              )
            }
          >
            Erase now
          </Button>
        </>
      }
    >
      {erase.error && !isStepUpRequired(erase.error) ? (
        <p role="alert" className="text-sm text-danger-text">
          {friendlyErrorMessage(erase.error)}
        </p>
      ) : null}
    </Dialog>
  );
}

function ReleaseButton({ row }: { row: PrivacyRequestRow }) {
  const release = usePrivacyRequestCommand("release");
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        loading={release.isPending}
        loadingLabel="Releasing"
        onClick={() => release.mutate({ id: row.id })}
      >
        Release
      </Button>
      {release.error ? (
        <span role="alert" className="text-xs text-danger-text">
          {friendlyErrorMessage(release.error)}
        </span>
      ) : null}
    </>
  );
}

function RequestCard({
  row,
  onStepUpRequired,
}: {
  row: PrivacyRequestRow;
  onStepUpRequired: (reason: string) => void;
}) {
  const [dialog, setDialog] = useState<TextCommand | "erase" | null>(null);
  const isOpen = row.status === "RECEIVED" || row.status === "IN_REVIEW";
  const isErasure = row.kind === "ERASURE";
  const status = STATUS[row.status];
  const dueNow =
    row.status === "RECEIVED" && row.scheduled_for !== null && new Date(row.scheduled_for) <= new Date();

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-navy-900">
            {row.person.name || "No name on record"}
          </h3>
          <p className="mt-0.5 text-sm text-text-secondary">
            {row.person.phone_number}
            {row.person.roles.length ? ` · ${row.person.roles.join(", ")}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/operations/customers/${row.person.user_id}`}
              className="font-semibold text-action-text hover:underline"
            >
              Open account
            </Link>
            {row.person.partner_id ? (
              <Link
                href={`/operations/partners?partner=${row.person.partner_id}`}
                className="font-semibold text-action-text hover:underline"
              >
                Open partner
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{isErasure ? "Account deletion" : "Data copy"}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline text-text-secondary">Asked </dt>
          <dd className="inline font-semibold text-text">{WHEN.format(new Date(row.requested_at))}</dd>
        </div>
        {isErasure && isOpen && row.scheduled_for ? (
          <div>
            <dt className="inline text-text-secondary">{dueNow ? "Due " : "Deletes on "}</dt>
            <dd className="inline font-semibold text-text">
              {dueNow ? "now (next hourly run)" : WHEN.format(new Date(row.scheduled_for))}
            </dd>
          </div>
        ) : null}
        {row.completed_at ? (
          <div>
            <dt className="inline text-text-secondary">Closed </dt>
            <dd className="inline font-semibold text-text">{WHEN.format(new Date(row.completed_at))}</dd>
          </div>
        ) : null}
        {row.cancelled_at ? (
          <div>
            <dt className="inline text-text-secondary">Cancelled </dt>
            <dd className="inline font-semibold text-text">{WHEN.format(new Date(row.cancelled_at))}</dd>
          </div>
        ) : null}
        {row.handled_by_name ? (
          <div>
            <dt className="inline text-text-secondary">Last decided by </dt>
            <dd className="inline font-semibold text-text">{row.handled_by_name}</dd>
          </div>
        ) : null}
      </dl>

      {row.notes ? (
        <p className="mt-3 rounded-control bg-surface-sunken p-3 text-sm text-text-secondary">{row.notes}</p>
      ) : null}

      {isErasure && isOpen ? (
        row.holds.length ? (
          <div className="mt-3 rounded-control border border-warning-line bg-warning-surface p-3">
            <p className="text-sm font-semibold text-warning-text">Settle these before the account can go</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-warning-text">
              {row.holds.map((hold) => (
                <li key={hold.kind}>{hold.detail}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            Nothing stands in the way.
            {row.status === "IN_REVIEW" && !row.held_by_operations
              ? " The next hourly run erases it."
              : ""}
          </p>
        )
      ) : null}

      {isOpen ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {isErasure ? (
            <>
              {row.status === "RECEIVED" ? (
                <Button size="sm" variant="outline" onClick={() => setDialog("hold")}>
                  Put on hold
                </Button>
              ) : (
                <ReleaseButton row={row} />
              )}
              <Button size="sm" variant="outline" onClick={() => setDialog("cancel")}>
                Keep the account
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={row.holds.length > 0}
                onClick={() => setDialog("erase")}
              >
                Erase now
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={() => setDialog("complete")}>
                Mark as sent
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog("reject")}>
                Reject
              </Button>
            </>
          )}
        </div>
      ) : null}

      {dialog === "erase" ? (
        <EraseNowDialog row={row} onClose={() => setDialog(null)} onStepUpRequired={onStepUpRequired} />
      ) : dialog ? (
        <TextCommandDialog row={row} command={dialog} onClose={() => setDialog(null)} />
      ) : null}
    </Card>
  );
}

export function PrivacyRequestsWorkspace() {
  const [state, setState] = useState<QueueState>("open");
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [stepUpReason, setStepUpReason] = useState<string | null>(null);
  const queue = usePrivacyRequestQueue(state);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label="Which requests">
        <Button
          size="sm"
          variant={state === "open" ? "primary" : "outline"}
          aria-pressed={state === "open"}
          onClick={() => setState("open")}
        >
          Open
        </Button>
        <Button
          size="sm"
          variant={state === "closed" ? "primary" : "outline"}
          aria-pressed={state === "closed"}
          onClick={() => setState("closed")}
        >
          Closed
        </Button>
      </div>

      {stepUpReason ? (
        <StepUpGate
          session={session}
          reason={stepUpReason}
          onSteppedUp={(stepped) => {
            setSession(stepped);
            setStepUpReason(null);
          }}
        />
      ) : null}

      {queue.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : queue.isError ? (
        <ErrorState
          title="We could not load the requests"
          message={friendlyErrorMessage(queue.error)}
          actionLabel="Try again"
          onAction={() => void queue.refetch()}
        />
      ) : queue.data.length === 0 ? (
        <EmptyState
          title={state === "open" ? "No requests waiting" : "No closed requests yet"}
          description={
            state === "open"
              ? "Deletions people ask for appear here with the date they go. Most need nothing from you."
              : "Requests that were carried out, cancelled or rejected appear here."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {queue.data.map((row) => (
            <RequestCard key={row.id} row={row} onStepUpRequired={setStepUpReason} />
          ))}
        </div>
      )}
    </div>
  );
}
