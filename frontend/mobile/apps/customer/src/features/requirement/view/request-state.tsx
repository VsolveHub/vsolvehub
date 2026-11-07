// Ported from frontend/apps/customer/features/requirement/view/request-state.tsx
import { Badge } from "@vsolve/mobile-ui";
import type { BadgeProps } from "@vsolve/mobile-ui";

import type { RequestState } from "../model/request-state";

export interface RequestStateCopy {
  label: string;
  explanation: string;
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
    explanation: "We are inviting professionals who cover this work. Quotes appear here as they arrive.",
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
  VISITS_BOOKED: {
    label: "Visit booked",
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
    explanation: "You chose a professional and they have not confirmed yet. This is not a booking until they do.",
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
      "You needed this by a date that has now passed, so we closed the request. A quote after the work was needed is no use to you. Anything you paid to unlock quotes is refunded in full.",
    nextStep: "Start again with a new date. Your answers are still here.",
    tone: "neutral",
  },
  CLOSED_ABANDONED: {
    label: "Cancelled by you",
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
  return (
    <Badge tone={copy.tone} dot={copy.tone === "warning" || copy.tone === "danger"}>
      {copy.label}
    </Badge>
  );
}
