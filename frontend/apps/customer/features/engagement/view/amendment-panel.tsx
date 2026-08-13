"use client";

import { describeError, isAmendmentNotActionable, useServerCountdown } from "@vsolve/query";
import { Badge, Button, ConfirmAction, ErrorState, Skeleton, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toAmendmentsView, type AmendmentView, type EngagementView } from "../adapters";
import {
  useAcceptAmendment,
  useDeclineAmendment,
  useEngagementAmendments,
} from "../queries";
import type { ModeNouns } from "./engagement-status";

/**
 * Change requests — `M2-FE-610` (A5 change orders) and `M2-FE-511` (A3 time
 * extensions), which are the same screen because they are the same object.
 *
 * ## The single failure mode this component exists to prevent
 *
 * **A proposed amendment must never read as approved scope.** Everything below
 * is arranged around that:
 *
 * - It is drawn in its own bordered block with a `Requested — not agreed` badge,
 *   never merged into the agreement's own figures. The agreement panel above it
 *   keeps showing what is actually agreed, which is `staged_total_paise`, and
 *   that number does **not** move when a request arrives.
 * - The comparison is explicit — "now", "this change", "if you accept" — and the
 *   third line is labelled as a projection rather than as a total.
 * - Acceptance is a confirmation with the money consequence in it, never a bare
 *   button.
 * - A status this build does not recognise renders as undescribable and offers
 *   **nothing**. Falling through to "decidable" would be one keystroke from the
 *   exact failure above.
 *
 * ## Money before scope
 *
 * Accepting does not change the agreed work until the money has moved. On a
 * managed increase the response carries a `PaymentAttempt` and **nothing changes
 * until a verified provider callback lands** — so that state renders as waiting,
 * with nothing to press, exactly as every other M2 charge does. Repeating the
 * acceptance returns the same attempt rather than starting a second charge, and
 * offering a second control over it would be offering a second way to pay twice.
 *
 * ## What the Customer cannot do here
 *
 * Propose one. `POST /engagements/{id}/amendments/` exists for both parties, but
 * an A3 extension is priced by the server from the vendor's frozen rate and an
 * A5 change order is priced by the vendor line by line — in both cases the
 * professional names the work and the platform or they name the money. A
 * Customer-authored change request would be this app setting a price, which
 * `07-state-machines-and-permissions.md` §7 puts in the "may never" column.
 */

export interface AmendmentPanelProps {
  engagement: EngagementView;
  nouns: ModeNouns;
}

export function AmendmentPanel({ engagement, nouns }: AmendmentPanelProps) {
  const query = useEngagementAmendments(engagement.engagementId);
  const accept = useAcceptAmendment();
  const decline = useDeclineAmendment();
  const [confirming, setConfirming] = useState(false);

  const view = query.data === undefined ? null : toAmendmentsView(query.data);

  if (query.isPending) {
    return (
      <section className="mt-8" aria-busy="true">
        <h2 className="text-lg font-semibold text-text">Changes to this job</h2>
        <Skeleton className="mt-3 h-24 w-full" />
      </section>
    );
  }

  if (view === null) {
    const presentation = describeError(query.error, "read");
    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Changes to this job</h2>
        {/* Failing separately from the agreement above it, deliberately: a
            change-request read that will not load must not be able to hide the
            agreement, and it must not imply there are none. */}
        <div className="mt-3">
          <ErrorState
            title={presentation.title}
            message={`${presentation.message} We do not know whether there is a change waiting for you, so please try again.`}
            severity={presentation.severity}
            actionLabel="Try again"
            onAction={() => void query.refetch()}
            reference={presentation.reference}
            inline
          />
        </div>
      </section>
    );
  }

  const live = view.live;

  return (
    <section aria-labelledby="amendments-heading" className="mt-8">
      <h2 id="amendments-heading" className="text-lg font-semibold text-text">
        Changes to this job
      </h2>

      {live === null ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Nothing is waiting for you. If the professional needs more time or the
          work changes, they send you a request here and{" "}
          <strong className="font-semibold">nothing changes until you accept it.</strong>
        </p>
      ) : (
        <LiveAmendment
          amendment={live}
          engagement={engagement}
          nouns={nouns}
          confirming={confirming}
          setConfirming={setConfirming}
          isAccepting={accept.isPending}
          isDeclining={decline.isPending}
          onAccept={() =>
            accept.mutate(
              { engagementId: engagement.engagementId, amendmentId: live.amendmentId },
              { onSuccess: () => setConfirming(false) },
            )
          }
          onDecline={() =>
            decline.mutate({
              engagementId: engagement.engagementId,
              amendmentId: live.amendmentId,
            })
          }
        />
      )}

      {isAmendmentNotActionable(accept.error ?? decline.error) ? (
        <div className="mt-3">
          <ErrorState
            title="That request has moved on"
            message="It expired, or somebody already answered it. We have re-read it — what you see now is what is actually there."
            severity="warning"
            actionLabel="Refresh"
            onAction={() => void query.refetch()}
            inline
          />
        </div>
      ) : (
        <div className="mt-3">
          <AccessRefusal error={accept.error ?? decline.error} attempting="answer this request" />
        </div>
      )}

      <PastRequests amendments={view.all} liveId={live?.amendmentId ?? null} />
    </section>
  );
}

/* --------------------------------------------------------------------------
   The live request
   -------------------------------------------------------------------------- */

function LiveAmendment({
  amendment,
  engagement,
  nouns,
  confirming,
  setConfirming,
  isAccepting,
  isDeclining,
  onAccept,
  onDecline,
}: {
  amendment: AmendmentView;
  engagement: EngagementView;
  nouns: ModeNouns;
  confirming: boolean;
  setConfirming: (open: boolean) => void;
  isAccepting: boolean;
  isDeclining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const countdown = useServerCountdown(
    amendment.isDecidable ? amendment.expiresAtIso : null,
    60_000,
  );

  // A status this build cannot name offers nothing at all.
  if (!amendment.isKnownStatus) {
    return (
      <div className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
        <h3 className="font-semibold text-text">We cannot describe this change request</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          This app does not recognise the state it is in, so it is not going to
          guess. Nothing about your agreement has changed. Please contact support.
        </p>
      </div>
    );
  }

  if (amendment.isAwaitingPayment) {
    return (
      <div className="mt-3 rounded-card border border-warning-line bg-warning-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-text">Waiting for your payment to clear</h3>
          <Badge tone="warning">Not agreed yet</Badge>
        </div>
        {/* Nothing to press. Every control that could exist on a pending charge
            is a way to pay twice. */}
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          You accepted this change and we are confirming the extra{" "}
          {amendment.deltaLabel} with your bank or UPI app. That can take a few
          minutes — <strong className="font-semibold">do not pay again.</strong>{" "}
          The work does not change until the payment is confirmed.
        </p>
      </div>
    );
  }

  const projectedTotalPaise = engagement.stagedTotalPaise + amendment.deltaPaise;

  return (
    <div className="mt-3 rounded-card border-2 border-warning-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-text">
          {amendment.kind === "TIME_EXTENSION"
            ? "The professional has asked for more time"
            : amendment.kind === "CHANGE_ORDER"
              ? "The professional has proposed a change to the work"
              : "The professional has asked for a change"}
        </h3>
        {/* The badge is the guard against the one failure this panel exists to
            prevent. It never says "agreed", "updated" or "new scope". */}
        <Badge tone="warning">Requested — not agreed</Badge>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-6 text-text">{amendment.reason}</p>

      {amendment.lines.length > 0 ? (
        <ul className="mt-3 flex list-none flex-col gap-1 border-t border-line p-0 pt-3">
          {amendment.lines.map((line) => (
            <li key={line.position} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-text">
                {line.title}
                {line.quantity !== 1 ? ` × ${line.quantity}` : ""}
              </span>
              <span className={line.removesScope ? "text-success-text" : "text-text"}>
                {line.removesScope ? "removes " : ""}
                {line.amountLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* `M2-FE-610`: the comparison against the current agreement, three lines,
          the third one labelled as what it is. `staged_total_paise` is the
          server's own "agreed" number and does not move until this is applied;
          the projection is this client adding one published number to another,
          because nothing publishes a would-be total. */}
      <dl className="mt-3 rounded-card border border-line bg-surface-sunken p-3">
        <Comparison label={`Agreed for this ${nouns.engagement} now`} value={engagement.stagedTotalLabel} />
        <Comparison
          label={amendment.direction === "refund" ? "This change takes off" : "This change adds"}
          value={amendment.deltaLabel}
          tone={amendment.direction === "refund" ? "credit" : "charge"}
        />
        <Comparison
          label="If you accept, it becomes"
          value={formatProjection(projectedTotalPaise)}
          strong
        />
      </dl>

      <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
        {amendment.direction === "charge"
          ? engagement.mode === "lead_only"
            ? `You pay this professional directly, so accepting adds ${amendment.deltaLabel} to what you owe them. Vsolve does not collect it.`
            : `Accepting takes you to a payment for the extra ${amendment.deltaLabel}. The work does not change until that payment is confirmed.`
          : amendment.direction === "refund"
            ? engagement.mode === "lead_only"
              ? `Accepting reduces what you owe the professional by ${amendment.deltaLabel}.`
              : `We refund ${amendment.deltaLabel} to you first, and the work is reduced after that — so you are never owed less work than you have paid for.`
            : "Accepting changes what was agreed. No money moves either way."}
      </p>

      {countdown !== null && !countdown.isExpired ? (
        <p className="mt-2 text-sm text-text-secondary">
          They need an answer by {amendment.expiresAt}.
        </p>
      ) : null}

      {amendment.isDecidable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setConfirming(true)} disabled={isAccepting || isDeclining}>
            Accept this change
          </Button>
          <Button
            variant="outline"
            onClick={onDecline}
            loading={isDeclining}
            loadingLabel="Declining"
            disabled={isAccepting}
          >
            No, leave it as agreed
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">
          This is no longer yours to answer.
        </p>
      )}

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Accept this change?"
        consequence={
          amendment.direction === "charge"
            ? engagement.mode === "lead_only"
              ? `You will owe the professional ${amendment.deltaLabel} more, paid directly to them. What was agreed changes as soon as you accept.`
              : `We will ask you to pay ${amendment.deltaLabel}. Nothing about the work changes until that payment is confirmed — accepting does not change it on its own.`
            : amendment.direction === "refund"
              ? engagement.mode === "lead_only"
                ? `You will owe the professional ${amendment.deltaLabel} less. What was agreed changes as soon as you accept.`
                : `We will refund ${amendment.deltaLabel} to you, and the work is reduced after the refund is issued.`
              : "What was agreed changes. No money moves."
        }
        confirmLabel="Yes, accept it"
        pending={isAccepting}
        onConfirm={onAccept}
      />
    </div>
  );
}

/**
 * The one number on this screen the server has not calculated.
 *
 * `staged_total_paise` plus a delta that has **not** been applied. It is kept
 * out of the adapter deliberately, so it lives beside the row that labels it "if
 * you accept" — a projection filed among the real totals is how it starts being
 * read as one. Requested as a published field in §7.
 */
function formatProjection(projectedPaise: number): string {
  return formatMoney(projectedPaise);
}

function Comparison({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "charge" | "credit";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd
        className={
          strong
            ? "font-semibold text-text"
            : tone === "credit"
              ? "text-success-text"
              : "text-text"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Everything already answered
   -------------------------------------------------------------------------- */

function PastRequests({
  amendments,
  liveId,
}: {
  amendments: readonly AmendmentView[];
  liveId: string | null;
}) {
  const past = amendments.filter((amendment) => amendment.amendmentId !== liveId);
  if (past.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-text-secondary">Earlier requests</h3>
      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {past.map((amendment) => (
          <li key={amendment.amendmentId} className="rounded-card border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-text">{amendment.reason}</p>
              <p className="text-xs text-text-muted">
                {amendment.appliedAt ?? amendment.respondedAt ?? amendment.createdAt}
              </p>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {amendment.isApplied
                ? `Agreed — ${amendment.direction === "refund" ? "took off" : "added"} ${amendment.deltaLabel}`
                : amendment.status === "CUSTOMER_DECLINED"
                  ? "You said no. Nothing changed."
                  : amendment.status === "EXPIRED"
                    ? "It ran out of time. Nothing changed."
                    : "Not agreed."}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
