// Ported from frontend/apps/customer/features/booking/view/workspace-context.tsx
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

interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: (action: WorkspaceAction) => void;
  blocked: BlockReason | null;
  canContinue: boolean;
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
    /* private browsing */
  }
}

function start(input: { serviceSlug: string; initialStage: Stage }): WorkspaceState {
  return initialState(input.serviceSlug, input.initialStage);
}

export function WorkspaceProvider({
  serviceSlug,
  initialStage = "address",
  children,
}: {
  serviceSlug: string;
  initialStage?: Stage;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(workspaceReducer, { serviceSlug, initialStage }, start);

  useEffect(() => {
    const intent = readIntent(serviceSlug);
    if (intent === null) return;
    dispatch({
      type: "RESTORE_INTENT",
      answers: intent.answers,
      notes: intent.notes,
      taskLines: intent.taskLines ?? [],
    });
  }, [serviceSlug]);

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
