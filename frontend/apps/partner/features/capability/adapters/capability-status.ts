import type { CapabilityRecord, CapabilityStatus } from "../contract-pending/types";

/**
 * What a capability's state means, and the exact next thing the Partner may do.
 *
 * Closes `M2-FE-109`.
 *
 * ## Why "the exact next permitted action" is the whole requirement
 *
 * Onboarding is where someone is most likely to be stuck and least likely to
 * ask. Every state below therefore says three things: where the request is,
 * whether the Partner needs to do anything, and — when they are waiting — that
 * waiting is correct. The M1 status banner learned this the hard way; a generic
 * "some documents need attention" is precisely the copy that sends a person back
 * to re-upload the wrong thing.
 *
 * So `CHANGES_REQUIRED` renders the reviewer's own words verbatim, and an empty
 * `review_notes` is treated as the contract violation it is (0013 §B3 acceptance
 * criterion 5) rather than smoothed over with copy the Partner cannot act on.
 *
 * ## Expiry is not a status
 *
 * `assert_capability_active` refuses an `APPROVED` capability whose `expires_at`
 * has passed. That check is reproduced here — but as a *derived* presentation,
 * never as a sixth `CapabilityStatus`. Inventing an `EXPIRED` value the model
 * does not have would leave the client holding a vocabulary Django cannot
 * confirm, and the two would drift the first time expiry policy changed.
 *
 * The comparison runs against a server clock (proposal 0010), not `Date.now()`.
 * A device whose clock is a day fast would otherwise show a live capability as
 * expired and route the Partner to support for a problem that does not exist.
 *
 * ## Two states this build cannot yet tell apart — logged, not papered over
 *
 * 1. **Rejected vs withdrawn.** `_ALLOWED_TRANSITIONS` sends both a Partner's
 *    own exit and Operations' refusal to `WITHDRAWN`, and 0013 §B3 publishes no
 *    actor. "You closed this" and "we said no" need different copy and different
 *    next actions, so the copy below commits to neither and names the record's
 *    state instead of guessing at its cause.
 * 2. **Expired documents.** `PartnerDocument` carries no expiry field at all, so
 *    the expired-document state `M2-FE-109` asks for has nothing to read.
 *
 * Both are in frontend-execution-plan.md §7. Neither is worked around here.
 */

export type CapabilityTone = "neutral" | "info" | "success" | "warning" | "danger";

export type CapabilityAction =
  | { readonly kind: "NONE" }
  | { readonly kind: "WAIT" }
  | { readonly kind: "FIX"; readonly href: string; readonly label: string }
  | { readonly kind: "SUPPORT"; readonly label: string }
  | { readonly kind: "REQUEST_AGAIN"; readonly href: string; readonly label: string };

export interface CapabilityPresentation {
  readonly tone: CapabilityTone;
  /** Short badge text. */
  readonly label: string;
  readonly headline: string;
  readonly detail: string;
  /** True when the Partner is waiting on someone else and should not act. */
  readonly isWaiting: boolean;
  /** True when this capability authorizes its workspace right now. */
  readonly isActive: boolean;
  readonly action: CapabilityAction;
}

const CAPABILITIES_HREF = "/apply/capabilities";

interface StaticPresentation {
  readonly tone: CapabilityTone;
  readonly label: string;
  readonly headline: string;
  readonly detail: string;
  readonly isWaiting: boolean;
  readonly action: CapabilityAction;
}

const BY_STATUS: Record<Exclude<CapabilityStatus, "CHANGES_REQUIRED" | "SUSPENDED">, StaticPresentation> = {
  REQUESTED: {
    tone: "neutral",
    label: "Requested",
    headline: "We have your request",
    detail:
      "It joins the review queue shortly. Nothing more is needed from you right now, and you can keep browsing work in the meantime.",
    isWaiting: true,
    action: { kind: "WAIT" },
  },
  UNDER_REVIEW: {
    tone: "info",
    label: "Under review",
    headline: "Someone is checking your request",
    detail:
      "Nothing more is needed from you right now. If anything is unclear we will ask you directly rather than refusing it.",
    isWaiting: true,
    action: { kind: "WAIT" },
  },
  APPROVED: {
    tone: "success",
    label: "Approved",
    headline: "You can take this work",
    detail: "Enquiries for this service will start reaching you.",
    isWaiting: false,
    action: { kind: "NONE" },
  },
  // Deliberately does not claim to know why. See the header.
  WITHDRAWN: {
    tone: "neutral",
    label: "Closed",
    headline: "This request is no longer live",
    detail:
      "It is not being reviewed and it does not give you access to this work. You can ask for it again, or contact support if you did not expect this.",
    isWaiting: false,
    action: { kind: "REQUEST_AGAIN", href: CAPABILITIES_HREF, label: "Ask again" },
  },
};

/**
 * Whether an approved capability's clock has run out.
 *
 * Exported because the mid-session guard needs the same answer, and two
 * implementations of "is this still live" is how a screen keeps offering an
 * action the navigation has already dropped.
 */
export function isExpired(record: CapabilityRecord, serverNow: string): boolean {
  if (record.expires_at === null) return false;

  const expiresAt = Date.parse(record.expires_at);
  const now = Date.parse(serverNow);
  // An unparseable instant fails *open* — the capability stays usable and Django
  // refuses if it is wrong. Failing closed here would strand an approved Partner
  // on a malformed timestamp, and the server is the authority on expiry either
  // way.
  if (Number.isNaN(expiresAt) || Number.isNaN(now)) return false;

  return expiresAt <= now;
}

export function describeCapability(
  record: CapabilityRecord,
  serverNow: string,
): CapabilityPresentation {
  if (record.status === "APPROVED" && isExpired(record, serverNow)) {
    return {
      tone: "warning",
      label: "Expired",
      headline: "Your approval for this work has run out",
      detail:
        "You will not receive new enquiries for it. Asking again is quick — we keep what you already sent.",
      isWaiting: false,
      isActive: false,
      action: { kind: "REQUEST_AGAIN", href: CAPABILITIES_HREF, label: "Ask again" },
    };
  }

  if (record.status === "CHANGES_REQUIRED") {
    return {
      tone: "warning",
      label: "Changes needed",
      headline: "We need something corrected",
      // The reviewer's own words. The fallback names a backend problem plainly
      // rather than inventing a plausible correction the Partner would act on.
      detail:
        record.review_notes.trim() ||
        "A reviewer asked for changes but did not say what. Contact support and we will tell you exactly what is needed.",
      isWaiting: false,
      isActive: false,
      action: { kind: "FIX", href: "/apply/documents", label: "Fix and resend" },
    };
  }

  if (record.status === "SUSPENDED") {
    return {
      tone: "danger",
      label: "Suspended",
      headline: "This work is paused on your account",
      // A suspension has an appeal path that runs through support. A banner is
      // the wrong surface for a dispute, so it points at one and says nothing
      // more — but it does say the work already committed is unaffected, which
      // is the question a suspended Partner actually has.
      detail:
        "You will not receive new enquiries for it. Work you have already committed to stays visible. Contact support to discuss this.",
      isWaiting: false,
      isActive: false,
      action: { kind: "SUPPORT", label: "Contact support" },
    };
  }

  const presentation = BY_STATUS[record.status];
  return {
    ...presentation,
    isActive: record.status === "APPROVED",
  };
}

/**
 * Capabilities that authorize something right now.
 *
 * Used for copy and summaries — never for navigation. Navigation comes from
 * `GET /partner/workspaces/` through the typed registry, and computing it from
 * this list instead would be the client deciding its own authorization from a
 * status field. The two agree in practice; when they disagree the grants are
 * right, because that is the endpoint Django built to answer the question.
 */
export function activeCapabilities(
  records: readonly CapabilityRecord[],
  serverNow: string,
): CapabilityRecord[] {
  return records.filter(
    (record) => record.status === "APPROVED" && !isExpired(record, serverNow),
  );
}

/**
 * The one capability worth surfacing on the home screen, or null.
 *
 * Ranked by how much it needs the Partner: something they must fix outranks
 * something they are waiting on, which outranks something already working. A
 * list would be more complete and would also bury the single row that needs a
 * person, which is the only reason to interrupt a home screen at all.
 */
const ATTENTION_ORDER: readonly CapabilityStatus[] = [
  "CHANGES_REQUIRED",
  "SUSPENDED",
  "UNDER_REVIEW",
  "REQUESTED",
];

export function mostUrgentCapability(
  records: readonly CapabilityRecord[],
): CapabilityRecord | null {
  for (const status of ATTENTION_ORDER) {
    const match = records.find((record) => record.status === status);
    if (match) return match;
  }
  return null;
}
