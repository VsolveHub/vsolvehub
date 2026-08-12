"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { requirementReducer, type RequirementAction } from "../model/machine";
import { type Screen } from "../model/screens";
import {
  blockedReason,
  canAdvance,
  initialDraftState,
  type BlockReason,
  type RequirementDraftState,
} from "../model/state";

/**
 * One state container for the whole four-screen requirement.
 *
 * One reducer rather than per-screen state is what makes going back a *screen
 * change* instead of a navigation: nothing remounts, nothing refetches and
 * nothing the Customer typed is lost. `M2-FE-209` asks for save-and-resume, step
 * validation and back navigation, and all three fall out of holding the draft in
 * one place.
 */

interface RequirementContextValue {
  state: RequirementDraftState;
  dispatch: (action: RequirementAction) => void;
  /** Null when the Customer may continue. */
  blocked: BlockReason | null;
  canContinue: boolean;
  /** Today in the Customer's timezone, as an ISO date. */
  today: string;
  goTo: (screen: Screen) => void;
  advance: () => void;
  back: () => void;
}

const RequirementContext = createContext<RequirementContextValue | null>(null);

export function useRequirement(): RequirementContextValue {
  const value = useContext(RequirementContext);
  if (value === null) {
    throw new Error("useRequirement must be used inside <RequirementProvider>");
  }
  return value;
}

/**
 * What is written to sessionStorage.
 *
 * Customer intent only — the same rule the M1 booking workspace follows. No
 * verdict, no requirement id, no attachment:
 *
 * - the **verdict** is the server's reading of an answer set, and replaying one
 *   would show a lifecycle sentence nothing has re-derived;
 * - the **requirement id** would let a restored tab patch a server draft the
 *   Customer may have since submitted or abandoned from another tab;
 * - an **attachment** is a live `File` handle that does not survive a reload, so
 *   restoring its row would show an upload that can never finish.
 *
 * Attachments are the one place this is a visible loss, and it is stated on the
 * details screen rather than hidden.
 */
interface PersistedIntent {
  categorySlug: string;
  answers: Record<string, unknown>;
  addressId: string | null;
  /** Optional on the way in: entries written before "Start from" existed still restore. */
  requestedStart?: string | null;
  serviceBy: string | null;
  isDateFlexible: boolean;
  additionalDetails: string;
  language: string | null;
  /**
   * The four optional extras. Intent, so they travel — and normalised on every
   * read by `readOptionalDetail`, which is what makes trusting this JSON safe.
   *
   * Optional on the way *in*: an entry written by a build that predates the
   * panels is still a perfectly good draft, and refusing to restore it because
   * one key is missing would lose a Customer's answers to a version skew.
   */
  optionalDetails?: Record<string, unknown>;
}

const STORAGE_PREFIX = "vsolve.requirement.";

function storageKey(categorySlug: string): string {
  return `${STORAGE_PREFIX}${categorySlug}`;
}

function readIntent(categorySlug: string): PersistedIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(categorySlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedIntent;
    return parsed.categorySlug === categorySlug ? parsed : null;
  } catch {
    // Corrupt or unavailable storage must never break the flow; the Customer
    // starts the form fresh.
    return null;
  }
}

function writeIntent(state: RequirementDraftState): void {
  if (typeof window === "undefined") return;
  const intent: PersistedIntent = {
    categorySlug: state.categorySlug,
    answers: state.answers,
    addressId: state.addressId,
    requestedStart: state.requestedStart,
    serviceBy: state.serviceBy,
    isDateFlexible: state.isDateFlexible,
    additionalDetails: state.additionalDetails,
    language: state.language,
    optionalDetails: state.optionalDetails,
  };
  try {
    window.sessionStorage.setItem(storageKey(state.categorySlug), JSON.stringify(intent));
  } catch {
    // Private browsing and full quotas both throw. Losing persistence is
    // acceptable; losing the requirement is not.
  }
}

export function clearPersistedRequirement(categorySlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(categorySlug));
  } catch {
    /* nothing to recover from */
  }
}

/** Storage-free, for the hydration reason documented on `RESTORE_INTENT`. */
function start(categorySlug: string): RequirementDraftState {
  return initialDraftState(categorySlug);
}

/**
 * Today, as an ISO date in the browser's timezone.
 *
 * Computed once per mount rather than per render so the guard cannot change
 * underneath a Customer who is mid-form at midnight. The authoritative check is
 * the server's — `service_by` passing is what closes a requirement — so this only
 * needs to stop an obviously dead date being submitted.
 */
function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export interface RequirementProviderProps {
  categorySlug: string;
  /** Whether a probable duplicate is on screen and unresolved. See `M2-FE-210`. */
  hasUnresolvedDuplicate?: boolean;
  children: ReactNode;
}

export function RequirementProvider({
  categorySlug,
  hasUnresolvedDuplicate = false,
  children,
}: RequirementProviderProps) {
  const [state, dispatch] = useReducer(requirementReducer, categorySlug, start);
  const today = useMemo(() => todayIso(), []);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const intent = readIntent(categorySlug);
    if (intent === null) return;
    dispatch({
      type: "RESTORE_INTENT",
      answers: intent.answers,
      addressId: intent.addressId,
      requestedStart: intent.requestedStart ?? null,
      serviceBy: intent.serviceBy,
      isDateFlexible: intent.isDateFlexible,
      additionalDetails: intent.additionalDetails,
      language: intent.language,
      // Older entries predate this field. An absent bag restores as empty
      // rather than as `undefined`, which the reducer would spread into state
      // and every panel would then read through an optional chain it should
      // not need.
      optionalDetails: intent.optionalDetails ?? {},
    });
  }, [categorySlug]);

  useEffect(() => {
    writeIntent(state);
  }, [state]);

  const blocked = blockedReason(state, today, hasUnresolvedDuplicate);

  const goTo = useCallback((screen: Screen) => dispatch({ type: "GO_TO", screen }), []);
  const advance = useCallback(() => dispatch({ type: "ADVANCE" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);

  const value = useMemo<RequirementContextValue>(
    () => ({
      state,
      dispatch,
      blocked,
      canContinue: canAdvance(state, today, hasUnresolvedDuplicate),
      today,
      goTo,
      advance,
      back,
    }),
    [state, blocked, today, hasUnresolvedDuplicate, goTo, advance, back],
  );

  return <RequirementContext.Provider value={value}>{children}</RequirementContext.Provider>;
}
