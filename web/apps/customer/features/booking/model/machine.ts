import type { FulfilmentType } from "../contract-pending/types";
import { type Stage, nextStage, previousStage, sequenceContains } from "./stages";
import {
  DURATION_ANSWER_KEY,
  type ConfirmedAddress,
  type ProviderChoice,
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
 * 1. **Invalidation cascades.** Doc 03 §1: "changing address invalidates slot,
 *    provider and quote holds". The same is true of duration — availability was
 *    searched for a specific length, so a slot found for 60 minutes is not a
 *    slot for 120. Every input that changes a server answer clears what that
 *    answer produced. Leaving them behind is how a UI ends up holding a slot for
 *    a booking that no longer matches it.
 *
 * 2. **Unavailable slots cannot be recorded at all.** Rather than storing a
 *    selection and blocking on it later, `SELECT_SLOT` refuses. "No unavailable
 *    slot allows progression" then holds because the state to progress from
 *    cannot exist.
 */

export type WorkspaceAction =
  /** Variant configuration arrived from the published catalog endpoint. */
  | { type: "CONFIGURE"; rules: VariantRules }
  | { type: "SET_ADDRESS"; address: ConfirmedAddress }
  | { type: "SELECT_FULFILMENT"; fulfilment: FulfilmentType }
  | { type: "ANSWER"; questionCode: string; value: unknown }
  | { type: "SET_DURATION"; minutes: number }
  | { type: "SET_QUANTITY"; quantity: number }
  | { type: "SET_NOTES"; notes: string }
  | { type: "SELECT_SLOT"; slotId: string; isAvailable: boolean }
  | { type: "SELECT_PROVIDER"; provider: ProviderChoice }
  | { type: "HOLD_CREATED"; holdId: string }
  /** The hold expired or the server rejected it. Returns to slot selection. */
  | { type: "HOLD_LOST" }
  | { type: "PRECHECK_RESULT"; canDispatch: boolean }
  | { type: "ADVANCE" }
  | { type: "BACK" }
  | { type: "GO_TO_STAGE"; stage: Stage };

/** Everything derived from a specific address and duration. */
function clearAvailabilityDerived(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    slotId: null,
    provider: null,
    holdId: null,
    preCheck: "unknown",
  };
}

/**
 * Drops stages the customer can no longer be said to have completed.
 *
 * Without this, changing the address after reaching review would leave `slot`
 * in `visited`, and `canNavigateTo` would happily send them back to a stage
 * whose answer has just been thrown away.
 */
function forgetVisitedFrom(
  state: WorkspaceState,
  stages: readonly Stage[],
): readonly Stage[] {
  return state.visited.filter((stage) => !stages.includes(stage));
}

const AVAILABILITY_DERIVED_STAGES: readonly Stage[] = [
  "slot",
  "provider",
  "hold",
  "precheck",
  "review",
];

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "CONFIGURE": {
      // Configuration arriving does not overwrite a duration the customer has
      // already chosen; it only supplies the recommendation for the first visit.
      const hasDuration = typeof state.answers[DURATION_ANSWER_KEY] === "number";
      return {
        ...state,
        rules: action.rules,
        answers: hasDuration
          ? state.answers
          : {
              ...state.answers,
              [DURATION_ANSWER_KEY]: action.rules.recommendedDurationMinutes,
            },
      };
    }

    case "SET_ADDRESS": {
      const unchanged =
        state.address !== null &&
        state.address.id === action.address.id &&
        state.address.isGeocoded === action.address.isGeocoded &&
        state.address.isServiceable === action.address.isServiceable;

      if (unchanged) return state;

      // Doc 03 §1. A new address means a new service area, new travel times and
      // a new eligible pool; nothing downstream survives it.
      return {
        ...clearAvailabilityDerived(state),
        address: action.address,
        visited: forgetVisitedFrom(state, AVAILABILITY_DERIVED_STAGES),
      };
    }

    case "SELECT_FULFILMENT": {
      if (state.fulfilment === action.fulfilment) return state;
      // Switching between Instant and Scheduled changes which sequence applies,
      // so every sequence-specific answer goes.
      return {
        ...clearAvailabilityDerived(state),
        fulfilment: action.fulfilment,
        visited: forgetVisitedFrom(state, AVAILABILITY_DERIVED_STAGES),
      };
    }

    case "ANSWER": {
      if (action.questionCode === DURATION_ANSWER_KEY) return state;
      return {
        ...state,
        answers: { ...state.answers, [action.questionCode]: action.value },
      };
    }

    case "SET_DURATION": {
      if (state.answers[DURATION_ANSWER_KEY] === action.minutes) return state;
      // Availability, eligibility and any hold were all computed for the
      // previous length. See the query-key rule in `contract-pending/keys.ts`.
      return {
        ...clearAvailabilityDerived(state),
        answers: { ...state.answers, [DURATION_ANSWER_KEY]: action.minutes },
        visited: forgetVisitedFrom(state, AVAILABILITY_DERIVED_STAGES),
      };
    }

    case "SET_QUANTITY":
      // Doc 03 §3: notes and photos survive a quantity change. Quantity is
      // same-visit scope, so it reprices but invalidates no capacity.
      return { ...state, quantity: Math.max(1, action.quantity) };

    case "SET_NOTES":
      return { ...state, notes: action.notes };

    case "SELECT_SLOT": {
      // The refusal that makes the acceptance criterion structural.
      if (!action.isAvailable) return state;
      if (state.slotId === action.slotId) return state;
      // A different slot may suit a different set of Partners, so the provider
      // choice and any hold taken against the old slot are dropped.
      return {
        ...state,
        slotId: action.slotId,
        provider: null,
        holdId: null,
        visited: forgetVisitedFrom(state, ["provider", "hold", "review"]),
      };
    }

    case "SELECT_PROVIDER": {
      const unchanged =
        state.provider !== null &&
        state.provider.kind === action.provider.kind &&
        (state.provider.kind !== "partner" ||
          action.provider.kind !== "partner" ||
          state.provider.partnerId === action.provider.partnerId);

      if (unchanged) return state;

      // A hold is provider-specific (doc 03 §5), so choosing someone else
      // releases it.
      return {
        ...state,
        provider: action.provider,
        holdId: null,
        visited: forgetVisitedFrom(state, ["hold", "review"]),
      };
    }

    case "HOLD_CREATED":
      return { ...state, holdId: action.holdId };

    case "HOLD_LOST":
      // Doc 03's error example: the slot was taken, nothing was charged, choose
      // another time. Send them back to the stage that can fix it.
      return {
        ...state,
        holdId: null,
        slotId: null,
        stage: "slot",
        visited: forgetVisitedFrom(state, ["slot", "provider", "hold", "review"]),
      };

    case "PRECHECK_RESULT":
      return { ...state, preCheck: action.canDispatch ? "passed" : "refused" };

    case "ADVANCE": {
      if (!canAdvance(state)) return state;

      // Before a type is chosen there is no sequence to look up, and `address`
      // is the only stage that precedes the choice.
      if (state.fulfilment === null) {
        return state.stage === "address"
          ? { ...state, stage: "type", visited: remember(state.visited, "address") }
          : state;
      }

      const target = nextStage(state.fulfilment, state.stage);
      if (target === null) return state;
      return { ...state, stage: target, visited: remember(state.visited, state.stage) };
    }

    case "BACK": {
      if (state.fulfilment === null) {
        return state.stage === "type" ? { ...state, stage: "address" } : state;
      }
      const target = previousStage(state.fulfilment, state.stage);
      return target === null ? state : { ...state, stage: target };
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

/**
 * Whether an Instant item may be checked out alongside what is already there.
 *
 * Doc 10 §14: an Instant item is one service item in its own checkout and order,
 * and Instant and Scheduled are never mixed. Lives here rather than in the cart
 * layer because it is a rule about the customer's journey, and the workspace is
 * where the customer meets it.
 */
export function instantConflictsWithCart(
  fulfilment: FulfilmentType | null,
  cartFulfilments: readonly FulfilmentType[],
): boolean {
  if (fulfilment === null) return false;
  if (cartFulfilments.length === 0) return false;
  if (fulfilment === "INSTANT") return true;
  return cartFulfilments.includes("INSTANT");
}

/** True when the stage exists in the customer's current sequence. */
export function stageApplies(state: WorkspaceState, stage: Stage): boolean {
  if (state.fulfilment === null) return stage === "address" || stage === "type";
  return sequenceContains(state.fulfilment, stage);
}
