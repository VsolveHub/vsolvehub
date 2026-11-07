// Ported from frontend/apps/partner/features/capability/adapters/capability-status.ts
import type { CapabilityRecord, CapabilityStatus } from "./wire";
import { readCapabilityStatus } from "./wire";

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
 * So `CHANGES_REQUIRED` and `REJECTED` both render the reviewer's own words
 * verbatim, and an empty `review_notes` is treated as the contract violation it
 * is (1.22.0 guarantees it non-empty for both, in the domain *and* by
 * `partners_capability_review_state_needs_notes`) rather than smoothed over with
 * copy the Partner cannot act on.
 *
 * ## The sixth status, and why it was worth a visible break
 *
 * Until contract 1.22.0 `_ALLOWED_TRANSITIONS` sent both Operations' refusal and
 * the Partner's own exit to `WITHDRAWN`, so this file described both as "no
 * longer live" and committed to neither cause. 1.22.0 splits them:
 *
 * | | `REJECTED` | `WITHDRAWN` |
 * |---|---|---|
 * | Who caused it | Operations | The Partner |
 * | `review_notes` | Required, non-empty | Not required |
 * | Reachable from | `UNDER_REVIEW`, `CHANGES_REQUIRED` | Every non-terminal status |
 * | Terminal | Yes | Yes |
 * | Blocks a fresh request | **No** | **No** |
 *
 * Both are terminal and neither is a ban, so both end in a way forward — but not
 * the same way. A refusal offers support first, because a person told "no"
 * without a route to argue concludes the decision was arbitrary; a withdrawal
 * offers "ask again" first, because that is literally the undo.
 *
 * ## An unrecognised status describes itself as unrecognised
 *
 * `PartnerCapability.status` is a bare `string` on the wire. A seventh value
 * from a newer deployment resolves to `null` through `readCapabilityStatus` and
 * gets its own presentation — "we cannot describe this" plus support — never the
 * nearest thing this build happens to know. That is the same fail-closed rule
 * the workspace registry applies to an unknown key, one layer down: guessing is
 * how `WITHDRAWN` came to mean two things in the first place.
 *
 * ## Expiry is not a status
 *
 * `assert_capability_active` refuses an `APPROVED` capability whose `expires_at`
 * has passed, and refuses again when a required document has expired. Both are
 * reproduced here as *derived* presentation, never as extra `CapabilityStatus`
 * values. Inventing them would leave the client holding a vocabulary Django
 * cannot confirm, and the two would drift the first time expiry policy changed —
 * which is exactly what Session B asked for and 1.22.0 delivered: raw fields
 * (`expired_document_kinds`, `documents_expiring_on`), no computed status.
 *
 * Every comparison runs against a server clock (proposal 0010), not
 * `Date.now()`. A device whose clock is a day fast would otherwise show a live
 * capability as expired and route the Partner to support for a problem that does
 * not exist.
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
  /**
   * A second control, offered only where two routes are genuinely reasonable.
   *
   * `REJECTED` and `WITHDRAWN` are both terminal and neither blocks a fresh
   * request, so each carries the other's route as a secondary: a refusal leads
   * with support and still lets someone re-apply, a withdrawal leads with
   * re-applying and still reaches support. One control would have to choose for
   * them.
   */
  readonly secondaryAction: CapabilityAction | null;
  /** When the last decision was taken, so a state can be dated. Never invented. */
  readonly decidedAt: string | null;
  /** The reason code Operations recorded, for support to quote. Empty when none. */
  readonly decisionReasonCode: string;
}

const CAPABILITIES_HREF = "/apply/capabilities";
const DOCUMENTS_HREF = "/apply/documents";

interface StaticPresentation {
  readonly tone: CapabilityTone;
  readonly label: string;
  readonly headline: string;
  readonly detail: string;
  readonly isWaiting: boolean;
  readonly action: CapabilityAction;
  readonly secondaryAction?: CapabilityAction;
}

type SimpleStatus = Exclude<CapabilityStatus, "CHANGES_REQUIRED" | "SUSPENDED" | "REJECTED">;

const BY_STATUS: Record<SimpleStatus, StaticPresentation> = {
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
  // The Partner's own exit, and nothing else, since 1.22.0. Leads with the undo.
  WITHDRAWN: {
    tone: "neutral",
    label: "Closed by you",
    headline: "You closed this request",
    detail:
      "It is not being reviewed and it does not give you access to this work. Asking again starts a new review — closing it does not count against you.",
    isWaiting: false,
    action: { kind: "REQUEST_AGAIN", href: CAPABILITIES_HREF, label: "Ask again" },
    secondaryAction: { kind: "SUPPORT", label: "I did not close this" },
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

/**
 * Required documents Django has already recorded as expired.
 *
 * `expired_document_kinds` is the raw field 1.22.0 publishes rather than a
 * computed status, which is what Session B asked for: `assert_capability_active`
 * refuses on it with `m2_capability_not_approved`, so an `APPROVED` capability
 * with a non-empty list is **not** authorized and this build must not render it
 * as though it were.
 */
export function hasExpiredDocuments(record: CapabilityRecord): boolean {
  return record.expired_document_kinds.length > 0;
}

/** A document kind rendered in the Partner's words rather than as a constant. */
function readableKind(kind: string): string {
  const words = kind.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeExpiredDocuments(record: CapabilityRecord): string {
  return record.expired_document_kinds.map(readableKind).join(", ");
}

/** How many days until the next required document expires, or null. */
export function daysUntilDocumentExpiry(
  record: CapabilityRecord,
  serverNow: string,
): number | null {
  if (record.documents_expiring_on === null) return null;
  // The field is a date; the end of that day is when the document stops being
  // usable, and treating midnight as the deadline would warn a day early.
  const expiresAt = Date.parse(`${record.documents_expiring_on}T23:59:59Z`);
  const now = Date.parse(serverNow);
  if (Number.isNaN(expiresAt) || Number.isNaN(now)) return null;
  return Math.floor((expiresAt - now) / 86_400_000);
}

/** True when this capability is authorized right now, by every check we can see. */
export function isCapabilityLive(record: CapabilityRecord, serverNow: string): boolean {
  return (
    readCapabilityStatus(record.status) === "APPROVED" &&
    !isExpired(record, serverNow) &&
    !hasExpiredDocuments(record)
  );
}

function decisionOf(record: CapabilityRecord): {
  decidedAt: string | null;
  decisionReasonCode: string;
} {
  return {
    // `last_transition` first: it dates the decision itself, where `reviewed_at`
    // dates the review and is null for a Partner's own withdrawal.
    decidedAt: record.last_transition?.occurred_at ?? record.reviewed_at,
    decisionReasonCode: record.last_transition?.reason_code ?? "",
  };
}

export function describeCapability(
  record: CapabilityRecord,
  serverNow: string,
): CapabilityPresentation {
  const status = readCapabilityStatus(record.status);
  const decision = decisionOf(record);

  // A status this build has no words for. Never mapped onto the nearest known
  // value — see the header.
  if (status === null) {
    return {
      tone: "warning",
      label: "Unknown",
      headline: "We cannot describe this request",
      detail:
        "Your app is older than this part of Vsolve. Update it, or contact support and we will tell you exactly where this stands.",
      isWaiting: false,
      isActive: false,
      action: { kind: "SUPPORT", label: "Contact support" },
      secondaryAction: null,
      ...decision,
    };
  }

  if (status === "APPROVED" && isExpired(record, serverNow)) {
    return {
      tone: "warning",
      label: "Expired",
      headline: "Your approval for this work has run out",
      detail:
        "You will not receive new enquiries for it. Asking again is quick — we keep what you already sent.",
      isWaiting: false,
      isActive: false,
      action: { kind: "REQUEST_AGAIN", href: CAPABILITIES_HREF, label: "Ask again" },
      secondaryAction: null,
      ...decision,
    };
  }

  // An approved capability whose required document has lapsed. Deliberately not
  // a status: Django refuses it with `m2_capability_not_approved` and publishes
  // the kinds, so the screen names the document rather than the state.
  if (status === "APPROVED" && hasExpiredDocuments(record)) {
    return {
      tone: "warning",
      label: "Document expired",
      headline: "A document we need has run out of date",
      detail: `New enquiries for this work stop reaching you until you replace it: ${describeExpiredDocuments(record)}. Work you have already committed to is unaffected.`,
      isWaiting: false,
      isActive: false,
      action: { kind: "FIX", href: DOCUMENTS_HREF, label: "Replace the document" },
      secondaryAction: null,
      ...decision,
    };
  }

  if (status === "CHANGES_REQUIRED") {
    return {
      tone: "warning",
      label: "Changes needed",
      headline: "We need something corrected",
      // The reviewer's own words. 1.22.0 guarantees them non-empty; the fallback
      // names a backend problem plainly rather than inventing a plausible
      // correction the Partner would act on.
      detail:
        record.review_notes.trim() ||
        "A reviewer asked for changes but did not say what. Contact support and we will tell you exactly what is needed.",
      isWaiting: false,
      isActive: false,
      action: { kind: "FIX", href: DOCUMENTS_HREF, label: "Fix and resend" },
      secondaryAction: null,
      ...decision,
    };
  }

  if (status === "REJECTED") {
    return {
      tone: "danger",
      label: "Not approved",
      headline: "We could not approve this",
      // Operations' own words, and they are required to exist. The sentence
      // after them is the part that matters: a refusal is not a ban, and the
      // Partner has to be told so here rather than discovering it by trying.
      detail: `${
        record.review_notes.trim() ||
        "A reviewer turned this down but did not say why. Contact support and we will tell you."
      } This does not stop you asking again for the same work once it is sorted.`,
      isWaiting: false,
      isActive: false,
      action: { kind: "SUPPORT", label: "Ask us why" },
      secondaryAction: {
        kind: "REQUEST_AGAIN",
        href: CAPABILITIES_HREF,
        label: "Ask again",
      },
      ...decision,
    };
  }

  if (status === "SUSPENDED") {
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
      secondaryAction: null,
      ...decision,
    };
  }

  const presentation = BY_STATUS[status];
  return {
    ...presentation,
    isActive: status === "APPROVED",
    secondaryAction: presentation.secondaryAction ?? null,
    ...decision,
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
  return records.filter((record) => isCapabilityLive(record, serverNow));
}

/**
 * The one capability worth surfacing on the home screen, or null.
 *
 * Ranked by how much it needs the Partner: something they must fix outranks
 * something they are waiting on, which outranks something already working. A
 * list would be more complete and would also bury the single row that needs a
 * person, which is the only reason to interrupt a home screen at all.
 *
 * `REJECTED` sits above `SUSPENDED` because a refusal is the state a Partner is
 * most likely to be confused by and most able to resolve; a withdrawal is not
 * ranked at all, because the Partner caused it and knows.
 */
const ATTENTION_ORDER: readonly CapabilityStatus[] = [
  "CHANGES_REQUIRED",
  "REJECTED",
  "SUSPENDED",
  "UNDER_REVIEW",
  "REQUESTED",
];

export function mostUrgentCapability(
  records: readonly CapabilityRecord[],
): CapabilityRecord | null {
  for (const status of ATTENTION_ORDER) {
    const match = records.find((record) => readCapabilityStatus(record.status) === status);
    if (match) return match;
  }
  return null;
}
