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
  refusal?: { title: string; message: string } | null;
  failed: boolean;
  requestId: string | null;
  fieldMessages: readonly string[];
}

export interface DockContextValue {
  dockConfig: DockConfig | null;
  registerDock: (config: DockConfig | null) => void;
  /**
   * Scroll the text field that has focus clear of the keyboard. A step calls it from each
   * field's `onFocus`: the keyboard does not resize the screen on Android, so a field low on the
   * page would otherwise stay hidden behind it.
   */
  scrollFieldIntoView: () => void;
}

export const ApplyDockContext = createContext<DockContextValue>({
  dockConfig: null,
  registerDock: () => {},
  scrollFieldIntoView: () => {},
});

export function useApplyDock(): DockContextValue {
  return useContext(ApplyDockContext);
}

