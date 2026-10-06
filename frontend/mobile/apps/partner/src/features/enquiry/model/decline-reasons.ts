// Ported from frontend/apps/partner/features/enquiry/model/decline-reasons.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * Why a vendor is turning an enquiry down.
 *
 * Closes the reason-capture half of `M2-FE-303`.
 *
 * ## The vocabulary is the server's now, not this file's
 *
 * At 1.21.0 `EnquiryDeclineRequest.reason_code` was an unconstrained
 * `SlugField(max_length=80)`; five codes were authored here and marked as a gap.
 * **Contract 1.24.0 publishes `InvitationDeclineReasonEnum`** — `TOO_FAR`,
 * `NO_CAPACITY`, `OUT_OF_SCOPE`, `BUDGET_TOO_LOW`, `UNCLEAR_SCOPE`, `OTHER` —
 * and the list below is now derived from that type rather than invented beside
 * it. `DeclineReason["code"]` is the generated enum, so a code added, renamed or
 * removed on the server fails `pnpm typecheck` here instead of being posted into
 * a `400`.
 *
 * The old `crew_too_small` has no published twin and is gone rather than mapped:
 * `NO_CAPACITY` is the server's name for "I cannot supply this", and inventing a
 * second slug for the same fact is exactly what the published vocabulary exists
 * to stop.
 *
 * ## The constraint is on the serializer, not the column
 *
 * The same column also carries the platform's own writes — `requirement_changed`
 * when Operations withdraws an invitation, `non_responsive_quote` when a quote is
 * rejected — so a code that arrives on a *read* may legitimately be outside this
 * list. `describeDeclineReason` handles that and does not treat it as an error.
 *
 * ## Why each option states its consequence
 *
 * A reason box nobody explains is a reason box people click through, and a
 * decline reason nobody acts on makes the matcher look like it is learning when
 * it is not. Each option says what Vsolve does with it, so the vendor is
 * choosing an outcome rather than filling a field.
 */

export type DeclineReasonCode = Schemas["InvitationDeclineReasonEnum"];

export interface DeclineReason {
  /** The published code sent to Django. Operations reports group on it. */
  readonly code: DeclineReasonCode;
  /** What the vendor picks. Written from their side, not the platform's. */
  readonly label: string;
  /** What Vsolve does with it, stated so the vendor knows the answer is used. */
  readonly consequence: string;
}

/**
 * Every published code, in the order a vendor is most likely to want them.
 *
 * `Record<DeclineReasonCode, ...>` rather than a bare array: a value added to the
 * enum on the next regeneration fails the type check here rather than silently
 * disappearing from the dropdown.
 */
const REASON_COPY: Record<DeclineReasonCode, Omit<DeclineReason, "code">> = {
  NO_CAPACITY: {
    label: "I am booked for these dates",
    consequence: "We stop offering you work on these dates and invite someone else.",
  },
  TOO_FAR: {
    label: "This is too far from where I work",
    consequence: "We look at your service areas before inviting you to this area again.",
  },
  OUT_OF_SCOPE: {
    label: "This is not the kind of work I do",
    consequence: "We check the work against your approved services before inviting you again.",
  },
  UNCLEAR_SCOPE: {
    label: "I cannot quote on what is described",
    consequence: "Operations is told the request needs more detail before it goes out again.",
  },
  BUDGET_TOO_LOW: {
    label: "The budget is below what I can work for",
    consequence: "The customer is told their budget may be short. Your rate is not shared.",
  },
  OTHER: {
    label: "Something else",
    consequence: "Recorded as a decline with no reason we can act on. Prefer one of the above.",
  },
};

const REASON_ORDER: readonly DeclineReasonCode[] = [
  "NO_CAPACITY",
  "TOO_FAR",
  "OUT_OF_SCOPE",
  "UNCLEAR_SCOPE",
  "BUDGET_TOO_LOW",
  "OTHER",
];

export const DECLINE_REASONS: readonly DeclineReason[] = REASON_ORDER.map((code) => ({
  code,
  ...REASON_COPY[code],
}));

const BY_CODE = new Map<string, DeclineReason>(
  DECLINE_REASONS.map((reason) => [reason.code, reason]),
);

export function findDeclineReason(code: string): DeclineReason | null {
  return BY_CODE.get(code) ?? null;
}

/** Narrows a free string to a published code, or nothing. Used at the form seam. */
export function asDeclineReasonCode(code: string): DeclineReasonCode | null {
  return findDeclineReason(code)?.code ?? null;
}

/**
 * A reason code Django returned that this build has no copy for.
 *
 * Reachable in two ordinary ways: the platform's own system reasons share the
 * column (`requirement_changed`, `non_responsive_quote`), and a newer deployment
 * can add codes this bundle predates. Rendering the raw code is honest — it is
 * what the server recorded — and it is de-slugged rather than dressed up, so
 * nobody mistakes it for copy somebody wrote.
 */
export function describeDeclineReason(code: string): string {
  const known = findDeclineReason(code);
  if (known) return known.label;
  if (!code) return "";
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
