"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { firstScreen } from "../model/active-screens";
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
 * One state container for the whole three-screen requirement.
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
  /** True after the browser's saved draft has been read once. */
  hasRestoredIntent: boolean;
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
 * Customer intent plus the opaque id of the server draft it belongs to. No
 * verdict:
 *
 * - the **verdict** is the server's reading of an answer set, and replaying one
 *   would show a lifecycle sentence nothing has re-derived;
 * - the **requirement id** is restored so reload resumes the same draft instead
 *   of creating a duplicate. `RequirementFlow` re-reads that id before using it
 *   and leaves the editor when the server says the draft is no longer editable.
 *
 * Entries written by earlier builds carry keys this shape no longer names —
 * `additionalDetails`, `language`, `optionalDetails` — and they parse fine;
 * what is no longer collected is simply no longer read.
 */
interface PersistedIntent {
  categorySlug: string;
  /** Optional for entries written before reload resumed the server draft. */
  requirementId?: string | null;
  answers: Record<string, unknown>;
  addressId: string | null;
  /** Optional on the way in: entries written before "Start from" existed still restore. */
  requestedStart?: string | null;
  /** Optional for entries written before the hard deadline was persisted. */
  serviceBy?: string | null;
  /**
   * Optional on the way in, because entries written while this was a boolean
   * still have to restore. A draft persisted before the change carries
   * `isDateFlexible` and no day count; it restores as "exact" rather than
   * throwing away the rest of the brief.
   */
  flexibilityDays?: number;
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
    requirementId: state.requirementId,
    answers: state.answers,
    addressId: state.addressId,
    requestedStart: state.requestedStart,
    serviceBy: state.serviceBy,
    flexibilityDays: state.flexibilityDays,
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
function start({
  categorySlug,
  screens,
}: {
  categorySlug: string;
  screens: readonly Screen[];
}): RequirementDraftState {
  return initialDraftState(categorySlug, firstScreen(screens));
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
  /**
   * The catalogue's required question codes for step 1.
   *
   * Before the first save there is no server verdict, and without this list the
   * guard could only refuse an untouched form — one answered tile out of seven
   * unlocked Continue. The container reads the codes off the published
   * questions; the server remains the authority once it has spoken.
   */
  requiredAnswerCodes?: readonly string[];
  /**
   * The screens this variant actually walks — `activeScreens(questions)`.
   *
   * Defaults to the full budget. A question-free (visit-first) brief passes
   * `["where_when", "visits_send"]`: the reducer then opens on "Where and
   * when", steps through that list, and a `?step=what` in the URL is ignored
   * rather than restored onto a screen with nothing on it. Read once, on
   * mount — the variant is a route prop and does not change under a draft.
   */
  screens?: readonly Screen[];
  children: ReactNode;
}

export function RequirementProvider({
  categorySlug,
  hasUnresolvedDuplicate = false,
  requiredAnswerCodes,
  screens = SCREENS,
  children,
}: RequirementProviderProps) {
  const [state, dispatch] = useReducer(requirementReducer, { categorySlug, screens }, start);
  const today = useMemo(() => todayIso(), []);
  const [hasRestoredIntent, setHasRestoredIntent] = useState(false);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const intent = readIntent(categorySlug);
    if (intent !== null) {
      dispatch({
        type: "RESTORE_INTENT",
        requirementId: intent.requirementId ?? null,
        answers: intent.answers,
        addressId: intent.addressId,
        requestedStart: intent.requestedStart ?? null,
        serviceBy: intent.serviceBy ?? null,
        flexibilityDays: intent.flexibilityDays ?? 0,
      });
    }
    setHasRestoredIntent(true);
  }, [categorySlug]);

  // Do not serialize the empty hydration state over the entry the effect above
  // is about to restore. The restore and this flag settle in the same update,
  // so the first write always contains restored intent (also in Strict Mode).
  useEffect(() => {
    if (!hasRestoredIntent) return;
    writeIntent(state);
  }, [hasRestoredIntent, state]);

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
    if (stepParam === null || !isScreen(stepParam) || !screens.includes(stepParam)) return;
    dispatch({ type: "RESTORE_SCREEN", screen: stepParam, screens });
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

  const blocked = blockedReason(state, today, hasUnresolvedDuplicate, requiredAnswerCodes);

  const goTo = useCallback((screen: Screen) => dispatch({ type: "GO_TO", screen }), []);
  const open = useCallback((screen: Screen) => dispatch({ type: "OPEN", screen }), []);
  const advance = useCallback(() => dispatch({ type: "ADVANCE", screens }), [screens]);
  const back = useCallback(() => dispatch({ type: "BACK", screens }), [screens]);

  const value = useMemo<RequirementContextValue>(
    () => ({
      state,
      dispatch,
      hasRestoredIntent,
      blocked,
      canContinue: canAdvance(state, today, hasUnresolvedDuplicate, requiredAnswerCodes),
      today,
      goTo,
      open,
      advance,
      back,
    }),
    [
      state,
      hasRestoredIntent,
      blocked,
      today,
      hasUnresolvedDuplicate,
      requiredAnswerCodes,
      goTo,
      open,
      advance,
      back,
    ],
  );

  return <RequirementContext.Provider value={value}>{children}</RequirementContext.Provider>;
}
