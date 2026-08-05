"use client";

import { Badge, Button, Card, ErrorState, Field, Spinner, Textarea } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { ruleFailure } from "../model/failures";
import {
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  availableActions,
  describeDependency,
  describeLifecycle,
  describeMode,
  isAwaitingAnotherReviewer,
  isOwnProposal,
  isReasonAcceptable,
  lifecycleTone,
  type RuleAction,
} from "../model/lifecycle";
import {
  useActorId,
  useCompatibilityRule,
  useRetireRule,
  useReviewRule,
} from "../queries";

/**
 * One compatibility rule, and the decisions this operator may take on it.
 *
 * ## The proposer is never shown the decision
 *
 * `availableActions` removes Activate and Reject for the person who proposed the
 * rule, so the controls do not exist in the DOM at all — not disabled, not
 * hidden with CSS. What they get instead is a sentence explaining that the draft
 * is waiting on somebody else, because a draft with no visible next step reads
 * as a stuck record rather than a working control.
 *
 * ## Identity is masked to the relationship
 *
 * Proposer and reviewer are shown as "you" or "another Operations reviewer",
 * never as the raw account id the payload carries. The only question this screen
 * has to answer about identity is whether the operator may act, and printing a
 * colleague's account id answers a question nobody asked. There is deliberately
 * no reveal control: the contract publishes no audited disclosure for staff
 * identity, and an unaudited "reveal" would be exactly the affordance this
 * console must not grow.
 *
 * ## Refusals are read by reason, not by status
 *
 * Every failure here is a 409. `ruleFailure` reads Django's `details.reason` so
 * "somebody edited this", "the variant is inactive" and "this was never yours to
 * approve" get the three different recoveries they need.
 */

type Rule = Schemas["CompatibilityRule"];

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function Moment({ value }: { value: string }) {
  return (
    <time dateTime={value} data-numeric>
      {DATE_TIME.format(new Date(value))}
    </time>
  );
}

function Provenance({ rule, actorId }: { rule: Rule; actorId: string | null }) {
  const mine = isOwnProposal(rule, { actorId });
  const reviewed = rule.reviewed_at !== null;

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
      <dt className="text-text-muted">Proposed by</dt>
      <dd className="text-text">
        {rule.created_by_id === null
          ? "Not recorded — this rule predates the review process"
          : mine
            ? "You"
            : "Another Operations reviewer"}
      </dd>

      <dt className="text-text-muted">Reason given</dt>
      <dd className="text-text">{rule.change_reason || "—"}</dd>

      <dt className="text-text-muted">Reviewed by</dt>
      <dd className="text-text">
        {!reviewed
          ? "Nobody yet"
          : rule.reviewed_by_id !== null && rule.reviewed_by_id === actorId
            ? "You"
            : "Another Operations reviewer"}
        {rule.reviewed_at ? (
          <>
            {" on "}
            <Moment value={rule.reviewed_at} />
          </>
        ) : null}
      </dd>

      {rule.review_reason ? (
        <>
          <dt className="text-text-muted">Review note</dt>
          <dd className="text-text">{rule.review_reason}</dd>
        </>
      ) : null}
    </dl>
  );
}

export function RuleDetail({ ruleId }: { ruleId: string | null }) {
  const actorId = useActorId();
  const detail = useCompatibilityRule(ruleId);
  const review = useReviewRule();
  const retire = useRetireRule();

  const [action, setAction] = useState<RuleAction | null>(null);
  const [reason, setReason] = useState("");

  if (ruleId === null) {
    return (
      <Card className="p-5">
        <p className="text-sm text-text-secondary">
          Choose a rule from the list to read it.
        </p>
      </Card>
    );
  }

  if (detail.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading the rule…
      </p>
    );
  }

  if (detail.isError) {
    const failure = ruleFailure(detail.error);
    return (
      <ErrorState
        title={failure?.title ?? "We could not load this rule"}
        message={failure?.message ?? "Nothing has changed. Check your connection and try again."}
        actionLabel="Try again"
        onAction={() => void detail.refetch()}
      />
    );
  }

  const rule = detail.data;
  const actions = availableActions(rule, { actorId });
  const awaitingSomeoneElse = isAwaitingAnotherReviewer(rule, { actorId });
  const pending = review.isPending || retire.isPending;
  const failure = ruleFailure(review.error ?? retire.error);

  function submit(entry: RuleAction) {
    const input = {
      ruleId: rule.id,
      expectedVersion: rule.version,
      reason: reason.trim(),
    };
    const settled = { onSuccess: () => setAction(null) };

    if (entry.command === "retire") {
      retire.mutate(input, settled);
      return;
    }
    review.mutate({ ...input, command: entry.command }, settled);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-text">
            {rule.left_service_name} · {rule.left_variant_name}
            <span className="block text-sm font-semibold text-text-muted">with</span>
            {rule.right_service_name} · {rule.right_variant_name}
          </h2>
          <Badge tone={lifecycleTone(rule.lifecycle_status)}>
            {describeLifecycle(rule.lifecycle_status)}
          </Badge>
        </div>

        <p className="mt-2 text-sm text-text-secondary">
          Version <span data-numeric>{rule.version}</span> · {describeMode(rule.mode)} ·{" "}
          {describeDependency(rule.dependency)}
        </p>

        <p className="mt-1 text-sm text-text-secondary">
          In effect from <Moment value={rule.effective_from} />
          {rule.effective_to ? (
            <>
              {" until "}
              <Moment value={rule.effective_to} />
            </>
          ) : (
            " with no end date"
          )}
        </p>

        <Provenance rule={rule} actorId={actorId} />
      </Card>

      {awaitingSomeoneElse ? (
        <Card className="p-5">
          <h3 className="text-base font-bold text-text">Waiting on another reviewer</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            You proposed this rule, so activating or rejecting it is somebody
            else&apos;s decision. Ask a colleague on the Operations rota to pick
            it up — this is not access that can be granted.
          </p>
        </Card>
      ) : actions.length > 0 ? (
        <Card className="p-5">
          <h3 className="text-base font-bold text-text">Decision</h3>

          {failure ? (
            <ErrorState
              inline
              className="mt-3"
              severity={failure.severity === "warning" ? "warning" : "error"}
              title={failure.title}
              message={failure.message}
            />
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((entry) => (
              <Button
                key={entry.command}
                variant={
                  entry.tone === "primary"
                    ? "primary"
                    : entry.tone === "danger"
                      ? "danger"
                      : "outline"
                }
                onClick={() => {
                  setAction(entry);
                  setReason("");
                }}
              >
                {entry.label}
              </Button>
            ))}
          </div>

          {action ? (
            <div className="mt-4">
              <p className="text-sm leading-6 text-text-secondary">{action.consequence}</p>

              <Field
                className="mt-3"
                label={`Why you are ${
                  action.command === "activate"
                    ? "activating"
                    : action.command === "reject"
                      ? "rejecting"
                      : "retiring"
                } this rule`}
                description={`Recorded against the rule and kept. At least ${REASON_MIN_LENGTH} characters.`}
                required
                error={
                  reason.trim().length > REASON_MAX_LENGTH
                    ? `Keep this under ${REASON_MAX_LENGTH} characters.`
                    : undefined
                }
              >
                <Textarea
                  rows={3}
                  value={reason}
                  maxLength={REASON_MAX_LENGTH}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={!isReasonAcceptable(reason)}
                  loading={pending}
                  loadingLabel="Recording"
                  onClick={() => submit(action)}
                >
                  Confirm {action.label.toLowerCase()}
                </Button>
                <Button variant="ghost" onClick={() => setAction(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-text-secondary">
            {rule.lifecycle_status === "ACTIVE"
              ? "This rule is in force. Only an Operations reviewer can retire it."
              : "This rule has reached the end of its life. Propose a new rule for this pair if the policy needs to change."}
          </p>
        </Card>
      )}
    </div>
  );
}
