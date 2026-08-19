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

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { requirementReducer, type RequirementAction } from "../model/machine";
import { SCREENS, type Screen } from "../model/screens";
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
  /**
   * Navigate to any screen, visited or not.
   *
   * For the desktop brief, where the rail *is* the navigation and every
   * section is a button. `goTo` refuses forward moves — correct for the
   * phone wizard, and the reason the rail's own controls did nothing.
   */
  open: (screen: Screen) => void;
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
  /**
   * Optional on the way in, because entries written while this was a boolean
   * still have to restore. A draft persisted before the change carries
   * `isDateFlexible` and no day count; it restores as "exact" rather than
   * throwing away the rest of the brief.
   */
  flexibilityDays?: number;
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

/** The query parameter carrying the current step. */
const STEP_PARAM = "step";

/** Whether a query value names a screen this build has. */
function isScreen(value: string): value is Screen {
  return (SCREENS as readonly string[]).includes(value);
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
    flexibilityDays: state.flexibilityDays,
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
      flexibilityDays: intent.flexibilityDays ?? 0,
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

  /**
   * The step lives in the URL, so a reload lands where the Customer was.
   *
   * The answers were already persisted; the *screen* was not, so refreshing on
   * step 3 restored everything the Customer had typed and then put them back on
   * step 1 to walk through it again. That reads as having lost the form even
   * though nothing was lost.
   *
   * The URL rather than the same sessionStorage entry, for two reasons. It is
   * where navigation state belongs — the browser's own Back button now moves
   * through the wizard instead of leaving the flow entirely, which is what a
   * phone's back gesture does. And it is shareable and restorable across tabs,
   * where a session entry is neither.
   *
   * `replace`, not `push`: the reducer's own Back already pushes a history entry
   * through this effect, and pushing again would make one tap of Back move half
   * a step.
   */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get(STEP_PARAM);

  // Read once, on mount. After that the reducer is the source of truth and the
  // effect below only writes — otherwise a `replace` would feed back in as a
  // restore and the two would fight.
  //
  // Deliberately **not** dependent on `state`: at this point the intent restore
  // above has dispatched but React has not re-rendered, so `state` here is still
  // the empty initial draft. Reading it to decide reachability is what made the
  // first attempt at this silently do nothing. `RESTORE_SCREEN` carries the
  // decision into the reducer, where the post-restore state actually exists.
  const restoredStep = useRef(false);
  useEffect(() => {
    if (restoredStep.current) return;
    restoredStep.current = true;
    if (stepParam === null || !isScreen(stepParam)) return;
    dispatch({ type: "RESTORE_SCREEN", screen: stepParam });
    // Mount only. `stepParam` changes on every step from here on and re-running
    // would fight the writer below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restoredStep.current) return;
    if (stepParam === state.screen) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(STEP_PARAM, state.screen);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, state.screen, stepParam]);

  const blocked = blockedReason(state, today, hasUnresolvedDuplicate);

  const goTo = useCallback((screen: Screen) => dispatch({ type: "GO_TO", screen }), []);
  const open = useCallback((screen: Screen) => dispatch({ type: "OPEN", screen }), []);
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
      open,
      advance,
      back,
    }),
    [state, blocked, today, hasUnresolvedDuplicate, goTo, open, advance, back],
  );

  return <RequirementContext.Provider value={value}>{children}</RequirementContext.Provider>;
}
