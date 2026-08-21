"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

import { cn } from "./cn";

/**
 * Form field wrapper: label, optional description, error, and the ARIA wiring
 * that connects them to the control.
 *
 * Plan 03 requires visible labels rather than placeholder-only inputs. A
 * placeholder disappears the moment someone types, which strands anyone who is
 * interrupted mid-form — and screen readers treat it inconsistently. So the
 * label is always rendered; there is no "hide the label" prop.
 *
 * Controls read their ids from context instead of taking them as props, which
 * removes the most common accessibility bug in a form: an input whose error text
 * is displayed but never announced.
 */

interface FieldContextValue {
  controlId: string;
  descriptionId: string | undefined;
  errorId: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Consumed by Input, Select and Textarea. Returns null when a control is used
 * outside a Field, which is allowed — a search box in a toolbar with a visually
 * hidden label does not need the wrapper.
 */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  children: ReactNode;
  /** Helper text. Always rendered above the control so it is read before input. */
  description?: string;
  /**
   * Validation message. Presence marks the control invalid and announces the
   * message. Say what to do, not just what is wrong.
   */
  error?: string;
  required?: boolean;
  showOptional?: boolean;
  className?: string;
}

export function Field({
  label,
  description,
  error,
  required = false,
  showOptional = true,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const controlId = `${id}-control`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldContext.Provider
      value={{ controlId, descriptionId, errorId, invalid: Boolean(error), required }}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={controlId} className="text-sm font-semibold text-text">
          {label}
          {required ? (
            <>
              {/* The asterisk is decorative; "required" is conveyed to assistive
                  technology by the control's own `required` attribute. */}
              <span aria-hidden className="ml-0.5 text-danger-text">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : showOptional ? (
            <span className="ml-1.5 font-normal text-text-muted">(optional)</span>
          ) : null}
        </label>

        {description ? (
          <p id={descriptionId} className="text-sm text-text-secondary">
            {description}
          </p>
        ) : null}

        {children}

        {error ? (
          <p
            id={errorId}
            // `alert` so a validation failure arriving after submit is announced
            // immediately rather than waiting for focus to reach the field.
            role="alert"
            className="flex items-start gap-1.5 text-sm font-medium text-danger-text"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              fill="currentColor"
              className="mt-0.5 h-4 w-4 shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 7.5a.9.9 0 100-1.8.9.9 0 000 1.8z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * Shared control chrome.
 *
 * The border uses `line-strong` rather than the decorative hairline: a form
 * control's boundary is a non-text UI element and has to clear 3:1 (WCAG
 * 1.4.11). This product is used outdoors on inexpensive screens, where a
 * fashionable 1px near-white edge is simply not there.
 */
export const controlChrome = cn(
  "w-full rounded-control border bg-surface px-3",
  "text-base text-text placeholder:text-text-muted",
  // 44px minimum touch target (plan 03). `text-base` also stops iOS Safari
  // zooming the viewport on focus, which anything under 16px triggers.
  "min-h-11",
  "border-line-strong",
  "transition-colors duration-fast ease-out",
  "hover:border-warm-600",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted",
  // Invalid state is border + icon + message, never colour alone.
  "aria-[invalid=true]:border-danger-text aria-[invalid=true]:bg-danger-surface",
);
