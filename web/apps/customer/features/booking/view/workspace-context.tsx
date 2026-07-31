"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import { workspaceReducer, type WorkspaceAction } from "../model/machine";
import {
  blockedReason,
  canAdvance,
  initialState,
  selectedDuration,
  type BlockReason,
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
  durationMinutes: number | null;
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
 * Customer intent only. No quote, no hold, no slot availability, no server
 * timestamps: those expire, and rehydrating one would put a price or a
 * commitment on screen that the server has already withdrawn. On restore the
 * server-owned parts are refetched, and `slotId` is deliberately dropped so the
 * customer reconfirms a time against fresh availability rather than inheriting
 * one that may now be gone.
 */
interface PersistedIntent {
  serviceSlug: string;
  fulfilment: WorkspaceState["fulfilment"];
  answers: Record<string, unknown>;
  notes: string;
  quantity: number;
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
    fulfilment: state.fulfilment,
    answers: state.answers,
    notes: state.notes,
    quantity: state.quantity,
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

function restore(serviceSlug: string): WorkspaceState {
  const base = initialState(serviceSlug);
  const intent = readIntent(serviceSlug);
  if (intent === null) return base;

  return {
    ...base,
    fulfilment: intent.fulfilment,
    answers: intent.answers,
    notes: intent.notes,
    quantity: intent.quantity,
    // Address is intentionally not restored from the id alone: serviceability
    // is a server verdict with an expiry, and restoring the id without
    // rechecking would let a stale "serviceable" survive. The address stage
    // refetches and reconfirms it.
  };
}

export interface WorkspaceProviderProps {
  serviceSlug: string;
  children: ReactNode;
}

export function WorkspaceProvider({ serviceSlug, children }: WorkspaceProviderProps) {
  const [state, dispatch] = useReducer(workspaceReducer, serviceSlug, restore);

  useEffect(() => {
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
      durationMinutes: selectedDuration(state),
      goTo,
      advance,
      back,
    }),
    [state, goTo, advance, back],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
