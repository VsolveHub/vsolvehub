import {
  ApiContractError,
  ApiNetworkError,
  ApiRequestError,
  isApiClientError,
  type RecoveryIntent,
} from "@vsolve/api-client";

/**
 * Turns a thrown API error into something a screen can render honestly.
 *
 * Plan document 03 requires every error to answer three questions:
 *   1. What happened.
 *   2. Whether money or booking state changed.
 *   3. What the customer can do next.
 *
 * Point 2 is the one that is normally skipped and the one that causes support
 * load. A failed request on a payment mutation is genuinely ambiguous — the
 * charge may have succeeded before the connection dropped — so this reports
 * `unknown` rather than guessing "not charged".
 *
 * Copy carries a stable `messageKey` alongside an English default so B1 can add
 * Telugu and Hindi without touching call sites (plan 09 §15).
 */

/** What the caller knows about the operation that failed. */
export type OperationKind =
  /** A read. Failing changes nothing. */
  | "read"
  /** A non-financial write: address, availability, profile. */
  | "mutation"
  /** A write with financial or capacity effect: checkout, payment, payout. */
  | "financial";

/** Whether server-side state may have changed despite the error. */
export type StateChange =
  /** Nothing was submitted or nothing was applied. Safe to say "not charged". */
  | "none"
  /** The request may or may not have been applied. Never claim either way. */
  | "unknown"
  /** State definitively changed, and the error describes the new state. */
  | "changed";

export interface RecoveryAction {
  intent: RecoveryIntent;
  messageKey: string;
  label: string;
}

export interface ErrorPresentation {
  /** Short statement of what happened. */
  titleKey: string;
  title: string;
  /** Sentence explaining the situation and, where safe, that nothing changed. */
  messageKey: string;
  message: string;
  stateChange: StateChange;
  /** Primary recovery affordance, or null when only support can help. */
  action: RecoveryAction | null;
  /** Backend correlation id to show alongside a support path. */
  reference: string | null;
  severity: "error" | "warning" | "info";
}

const ACTION_COPY: Record<RecoveryIntent, { messageKey: string; label: string }> = {
  retry: { messageKey: "error.action.retry", label: "Try again" },
  reauthenticate: { messageKey: "error.action.login", label: "Log in again" },
  choose_again: { messageKey: "error.action.chooseAgain", label: "Choose another option" },
  add_payment_method: { messageKey: "error.action.addPayment", label: "Add a payment method" },
  fix_input: { messageKey: "error.action.fixInput", label: "Review your details" },
  await_confirmation: { messageKey: "error.action.checkStatus", label: "Check status" },
  contact_support: { messageKey: "error.action.support", label: "Contact support" },
};

/**
 * A financial mutation that failed in transit is ambiguous, because the request
 * may have reached Django before the connection dropped. Anything else that
 * failed in transit never arrived.
 */
function inferStateChange(error: unknown, operation: OperationKind): StateChange {
  if (error instanceof ApiRequestError) {
    // The server answered, so it applied its own rules. A 409 describes a state
    // that already changed on the server side; everything else was rejected.
    return error.status === 409 ? "changed" : "none";
  }
  if (error instanceof ApiNetworkError || error instanceof ApiContractError) {
    return operation === "financial" ? "unknown" : "none";
  }
  return operation === "financial" ? "unknown" : "none";
}

function reassurance(stateChange: StateChange, operation: OperationKind): string {
  if (operation === "read") return "";
  if (stateChange === "none") return " You have not been charged.";
  if (stateChange === "unknown") {
    return " We are confirming whether your payment went through — do not pay again yet.";
  }
  return "";
}

/**
 * Product copy for A7/A9 (and related) domain codes. Prefer these over the
 * backend `message` so partners and customers never see raw API text.
 */
const FRIENDLY_DOMAIN_MESSAGES: Record<string, { title: string; message: string }> = {
  min_stay_not_met: {
    title: "Stay is too short",
    message: "This property needs a longer stay. Pick dates that meet the minimum nights.",
  },
  dates_unavailable: {
    title: "Dates not available",
    message: "Those dates sit outside when this property can be booked. Try another range.",
  },
  out_of_stock: {
    title: "Out of stock",
    message: "Nothing is left to rent for those dates. Try different dates or another listing.",
  },
  insufficient_quantity: {
    title: "Not enough stock",
    message: "There is not enough quantity available for those dates.",
  },
  handover_pin_invalid: {
    title: "Incorrect PIN",
    message: "That handover PIN does not match. Ask the customer to confirm their PIN and try again.",
  },
  rental_state_invalid: {
    title: "That step is not available",
    message: "This rental cannot move to that step right now. Refresh and check the booking status.",
  },
  stay_state_invalid: {
    title: "That step is not available",
    message: "This stay cannot move to that step right now. Refresh and try again.",
  },
};

/** Customer-facing sentence for a thrown error — never the raw backend blob. */
export function friendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof ApiRequestError) {
    const mapped = FRIENDLY_DOMAIN_MESSAGES[error.code];
    if (mapped) return mapped.message;
    // Known domain codes without a map still avoid dumping nested details.
    if (error.code && error.code !== "validation_error") {
      return error.message || fallback;
    }
    if (Object.keys(error.fieldErrors).length > 0) {
      return "Check the highlighted fields and try again.";
    }
    return fallback;
  }
  return describeError(error, "mutation").message || fallback;
}

export function describeError(
  error: unknown,
  operation: OperationKind = "read",
): ErrorPresentation {
  const stateChange = inferStateChange(error, operation);

  if (error instanceof ApiRequestError) {
    const action = ACTION_COPY[error.recovery];
    const mapped = FRIENDLY_DOMAIN_MESSAGES[error.code];
    return {
      titleKey: `error.code.${error.code}.title`,
      title: mapped?.title ?? titleForRecovery(error.recovery),
      messageKey: `error.code.${error.code}.message`,
      message: `${mapped?.message ?? (error.code === "validation_error" ? "Check the highlighted fields and try again." : error.message)}${reassurance(stateChange, operation)}`,
      stateChange,
      action: { intent: error.recovery, ...action },
      reference: error.requestId,
      severity: error.recovery === "await_confirmation" ? "info" : "error",
    };
  }

  if (error instanceof ApiNetworkError) {
    const intent: RecoveryIntent = stateChange === "unknown" ? "await_confirmation" : "retry";
    return {
      titleKey: "error.network.title",
      title: "Connection lost",
      messageKey: "error.network.message",
      message:
        "We could not reach Vsolve Hub." +
        (stateChange === "unknown"
          ? " We are confirming whether your payment went through — do not pay again yet."
          : " Nothing was submitted. Check your connection and try again."),
      stateChange,
      action: { intent, ...ACTION_COPY[intent] },
      reference: null,
      severity: stateChange === "unknown" ? "warning" : "error",
    };
  }

  if (error instanceof ApiContractError) {
    return {
      titleKey: "error.unexpected.title",
      title: "Something went wrong on our side",
      messageKey: "error.unexpected.message",
      message: `${error.message}${reassurance(stateChange, operation)}`,
      stateChange,
      action: { intent: error.recovery, ...ACTION_COPY[error.recovery] },
      reference: null,
      severity: "error",
    };
  }

  // Not an API error at all — a rendering or programming fault that reached the
  // error boundary. Say so plainly rather than blaming the network.
  return {
    titleKey: "error.unexpected.title",
    title: "Something went wrong",
    messageKey: "error.unexpected.message",
    message:
      "This screen could not be displayed." + reassurance(stateChange, operation),
    stateChange,
    action: { intent: "retry", ...ACTION_COPY.retry },
    reference: null,
    severity: "error",
  };
}

function titleForRecovery(intent: RecoveryIntent): string {
  switch (intent) {
    case "reauthenticate":
      return "Please log in again";
    case "choose_again":
      return "That option is no longer available";
    case "add_payment_method":
      return "Payment method needed";
    case "fix_input":
      return "Check your details";
    case "await_confirmation":
      return "Confirming your payment";
    case "contact_support":
      return "We could not complete this";
    case "retry":
      return "That did not go through";
  }
}

/** True when a field-level form error should be shown instead of a banner. */
export function isFieldError(error: unknown): error is ApiRequestError {
  return (
    error instanceof ApiRequestError &&
    error.recovery === "fix_input" &&
    Object.keys(error.fieldErrors).length > 0
  );
}

/* ---------------------------------------------------------------------------
   Error categories (M2-FE-009)
   --------------------------------------------------------------------------- */

/**
 * Where a failure belongs on screen.
 *
 * `describeError` above answers "what do I say"; this answers "where does it
 * go". They are separate questions and conflating them is why the same refusal
 * appears as a red banner on one screen and an inline field message on another.
 *
 * The categories are the seven the M2 plan names, and each one has exactly one
 * treatment:
 *
 * | Category | Treatment |
 * |---|---|
 * | `field` | Message under the offending input; no banner |
 * | `stale` | Refetch, then re-render — the screen is showing an old world |
 * | `pending` | Non-error waiting state; never an error banner, never a retry |
 * | `expired` | The action is gone for good; offer the next honest step |
 * | `conflict` | Someone else got there first; re-read and choose again |
 * | `forbidden` | Fail closed; do not soften into a retry |
 * | `outage` | Transient; a retry affordance is truthful |
 * | `unexpected` | Everything else, including non-API faults |
 *
 * ## Why `pending` is a category and not a severity
 *
 * `m2_unlock_payment_pending` arrives while INR 149 is in flight. Rendering it
 * beside genuine failures is how a customer concludes the payment failed and
 * pays a second time for one unlock. It is a state, not a fault, and the
 * category is what keeps it out of the error surface entirely.
 *
 * ## An open contract question
 *
 * `m2_unlock_payment_pending` is specified as **202** in
 * `M2/07-state-machines-and-permissions.md` §8. A 202 is `response.ok`, so
 * whether it reaches this function at all depends on how the published OpenAPI
 * declares it: as an error response it throws and lands here; as a success
 * response it returns through `unwrap` as ordinary data and never does. Raised
 * as an open question in `contracts/proposals/0012-m2-capability-and-requirement-surface.md`.
 * Until it is answered this classifies the thrown form only — no speculative
 * payload sniffing.
 */
export type ErrorCategory =
  | "field"
  | "stale"
  | "pending"
  | "expired"
  | "conflict"
  | "forbidden"
  | "outage"
  | "unexpected";

/**
 * Codes whose category the status alone would get wrong.
 *
 * Only entries that genuinely disagree with `categorizeByStatus` belong here.
 * A code that a 409 already classifies as `conflict` is left out rather than
 * restated — a second copy of an agreeing rule is one more thing to keep in
 * sync, and it hides the ones that matter.
 */
const CATEGORY_BY_CODE: Record<string, ErrorCategory> = {
  // Version conflicts are the screen being out of date, not two people racing.
  // The fix is a refetch and a re-render, not "choose something else".
  partner_application_version_conflict: "stale",

  // 202, and a waiting state rather than a failure. See the note above.
  m2_unlock_payment_pending: "pending",
  // Not yet purchasable because no usable quote exists — the customer waits for
  // vendors, they have not done anything wrong.
  m2_unlock_not_available: "pending",
  // Both parties must confirm; the first confirmation succeeded and is waiting.
  m2_cancellation_needs_confirmation: "pending",

  // 409s that are a deadline passing rather than a race. The distinction is the
  // recovery: a conflict is re-read and retry, an expiry never comes back.
  m2_requirement_expired: "expired",
  m2_invitation_expired: "expired",
  m2_reconfirmation_expired: "expired",

  // 409 because the record moved on, but the screen is what is out of date.
  m2_requirement_locked: "stale",
  m2_proposal_not_selectable: "stale",

  // The progressive-KYC gates are 403 but they are unfinished forms, not
  // denials, and routing them to a locked-out screen is how a Partner four
  // fields from working concludes their account is broken.
  m2_kyc_required: "field",
  m2_payout_details_required: "field",
  m2_crew_roster_required: "field",
};

function categorizeByStatus(status: number): ErrorCategory {
  if (status === 400 || status === 422) return "field";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 404) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 408 || status === 425 || status === 429) return "outage";
  if (status >= 500) return "outage";
  return "unexpected";
}

/**
 * Classifies a thrown API failure into the one surface that should show it.
 *
 * Code first, then status. The code is the server's own name for what happened
 * and outranks the status class it happened to be carried on — several M2
 * refusals share status 409 while needing three different screens.
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof ApiRequestError) {
    const byCode = CATEGORY_BY_CODE[error.code];
    if (byCode) return byCode;
    // A validation envelope with addressable fields belongs under the inputs
    // whatever status carried it.
    if (Object.keys(error.fieldErrors).length > 0) return "field";
    return categorizeByStatus(error.status);
  }

  // Never reached the server, or reached something that is not the API. Both are
  // transient infrastructure faults from the user's point of view.
  if (error instanceof ApiNetworkError) return "outage";
  if (error instanceof ApiContractError) {
    return error.isTransportRetryable ? "outage" : "unexpected";
  }

  return "unexpected";
}

/**
 * True when the category means "we are waiting", not "this failed".
 *
 * The guard a payment screen checks before it is allowed to render anything
 * that looks like a failure.
 */
export function isPendingCategory(category: ErrorCategory): boolean {
  return category === "pending";
}

export { isApiClientError };
