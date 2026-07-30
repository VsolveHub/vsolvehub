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

export function describeError(
  error: unknown,
  operation: OperationKind = "read",
): ErrorPresentation {
  const stateChange = inferStateChange(error, operation);

  if (error instanceof ApiRequestError) {
    const action = ACTION_COPY[error.recovery];
    return {
      titleKey: `error.code.${error.code}.title`,
      title: titleForRecovery(error.recovery),
      // The server's message is customer-safe by contract, so it is preferred
      // over a generic client string.
      messageKey: `error.code.${error.code}.message`,
      message: `${error.message}${reassurance(stateChange, operation)}`,
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

export { isApiClientError };
