"use client";

import { queueRecoveryAction, searchQueues, queuesByUrgency, type StuckQueue } from "@vsolve/query";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { isUuid } from "@/features/shared/identifiers";

import { useStuckQueues } from "../queries";

/**
 * `M2-FE-701`: the stuck-state queues, and the way into one request.
 *
 * ## The queues are rendered, never re-derived
 *
 * Django computes all eight — depth, oldest member and the recovery that clears
 * them — and each is defined by a deadline that already exists on the record.
 * Nothing here invents a threshold, filters a list into a queue, or decides that
 * a request is stuck. A console that re-derived them would answer a different
 * question from the sweep that acts on them, and the two would disagree exactly
 * when it mattered.
 *
 * ## An empty `recovery_action` is a value, not a gap
 *
 * `inactive` engagements and `case_response_overdue` cases publish `""`, meaning
 * only a person can decide. Those rows show no button. Inferring one from the
 * queue's name is the failure `recovery_action` is published to prevent — the
 * same reason it is published on M1 Booking Groups.
 *
 * ## Why there is a box to type an id into
 *
 * The contract publishes queue **depths** and per-request reads, and nothing
 * that enumerates the requests inside a queue. So this screen says how deep each
 * queue is and how old its oldest member is, and takes a requirement id to open
 * one — the same honesty the manual-offer and assisted-checkout screens already
 * practise. It does not offer a search backed by nothing.
 */

const RECOVERY_LABELS: Record<string, string> = {
  rematch: "Rematch",
  close_expired: "Close as expired",
  release_offer_hold: "Release the offer hold",
  reconcile_payment: "Reconcile the payment",
  lapse_to_operations: "Lapse to Operations",
};

/**
 * Depth alone does not say how bad a queue is, so the tone comes from depth.
 *
 * Deliberately not from the queue's code: a "safety" queue with nothing in it is
 * calm, and a routine queue with two hundred rows is not. Three bands, and no
 * band claims a threshold — they are a reading aid over a published number.
 */
function depthTone(depth: number): "neutral" | "warning" | "danger" {
  if (depth === 0) return "neutral";
  if (depth < 10) return "warning";
  return "danger";
}

function QueueRow({ queue }: { queue: StuckQueue }) {
  const recovery = queueRecoveryAction(queue);

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={depthTone(queue.depth)}>{queue.depth}</Badge>
            <span className="font-mono text-xs text-text-muted">{queue.code}</span>
          </div>
          <p className="mt-1 font-semibold text-text">{queue.queue_label}</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            {queue.oldest_at === null ? (
              "Nothing waiting."
            ) : (
              <>
                Oldest since{" "}
                <time dateTime={queue.oldest_at}>
                  {new Date(queue.oldest_at).toLocaleString("en-IN")}
                </time>
              </>
            )}
          </p>
        </div>

        <div className="text-right text-sm">
          {recovery === null ? (
            // Published as an empty string on purpose. Said out loud rather than
            // left blank, so nobody reads the missing button as a bug.
            <span className="text-text-secondary">A person decides this one.</span>
          ) : (
            <span className="text-text-secondary">
              Recovery: <strong className="text-text">{RECOVERY_LABELS[recovery] ?? recovery}</strong>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function RequestLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const valid = isUuid(trimmed);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-text">Open one request</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        The contract publishes how deep each queue is, not what is in it. Paste the requirement id
        from the case, the ticket or the customer&rsquo;s message.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) router.push(`/operations/requests/${trimmed}`);
        }}
      >
        <Field label="Requirement id" className="min-w-72 flex-1">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
          />
        </Field>
        <Button type="submit" disabled={!valid}>
          Open
        </Button>
      </form>
      {trimmed !== "" && !valid ? (
        <p className="mt-2 text-sm text-danger-text">That is not the shape of a requirement id.</p>
      ) : null}
    </Card>
  );
}

export function QueueBoard() {
  const queues = useStuckQueues();
  const [term, setTerm] = useState("");

  const rows = useMemo(() => {
    const all = queues.data?.queues ?? [];
    return queuesByUrgency(searchQueues(all, term));
  }, [queues.data, term]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <Field label="Search queues">
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="unmatched, rematch, cancellation…"
          />
        </Field>

        {queues.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading the queues…
          </p>
        ) : null}

        {queues.isError ? (
          <ErrorState
            className="mt-4"
            title="We could not load the queues"
            message="Nothing has changed. Try again."
            actionLabel="Try again"
            onAction={() => void queues.refetch()}
          />
        ) : null}

        {!queues.isPending && !queues.isError && rows.length === 0 ? (
          <EmptyState
            className="mt-6"
            compact
            title={term.trim() === "" ? "No queues published" : "No queue matches that"}
            description={
              term.trim() === ""
                ? "The server returned no queues at all, which is not the same as nothing being stuck. Check the deployment."
                : "Clear the search to see all eight."
            }
          />
        ) : null}

        <ul className="mt-4 list-none space-y-2 p-0">
          {rows.map((queue) => (
            <QueueRow key={queue.code} queue={queue} />
          ))}
        </ul>
      </div>

      <RequestLookup />
    </div>
  );
}
