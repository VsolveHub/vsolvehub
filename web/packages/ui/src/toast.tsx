"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Transient notifications.
 *
 * Deliberately limited. A toast is for confirming something the user just did
 * — "Address saved" — and nothing else. It is the wrong surface for anything
 * they must act on, because it disappears, it can be missed entirely, and on a
 * phone it covers the bottom action bar.
 *
 * So this component will not carry a failure that needs recovery. Those belong
 * in `ErrorState` next to the thing that failed, where the message stays put and
 * the retry is reachable. A `danger` tone exists for reporting that a background
 * action failed, and it does not auto-dismiss.
 *
 * Announcement follows the WAI-ARIA pattern: one persistent live region that
 * exists before any message arrives. Rendering the region and its content at the
 * same moment is the standard bug — most screen readers announce nothing.
 */

type ToastTone = "success" | "info" | "danger";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  /** Shows a toast. `danger` stays until dismissed. */
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider.");
  return context;
}

const AUTO_DISMISS_MS = 5_000;

const tones: Record<ToastTone, { chrome: string; icon: ReactNode }> = {
  success: {
    chrome: "bg-success-surface text-success-text ring-success-line",
    icon: (
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.58l-1.3-1.3a1 1 0 10-1.4 1.42l2 2a1 1 0 001.4 0l4-4z"
        clipRule="evenodd"
      />
    ),
  },
  info: {
    chrome: "bg-info-surface text-info-text ring-info-line",
    icon: (
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    ),
  },
  danger: {
    chrome: "bg-danger-surface text-danger-text ring-danger-line",
    icon: (
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.515 2.63H3.72c-1.345 0-2.188-1.463-1.515-2.63L8.485 2.495zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    ),
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);

      // A failure stays until acknowledged; a confirmation does not need to.
      if (tone !== "danger") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* The live region is always mounted, even with no toasts, so assistive
          technology is already observing it when a message arrives. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className={cn(
          "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
          // Sits above the mobile sticky action bar and clear of the home
          // indicator, so it never covers a primary action.
          "bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))]",
          "sm:bottom-6 sm:items-end",
        )}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5",
              "rounded-card px-4 py-3 text-sm font-medium shadow-raised ring-1",
              tones[toast.tone].chrome,
            )}
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
              {tones[toast.tone].icon}
            </svg>
            <p className="min-w-0 flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-my-1 -mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control hover:bg-black/5"
            >
              <span className="sr-only">Dismiss</span>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                className="h-4 w-4"
              >
                <path d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
