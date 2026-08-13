"use client";

import { Badge } from "@vsolve/ui";
import type { BadgeProps } from "@vsolve/ui";
import type { ReactNode } from "react";

import { isOurFailure, type RequestState } from "../model/request-state";

/**
 * What each request state says, and what it offers next — `M2-FE-215`.
 *
 * One table, read by the list row and by the request detail, because the two
 * screens disagreeing about what "closed" means is exactly how a Customer ends
 * up phoning support to ask which one is true.
 *
 * ## The rule every line here follows
 *
 * **No fabricated progress.** Nothing below implies motion that is not
 * happening, and nothing implies a decision the server has not made:
 *
 * - `MATCHING` says we are looking, and shows the deadline we promised. It does
 *   not say "3 professionals reviewing" — we do not know that, and invitations
 *   are aggregate-only before unlock anyway.
 * - `MATCHING_DELAYED` says our deadline passed. It does **not** say the SLA is
 *   breached: that is a server transition with a refund attached, and asserting
 *   it from a countdown would promise money nobody authorised.
 * - The five closures read differently on purpose. "Nobody covers this yet" and
 *   "we ran out of time" call for different next actions, and collapsing them
 *   into "closed" is the failure this task exists to prevent.
 *
 * ## Why `nextStep` is a sentence and not a button
 *
 * Three of these states have no action the Customer can take, and the honest
 * screen says so rather than offering a button that reloads the same page.
 * Where there *is* an action, the route supplies it — this feature does not own
 * the catalog URL or the support channel.
 */

export interface RequestStateCopy {
  /** The badge, and the headline on the detail. Plain language, no state names. */
  label: string;
  /** What is actually happening, and what has and has not been decided. */
  explanation: string;
  /**
   * The one truthful next step, or null when there genuinely is not one.
   *
   * Null is a real answer here and is rendered as silence, not as "please
   * wait" — a request that needs nothing from the Customer should not manufacture
   * a task for them.
   */
  nextStep: string | null;
  tone: NonNullable<BadgeProps["tone"]>;
}

export const REQUEST_STATE_COPY: Record<RequestState, RequestStateCopy> = {
  DRAFT: {
    label: "Not sent yet",
    explanation: "You started this request and have not sent it. Nobody has seen it.",
    nextStep: "Finish it and send it — sending is free.",
    tone: "neutral",
  },

  MATCHING: {
    label: "Finding professionals",
    explanation:
      "We are inviting professionals who cover this work. Quotes appear here as they arrive.",
    nextStep: null,
    tone: "info",
  },

  MATCHING_DELAYED: {
    label: "Running late",
    explanation:
      "We said you would have quotes by now and you do not. We are still looking. Nothing has been charged and nothing has been decided — if we cannot deliver, we close this and tell you.",
    nextStep: "Nothing to do. Talk to us if you would rather not wait.",
    tone: "warning",
  },

  // A5 only. The professional has committed to a time and the estimate does not
  // exist yet, so this must not read as "quotes ready" — the Customer has bought
  // a visit, not a price.
  VISITS_BOOKED: {
    label: "A visit is booked",
    explanation:
      "A professional is coming to see the job and write you an estimate on site. Any visit you paid for that never happens refunds its share on its own.",
    nextStep: "Nothing to do until they come.",
    tone: "info",
  },

  QUOTES_READY: {
    label: "Quotes ready",
    explanation: "Professionals have quoted. You can see what each one offers before you decide.",
    nextStep: "Open the quotes to compare them.",
    tone: "success",
  },

  UNLOCKED: {
    label: "Quotes unlocked",
    explanation: "You can see the full quotes, including who sent them and how to reach them.",
    nextStep: "Compare them and choose one.",
    tone: "success",
  },

  SELECTED: {
    label: "Waiting for the professional",
    explanation:
      // The pending-not-confirmed rule from `M2-FE-411`, stated here because
      // this is the first screen that can get it wrong. A Customer who reads
      // this as booked will not be at the site on the day.
      "You chose a professional and they have not confirmed yet. This is not a booking until they do.",
    nextStep: "Wait for their confirmation. If they decline, your unlock still stands.",
    tone: "warning",
  },

  ENGAGED: {
    label: "Booked",
    explanation: "The professional confirmed. The work is arranged.",
    nextStep: null,
    tone: "success",
  },

  CLOSED_NO_SUPPLY: {
    label: "Nobody available",
    explanation:
      "We invited every professional who covers this work in your area and none could take it. You have not been charged.",
    nextStep: "Try a different date, or a wider area. We will look again from scratch.",
    tone: "neutral",
  },

  CLOSED_SLA_BREACH: {
    label: "We missed our deadline",
    explanation:
      "We promised you quotes by a deadline and did not deliver. We closed this rather than leave it open with nothing in it. You have not been charged, and anything you did pay is refunded in full.",
    nextStep: "Send it again, or talk to us first — this one is on us.",
    tone: "danger",
  },

  CLOSED_EXPIRED: {
    label: "Your date has passed",
    explanation:
      // `GAP-001`. The consequence was stated on the where/when screen; this is
      // the same sentence arriving as fact, which is why the wording matches.
      "You needed this by a date that has now passed, so we closed the request. A quote after the work was needed is no use to you. Anything you paid to unlock quotes is refunded in full.",
    nextStep: "Start again with a new date. Your answers are still here.",
    tone: "neutral",
  },

  CLOSED_ABANDONED: {
    label: "You cancelled this",
    explanation: "You cancelled this request. Nothing was charged.",
    nextStep: null,
    tone: "neutral",
  },

  CLOSED_COMPLETE: {
    label: "Complete",
    explanation: "The work is done and this request is closed.",
    nextStep: null,
    tone: "success",
  },

  CLOSED_CANCELLED: {
    label: "Cancelled",
    explanation: "This request was cancelled.",
    nextStep: null,
    tone: "neutral",
  },
};

export function RequestStateBadge({ state }: { state: RequestState }) {
  const copy = REQUEST_STATE_COPY[state];
  // `dot` on the states someone is scanning a list for. Colour is never the
  // message here — the label always reads on its own — but a shape cue is what
  // makes "Running late" findable in a list of twelve at arm's length.
  return (
    <Badge tone={copy.tone} dot={copy.tone === "warning" || copy.tone === "danger"}>
      {copy.label}
    </Badge>
  );
}

export interface RequestStateNoticeProps {
  state: RequestState;
  /**
   * Offered where support is the honest answer.
   *
   * The feature does not own the support channel — the route passes the
   * control in — and it is rendered only where `isOurFailure` says we are the
   * reason there is nothing to show. Attaching it to every state would train
   * people to ignore it on the one that needs it.
   */
  supportAction?: ReactNode;
}

const NOTICE_TONES: Record<RequestStateCopy["tone"], string> = {
  success: "border-success-line bg-success-surface",
  warning: "border-warning-line bg-warning-surface",
  danger: "border-danger-line bg-danger-surface",
  info: "border-info-line bg-info-surface",
  brand: "border-info-line bg-info-surface",
  action: "border-action-line bg-action-surface",
  neutral: "border-line bg-surface-sunken",
};

/**
 * The full statement of where a request stands.
 *
 * Used on the detail, and on the list wherever the state is one the Customer
 * should not have to open a page to understand — a closure with a refund in it
 * being the obvious case.
 */
export function RequestStateNotice({ state, supportAction }: RequestStateNoticeProps) {
  const copy = REQUEST_STATE_COPY[state];

  return (
    <div className={`rounded-card border p-4 ${NOTICE_TONES[copy.tone]}`}>
      <p className="font-semibold text-text">{copy.label}</p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        {copy.explanation}
      </p>
      {copy.nextStep !== null ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">{copy.nextStep}</p>
      ) : null}
      {isOurFailure(state) && supportAction !== undefined ? (
        <div className="mt-3">{supportAction}</div>
      ) : null}
    </div>
  );
}
