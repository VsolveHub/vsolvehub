import { type Stage, isCommitted, nextStage, previousStage } from "./stages";
import {
  type ConfirmedAddress,
  type TaskLine,
  type VariantRules,
  type WorkspaceState,
  canAdvance,
  canNavigateTo,
} from "./state";

/**
 * The workspace reducer.
 *
 * Two things here are load-bearing beyond ordinary state management:
 *
 * 1. **Invalidation cascades.** Availability was searched for a specific address
 *    and a specific set of task lines — a window found for one 30-minute task is
 *    not a window for three of them. Every input that changes a server answer
 *    clears what that answer produced. Leaving them behind is how a UI ends up
 *    holding a window for a booking that no longer matches it.
 *
 * 2. **Unavailable windows cannot be recorded at all.** Rather than storing a
 *    selection and blocking on it later, `SELECT_WINDOW` refuses. "No unavailable
 *    window allows progression" then holds because the state to progress from
 *    cannot exist.
 */

export type WorkspaceAction =
  /** Variant configuration arrived from the published catalog endpoint. */
  | { type: "CONFIGURE"; rules: VariantRules }
  | { type: "SET_ADDRESS"; address: ConfirmedAddress }
  | { type: "ANSWER"; questionCode: string; value: unknown }
  | { type: "SET_TASK_QUANTITY"; taskCode: string; quantity: number }
  | { type: "SET_NOTES"; notes: string }
  /**
   * Persisted customer intent, replayed once after the client has mounted.
   *
   * Restoration is an action rather than a reducer initializer because the
   * initializer runs during render, and on the server there is no
   * `sessionStorage` to run it against. An initializer that reads storage
   * therefore produces one tree on the server and a different one on the first
   * client render — the classic hydration mismatch, which React resolves by
   * silently discarding the client tree. Making it a transition means both
   * renders start from `initialState` and the restore is a second, deliberate
   * commit that React is expecting.
   *
   * Only customer intent travels. No address, window, price or deadline: those
   * are server verdicts with an expiry, and replaying one would put a claim on
   * screen that the server has already withdrawn.
   */
  | {
      type: "RESTORE_INTENT";
      answers: Readonly<Record<string, unknown>>;
      notes: string;
      taskLines: readonly TaskLine[];
    }
  | { type: "SELECT_WINDOW"; windowId: string; isAvailable: boolean }
  /** The window was taken before checkout could claim it. Returns to selection. */
  | { type: "WINDOW_LOST" }
  /**
   * A signed-in action was reached while anonymous, or the session ended
   * mid-booking. `returnTo` is where the customer is put back afterwards.
   */
  | { type: "REQUIRE_LOGIN"; returnTo: Stage }
  /** Django established a session. Hands control back to the origin stage. */
  | { type: "LOGIN_COMPLETED" }
  | { type: "ADVANCE" }
  | { type: "BACK" }
  | { type: "GO_TO_STAGE"; stage: Stage };

/** Stages whose answers depend on the address and the chosen task lines. */
const AVAILABILITY_DERIVED_STAGES: readonly Stage[] = ["window", "review"];

/** Everything derived from a specific address and set of task lines. */
function clearAvailabilityDerived(state: WorkspaceState): WorkspaceState {
  return { ...state, windowId: null };
}

/**
 * Drops stages the customer can no longer be said to have completed.
 *
 * Without this, changing the address after reaching review would leave `window`
 * in `visited`, and `canNavigateTo` would happily send them back to a stage
 * whose answer has just been thrown away.
 */
function forgetVisitedFrom(
  state: WorkspaceState,
  stages: readonly Stage[],
): readonly Stage[] {
  return state.visited.filter((stage) => !stages.includes(stage));
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  // Once a Partner has been offered the job, the configuration they accepted is
  // no longer the customer's to edit. Changes from here go through the booking
  // amendment or reschedule commands, which are Partner-visible by design.
  // Advancing is the one thing still permitted: the search resolves, payment
  // succeeds, the booking confirms.
  if (isCommitted(state.stage) && action.type !== "ADVANCE") return state;

  switch (action.type) {
    case "CONFIGURE":
      return { ...state, rules: action.rules };

    case "SET_ADDRESS": {
      const unchanged =
        state.address !== null &&
        state.address.id === action.address.id &&
        state.address.isGeocoded === action.address.isGeocoded &&
        state.address.isServiceable === action.address.isServiceable;

      if (unchanged) return state;

      // A new address means a new service area, new travel times and a new
      // eligible pool; nothing downstream survives it.
      return {
        ...clearAvailabilityDerived(state),
        address: action.address,
        visited: forgetVisitedFrom(state, AVAILABILITY_DERIVED_STAGES),
      };
    }

    case "ANSWER":
      return {
        ...state,
        answers: { ...state.answers, [action.questionCode]: action.value },
      };

    case "SET_TASK_QUANTITY": {
      const quantity = Math.max(0, Math.trunc(action.quantity));
      const existing = state.taskLines.find((line) => line.taskCode === action.taskCode);
      if ((existing?.quantity ?? 0) === quantity) return state;

      const taskLines: TaskLine[] = state.taskLines.filter(
        (line) => line.taskCode !== action.taskCode,
      );
      if (quantity > 0) taskLines.push({ taskCode: action.taskCode, quantity });

      // Task lines drive the duration estimate, which drives the availability
      // search. A window found for one task is not a window for three.
      return {
        ...clearAvailabilityDerived(state),
        taskLines,
        visited: forgetVisitedFrom(state, AVAILABILITY_DERIVED_STAGES),
      };
    }

    case "SET_NOTES":
      return { ...state, notes: action.notes };

    case "RESTORE_INTENT":
      // Restoring what the customer already chose is not a change to it, so
      // nothing availability-derived is cleared here: there is nothing derived
      // yet. It is refused once anything has been answered, because a late
      // restore would then overwrite live work with a stale snapshot.
      if (Object.keys(state.answers).length > 0 || state.taskLines.length > 0) return state;
      return {
        ...state,
        answers: action.answers,
        notes: action.notes,
        taskLines: [...action.taskLines],
      };

    case "SELECT_WINDOW": {
      // The refusal that makes the acceptance criterion structural.
      if (!action.isAvailable) return state;
      if (state.windowId === action.windowId) return state;
      return {
        ...state,
        windowId: action.windowId,
        visited: forgetVisitedFrom(state, ["review"]),
      };
    }

    case "WINDOW_LOST":
      // Nothing was charged — the customer simply chooses another time. Send
      // them back to the stage that can fix it.
      return {
        ...state,
        windowId: null,
        stage: "window",
        visited: forgetVisitedFrom(state, ["window", "review"]),
      };

    case "REQUIRE_LOGIN": {
      if (state.stage === "login") return state;
      // Nothing the customer has configured is touched. That is the whole point
      // of the action: an interruption must not cost them the form.
      return {
        ...state,
        stage: "login",
        resumeStage: action.returnTo,
        visited: remember(state.visited, state.stage),
      };
    }

    case "LOGIN_COMPLETED": {
      if (state.stage !== "login" || state.resumeStage === null) return state;
      return { ...state, stage: state.resumeStage, resumeStage: null };
    }

    case "ADVANCE": {
      // Login is left by LOGIN_COMPLETED and by nothing else. Letting the
      // ordinary Continue advance past it would walk an unauthenticated
      // customer straight into the Partner search.
      if (state.stage === "login") return state;
      if (!canAdvance(state)) return state;
      const target = nextStage(state.stage);
      if (target === null) return state;
      return { ...state, stage: target, visited: remember(state.visited, state.stage) };
    }

    case "BACK": {
      // Symmetric with `canNavigateTo`: no way back out of a committed stage.
      if (isCommitted(state.stage)) return state;

      // Backing out of login is cancelling it, so it returns to where the
      // interrupt was raised — which is rarely the stage that precedes login in
      // the sequence.
      if (state.stage === "login" && state.resumeStage !== null) {
        return { ...state, stage: state.resumeStage, resumeStage: null };
      }

      const target = previousStage(state.stage);
      if (target === null) return state;
      return { ...state, stage: target };
    }

    case "GO_TO_STAGE": {
      if (!canNavigateTo(state, action.stage)) return state;
      return { ...state, stage: action.stage };
    }

    default:
      return state;
  }
}

function remember(visited: readonly Stage[], stage: Stage): readonly Stage[] {
  return visited.includes(stage) ? visited : [...visited, stage];
}
