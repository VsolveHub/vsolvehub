import type { FulfilmentType } from "../contract-pending/types";
import { type Stage, sequenceContains } from "./stages";

/**
 * Workspace state and the guards that protect every transition.
 *
 * The machine stores customer *intent* plus *references and verdicts* — a slot
 * id, a hold id, whether the pre-check passed. It never stores server payloads:
 * expiry timestamps, prices and availability live in TanStack Query, where they
 * carry a freshness tier. A price copied into this reducer is a price that
 * survives its own expiry.
 *
 * Every rule in B3's acceptance list is expressed here rather than in a
 * component, which is what makes it testable without a browser.
 */

/** Duration and question requirements, read from the published variant config. */
export interface VariantRules {
  variantId: string;
  variantCode: string;
  minimumDurationMinutes: number;
  maximumDurationMinutes: number;
  durationIncrementMinutes: number;
  recommendedDurationMinutes: number;
  /** Question codes the customer must answer before leaving the scope stage. */
  requiredQuestionCodes: readonly string[];
}

export interface ConfirmedAddress {
  id: string;
  postalCode: string;
  /**
   * Whether the address resolved to coordinates. Doc 11 §2.1 makes this a hard
   * precondition for Instant: proximity ranking and the pool pre-check are both
   * computed from the customer's location, so there is nothing to rank without
   * it.
   */
  isGeocoded: boolean;
  /** Verdict from `/serviceability/check/`, not an assumption. */
  isServiceable: boolean;
}

export type ProviderChoice =
  | { kind: "auto" }
  | { kind: "partner"; partnerId: string };

/** Whether the Instant pool pre-check has been run, and what it said. */
export type PreCheckVerdict = "unknown" | "passed" | "refused";

export interface WorkspaceState {
  serviceSlug: string;
  rules: VariantRules | null;
  /** Null until the customer chooses. Nothing is preselected — B3 criterion. */
  fulfilment: FulfilmentType | null;
  stage: Stage;
  /** Stages the customer has completed, for predictable back navigation. */
  visited: readonly Stage[];
  address: ConfirmedAddress | null;
  answers: Readonly<Record<string, unknown>>;
  notes: string;
  quantity: number;
  /** Null until chosen. No slot is ever auto-selected — B3 criterion. */
  slotId: string | null;
  provider: ProviderChoice | null;
  holdId: string | null;
  preCheck: PreCheckVerdict;
}

export function initialState(serviceSlug: string): WorkspaceState {
  return {
    serviceSlug,
    rules: null,
    fulfilment: null,
    stage: "address",
    visited: [],
    address: null,
    answers: {},
    notes: "",
    quantity: 1,
    slotId: null,
    provider: null,
    holdId: null,
    preCheck: "unknown",
  };
}

/**
 * Why the customer cannot leave the current stage.
 *
 * A code rather than a sentence, so the copy lives with the view and stays
 * translatable, and so tests assert on the rule rather than on wording.
 */
export type BlockReason =
  | "FULFILMENT_NOT_CHOSEN"
  | "ADDRESS_NOT_CONFIRMED"
  | "ADDRESS_NOT_SERVICEABLE"
  | "ADDRESS_NOT_GEOCODED"
  | "REQUIRED_QUESTION_UNANSWERED"
  | "DURATION_OUT_OF_BOUNDS"
  | "SLOT_NOT_CHOSEN"
  | "PROVIDER_NOT_CHOSEN"
  | "HOLD_NOT_HELD"
  | "PRECHECK_NOT_PASSED"
  | "CONFIGURATION_NOT_LOADED";

/** True when `value` counts as an answer. Empty string and [] do not. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Duration must sit within the variant's bounds and on a configured increment.
 *
 * The increment check matters: doc 03 §4 specifies 30-minute steps, and a
 * duration of 75 minutes would produce an availability search the backend cannot
 * satisfy and a price nobody quoted.
 */
export function isValidDuration(minutes: number | null, rules: VariantRules | null): boolean {
  if (rules === null || minutes === null) return false;
  if (minutes < rules.minimumDurationMinutes) return false;
  if (minutes > rules.maximumDurationMinutes) return false;
  const offset = minutes - rules.minimumDurationMinutes;
  return offset % rules.durationIncrementMinutes === 0;
}

export function durationOptions(rules: VariantRules | null): number[] {
  if (rules === null) return [];
  const options: number[] = [];
  for (
    let minutes = rules.minimumDurationMinutes;
    minutes <= rules.maximumDurationMinutes;
    minutes += rules.durationIncrementMinutes
  ) {
    options.push(minutes);
  }
  return options;
}

/**
 * The Instant address gate (doc 11 §2.1).
 *
 * Separate from the address stage's own guard because it is a different claim:
 * the stage guard says the customer answered, this says the answer is still good
 * enough to charge against. Instant is refused without it; Scheduled may proceed
 * on a serviceable address that never geocoded.
 */
export function satisfiesInstantAddressGate(state: WorkspaceState): boolean {
  const { address } = state;
  return address !== null && address.isGeocoded && address.isServiceable;
}

/** The currently selected duration, or null when the customer has not set one. */
export function selectedDuration(state: WorkspaceState): number | null {
  const value = state.answers[DURATION_ANSWER_KEY];
  return typeof value === "number" ? value : null;
}

/**
 * Duration is held in `answers` under a reserved key rather than its own field.
 *
 * It is a customer choice within configured bounds, exactly like a scope answer,
 * and keeping it there means one persistence path and one invalidation path
 * instead of two that can drift.
 */
export const DURATION_ANSWER_KEY = "__duration_minutes";

/**
 * Whether the customer may leave `state.stage`, and why not if they may not.
 *
 * Returns null when the transition is allowed.
 */
export function blockedReason(state: WorkspaceState): BlockReason | null {
  const { stage, fulfilment, rules, address } = state;

  switch (stage) {
    case "address":
      if (address === null) return "ADDRESS_NOT_CONFIRMED";
      if (!address.isServiceable) return "ADDRESS_NOT_SERVICEABLE";
      return null;

    case "type":
      return fulfilment === null ? "FULFILMENT_NOT_CHOSEN" : null;

    case "scope": {
      if (rules === null) return "CONFIGURATION_NOT_LOADED";
      const unanswered = rules.requiredQuestionCodes.some(
        (code) => !isAnswered(state.answers[code]),
      );
      return unanswered ? "REQUIRED_QUESTION_UNANSWERED" : null;
    }

    case "duration":
      if (rules === null) return "CONFIGURATION_NOT_LOADED";
      return isValidDuration(selectedDuration(state), rules)
        ? null
        : "DURATION_OUT_OF_BOUNDS";

    case "slot":
      return state.slotId === null ? "SLOT_NOT_CHOSEN" : null;

    case "provider":
      return state.provider === null ? "PROVIDER_NOT_CHOSEN" : null;

    case "hold":
      return state.holdId === null ? "HOLD_NOT_HELD" : null;

    case "precheck":
      // The Instant address gate is checked before the pre-check verdict so the
      // customer is told the real problem: a missing geocode is not "no
      // professionals available", and conflating them sends them to reschedule
      // when they need to fix their address.
      if (address === null) return "ADDRESS_NOT_CONFIRMED";
      if (!address.isGeocoded) return "ADDRESS_NOT_GEOCODED";
      if (!address.isServiceable) return "ADDRESS_NOT_SERVICEABLE";
      return state.preCheck === "passed" ? null : "PRECHECK_NOT_PASSED";

    case "review":
      // Doc 11 §2.1: Instant must not reach payment without a geocoded
      // serviceable address. Re-asserted at the exit from review rather than
      // trusted from the address stage, because the customer can go back and
      // change it.
      if (fulfilment === "INSTANT" && !satisfiesInstantAddressGate(state)) {
        return address?.isGeocoded === false ? "ADDRESS_NOT_GEOCODED" : "ADDRESS_NOT_SERVICEABLE";
      }
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
 * Backwards to a visited stage is always allowed — doc 03 requires predictable
 * back navigation and state preservation. Forwards is not: a customer cannot
 * jump to review and skip a guard.
 */
export function canNavigateTo(state: WorkspaceState, target: Stage): boolean {
  if (target === state.stage) return true;
  if (state.fulfilment !== null && !sequenceContains(state.fulfilment, target)) return false;
  return state.visited.includes(target);
}
