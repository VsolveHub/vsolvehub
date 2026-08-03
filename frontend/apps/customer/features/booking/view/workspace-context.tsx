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

import { workspaceReducer, type WorkspaceAction } from "../model/machine";
import {
  blockedReason,
  canAdvance,
  initialState,
  totalTaskQuantity,
  type BlockReason,
  type TaskLine,
  type WorkspaceState,
} from "../model/state";
import { type Stage } from "../model/stages";

/**
 * The workspace's single state container.
 *
 * One reducer for the whole journey, rather than per-stage state, is what makes
 * this "one persistent React workspace" instead of a wizard that remounts. Going
 * back a stage is a stage change, not a navigation, so nothing is refetched and
 * nothing is lost.
 */

interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: (action: WorkspaceAction) => void;
  /** Null when the customer may continue. */
  blocked: BlockReason | null;
  canContinue: boolean;
  /** Total units chosen across task lines. Zero means nothing is selected. */
  taskCount: number;
  goTo: (stage: Stage) => void;
  advance: () => void;
  back: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  }
  return value;
}

/**
 * What is written to sessionStorage.
 *
 * Customer intent only. No quote, no window availability, no server timestamps:
 * those expire, and rehydrating one would put a price or a commitment on screen
 * that the server has already withdrawn. On restore the server-owned parts are
 * refetched, and `windowId` is deliberately dropped so the customer reconfirms a
 * time against fresh availability rather than inheriting one that may now be
 * gone.
 */
interface PersistedIntent {
  serviceSlug: string;
  answers: Record<string, unknown>;
  notes: string;
  taskLines: TaskLine[];
  addressId: string | null;
}

const STORAGE_PREFIX = "vsolve.booking.";

function storageKey(serviceSlug: string): string {
  return `${STORAGE_PREFIX}${serviceSlug}`;
}

function readIntent(serviceSlug: string): PersistedIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(serviceSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedIntent;
    return parsed.serviceSlug === serviceSlug ? parsed : null;
  } catch {
    // Corrupt or unavailable storage must never break the booking flow; the
    // customer just starts the form fresh.
    return null;
  }
}

function writeIntent(state: WorkspaceState): void {
  if (typeof window === "undefined") return;
  const intent: PersistedIntent = {
    serviceSlug: state.serviceSlug,
    answers: state.answers,
    notes: state.notes,
    taskLines: [...state.taskLines],
    addressId: state.address?.id ?? null,
  };
  try {
    window.sessionStorage.setItem(storageKey(state.serviceSlug), JSON.stringify(intent));
  } catch {
    // Private browsing and full quotas both throw. Losing persistence is
    // acceptable; losing the booking is not.
  }
}

export function clearPersistedIntent(serviceSlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(serviceSlug));
  } catch {
    /* nothing to recover from */
  }
}

/**
 * The reducer's initializer. Deliberately storage-free.
 *
 * `sessionStorage` is not readable during server rendering, so an initializer
 * that consults it renders one tree on the server and a different one on the
 * client's first pass. React resolves that mismatch by throwing the client tree
 * away and re-rendering from scratch, which is both a real performance cost and
 * a source of the "my answers flashed and vanished" class of bug. Both renders
 * therefore start from the same empty state, and the restore happens afterwards
 * through `RESTORE_INTENT` — see `useRestorePersistedIntent`.
 */
function start(input: { serviceSlug: string; initialStage: Stage }): WorkspaceState {
  return initialState(input.serviceSlug, input.initialStage);
}

export interface WorkspaceProviderProps {
  serviceSlug: string;
  /** Which stage the workspace opens on. See `initialState`. */
  initialStage?: Stage;
  children: ReactNode;
}

export function WorkspaceProvider({
  serviceSlug,
  initialStage = "address",
  children,
}: WorkspaceProviderProps) {
  const [state, dispatch] = useReducer(workspaceReducer, { serviceSlug, initialStage }, start);

  useEffect(() => {
    const intent = readIntent(serviceSlug);
    if (intent === null) return;
    dispatch({
      type: "RESTORE_INTENT",
      answers: intent.answers,
      notes: intent.notes,
      // Address is intentionally not restored from the id alone: serviceability
      // is a server verdict with an expiry, and restoring the id without
      // rechecking would let a stale "serviceable" survive. The address stage
      // refetches and reconfirms it.
      taskLines: intent.taskLines ?? [],
    });
  }, [serviceSlug]);

  /**
   * Persists customer intent — but never on the mount commit.
   *
   * The restore effect above is declared first, so within a single commit it
   * runs first; this one then runs with the state React has *already rendered*,
   * which on mount is still the empty initial state. Writing that would
   * serialise emptiness over the very intent the restore is about to apply, and
   * a customer who reloaded twice would lose their answers on the second one.
   *
   * Skipping the first run costs nothing: an initial state has nothing worth
   * saving, and the restore's own re-render is what triggers the first real
   * write.
   */
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    writeIntent(state);
  }, [state]);

  const goTo = useCallback((stage: Stage) => dispatch({ type: "GO_TO_STAGE", stage }), []);
  const advance = useCallback(() => dispatch({ type: "ADVANCE" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      dispatch,
      blocked: blockedReason(state),
      canContinue: canAdvance(state),
      taskCount: totalTaskQuantity(state),
      goTo,
      advance,
      back,
    }),
    [state, goTo, advance, back],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
