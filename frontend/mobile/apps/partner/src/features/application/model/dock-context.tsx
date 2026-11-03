import { createContext, useContext } from "react";

export interface DockConfig {
  label: string;
  backHref: string;
  nextStepName: string | null;
  onCommit: () => void;
  isSaving: boolean;
  proceedDisabled: boolean;
  saved: boolean;
  conflict: boolean;
  failed: boolean;
  requestId: string | null;
  fieldMessages: readonly string[];
}

export interface DockContextValue {
  dockConfig: DockConfig | null;
  registerDock: (config: DockConfig | null) => void;
}

export const ApplyDockContext = createContext<DockContextValue>({
  dockConfig: null,
  registerDock: () => {},
});

export function useApplyDock(): DockContextValue {
  return useContext(ApplyDockContext);
}
