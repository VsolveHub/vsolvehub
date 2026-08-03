import { type Stage, isCommitted, sequenceContains } from "./stages";

/**
 * Workspace state and the guards that protect every transition.
 *
 * The machine stores customer *intent* plus *server verdicts* — a window id,
 * whether the address is serviceable. It never stores server payloads: prices,
 * durations and deadlines live in TanStack Query, where they carry a freshness
 * tier. A price copied into this reducer is a price that survives its own
 * expiry.
 *
 * Every rule in F2's acceptance list is expressed here rather than in a
 * component, which is what makes it testable without a browser.
 */

/** Task lines are the A1 unit of scope: what the customer buys (ADR-008). */
export interface TaskLine {
  taskCode: string;
  quantity: number;
}

/**
 * Variant rules read from the published catalog endpoint.
 *
 * Duration is deliberately absent. Under A1 the server derives an estimate from
 * the selected task lines; it is not a customer input and not a price input, so
 * there is nothing here for the customer to be guarded against.
 */
export interface VariantRules {
  variantId: string;
  variantCode: string;
  /** Question codes the customer must answer before leaving the scope stage. */
  requiredQuestionCodes: readonly string[];
  /** Task codes this variant can sell, from the catalog's task rates. */
  availableTaskCodes: readonly string[];
}

export interface ConfirmedAddress {
  id: string;
  postalCode: string;
  /**
   * Whether the address resolved to coordinates.
   *
   * M1 home-service work does not require a geocode to book — travel feasibility
   * is estimated from the service area. It is recorded because a missing pin is
   * worth surfacing to the Partner before departure
   * ([06 §Before departure](../../../../../../Django_Next.js_Plan/06-fulfilment-safety-quality-and-disputes.md)),
   * not because it gates the customer.
   */
  isGeocoded: boolean;
  /** Verdict from `/serviceability/check/`, not an assumption. */
  isServiceable: boolean;
}

export interface WorkspaceState {
  serviceSlug: string;
  rules: VariantRules | null;
  stage: Stage;
  /** Stages the customer has completed, for predictable back navigation. */
  visited: readonly Stage[];
  address: ConfirmedAddress | null;
  answers: Readonly<Record<string, unknown>>;
  notes: string;
  /** What the customer is buying. Empty until they choose (nothing preselected). */
  taskLines: readonly TaskLine[];
  /** Null until chosen. No window is ever auto-selected — F2 criterion. */
  windowId: string | null;
  /**
   * Where to return once the customer has logged in.
   *
   * Login is an interrupt, not a step the customer walks through: it is raised
   * from whichever stage first needs a session, and it hands control straight
   * back. Recording the origin is what makes "resume without losing anything"
   * a property of the machine rather than of whichever component happened to
   * trigger it.
   */
  resumeStage: Stage | null;
}

/**
 * @param initialStage Where the workspace opens.
 *
 * Configurable because the workspace no longer owns the whole journey. Address
 * and timing are confirmed once for a Booking Group rather than once per
 * service, so this reducer's job on `/book/[service]` is scope alone; the stage
 * list and its guards stay intact because they still describe the ordering that
 * has to hold.
 */
export function initialState(
  serviceSlug: string,
  initialStage: Stage = "address",
): WorkspaceState {
  return {
    serviceSlug,
    rules: null,
    stage: initialStage,
    visited: [],
    address: null,
    answers: {},
    notes: "",
    taskLines: [],
    windowId: null,
    resumeStage: null,
  };
}

/**
 * Why the customer cannot leave the current stage.
 *
 * A code rather than a sentence, so the copy lives with the view and stays
 * translatable, and so tests assert on the rule rather than on wording.
 */
export type BlockReason =
  | "ADDRESS_NOT_CONFIRMED"
  | "ADDRESS_NOT_SERVICEABLE"
  | "NO_TASK_SELECTED"
  | "REQUIRED_QUESTION_UNANSWERED"
  | "WINDOW_NOT_CHOSEN"
  | "CONFIGURATION_NOT_LOADED";

/** True when `value` counts as an answer. Empty string and [] do not. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Total units across all task lines. Zero means nothing has been chosen. */
export function totalTaskQuantity(state: WorkspaceState): number {
  return state.taskLines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Whether the customer may leave `state.stage`, and why not if they may not.
 *
 * Returns null when the transition is allowed.
 */
export function blockedReason(state: WorkspaceState): BlockReason | null {
  const { stage, rules, address } = state;

  switch (stage) {
    case "address":
      if (address === null) return "ADDRESS_NOT_CONFIRMED";
      if (!address.isServiceable) return "ADDRESS_NOT_SERVICEABLE";
      return null;

    case "scope": {
      if (rules === null) return "CONFIGURATION_NOT_LOADED";
      if (totalTaskQuantity(state) === 0) return "NO_TASK_SELECTED";
      const unanswered = rules.requiredQuestionCodes.some(
        (code) => !isAnswered(state.answers[code]),
      );
      return unanswered ? "REQUIRED_QUESTION_UNANSWERED" : null;
    }

    case "window":
      return state.windowId === null ? "WINDOW_NOT_CHOSEN" : null;

    case "review":
      // Re-asserted rather than trusted from the address stage, because the
      // customer can go back and change it between here and there.
      if (address === null) return "ADDRESS_NOT_CONFIRMED";
      if (!address.isServiceable) return "ADDRESS_NOT_SERVICEABLE";
      return null;

    default:
      return null;
  }
}

export function canAdvance(state: WorkspaceState): boolean {
  return blockedReason(state) === null;
}

/**
 * Whether a stage is reachable for navigation.
 *
 * Backwards to a visited stage is allowed — F2 requires predictable back
 * navigation and state preservation. Forwards is not: a customer cannot jump to
 * review and skip a guard.
 *
 * Once the Partner search has begun, backwards is refused as well. A Partner has
 * been offered real work by then, and editing the thing they were offered
 * behind their back is how a customer ends up with a Partner committed to a job
 * that no longer exists.
 */
export function canNavigateTo(state: WorkspaceState, target: Stage): boolean {
  if (target === state.stage) return true;
  if (!sequenceContains(target)) return false;
  if (isCommitted(state.stage)) return false;
  return state.visited.includes(target);
}
