"use client";

import {
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { cn } from "./cn";
import { controlChrome, useFieldContext } from "./field";
import { formatDate, parseDisplayDate } from "./readout";

/**
 * Calendar day control that **displays** DD/MM/YYYY while storing ISO `YYYY-MM-DD`.
 *
 * Native `<input type="date">` follows the browser locale (often MM/DD on US
 * machines). Demo freeze requires human-visible Indian dates everywhere, so this
 * field is a text control with a native picker as a calendar affordance —
 * the visible value is always reformatted via `formatDate`.
 *
 * Picker activation: calendar button calls `HTMLInputElement.showPicker()` on a
 * visually hidden `type="date"` input (kept in-layout so the browser allows it).
 * Falls back to `.click()` when `showPicker` is unavailable.
 */

export interface IsoDateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "id"> {
  /** Committed wire value: `YYYY-MM-DD` or empty string. */
  value: string;
  onChange: (isoDate: string) => void;
  id?: string;
  /** Minimum selectable day as ISO `YYYY-MM-DD`. */
  min?: string;
  /** Maximum selectable day as ISO `YYYY-MM-DD`. */
  max?: string;
}

function isoToDisplay(iso: string): string {
  if (!iso) return "";
  return formatDate(iso);
}

function withinBounds(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export function IsoDateField({
  value,
  onChange,
  className,
  id,
  min,
  max,
  disabled,
  required,
  placeholder = "DD/MM/YYYY",
  ...props
}: IsoDateFieldProps) {
  const field = useFieldContext();
  const generatedId = useId();
  const controlId = id ?? field?.controlId ?? generatedId;
  const pickerRef = useRef<HTMLInputElement>(null);
  /** `null` means show the committed display; non-null is in-progress typing. */
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? isoToDisplay(value);

  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setDraft(null);
      return;
    }
    const iso = parseDisplayDate(trimmed);
    if (iso === null || !withinBounds(iso, min, max)) {
      setDraft(null);
      return;
    }
    onChange(iso);
    setDraft(null);
  };

  const applyPickerValue = (next: string) => {
    setDraft(null);
    if (!next) {
      onChange("");
      return;
    }
    if (!withinBounds(next, min, max)) return;
    onChange(next);
  };

  const openPicker = (event: MouseEvent | PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        void el.showPicker();
        return;
      }
    } catch {
      // Fall through — some engines reject showPicker if the control is
      // considered not visible or the call is outside a user gesture.
    }
    el.focus();
    el.click();
  };

  return (
    <div className={cn("relative", className)}>
      <input
        {...props}
        id={controlId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        required={required ?? field?.required}
        value={text}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={
          [field?.descriptionId, field?.errorId].filter(Boolean).join(" ") || undefined
        }
        onFocus={() => setDraft(isoToDisplay(value))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commitText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitText((event.target as HTMLInputElement).value);
          }
        }}
        className={cn(controlChrome, "w-full py-2.5 pr-11 font-medium tabular-nums")}
      />
      {/*
        Native date control: kept in-layout (opacity-0, not display:none) so
        showPicker() is allowed. Absolute over the calendar button so a direct
        click on the icon area also activates the browser picker as a fallback.
      */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        min={min}
        max={max}
        value={value || ""}
        onChange={(event) => applyPickerValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "absolute inset-y-0 right-0 z-[1] w-10 cursor-pointer opacity-0",
          disabled && "pointer-events-none",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Open calendar"
        title="Open calendar"
        onClick={openPicker}
        onPointerDown={(event) => {
          // Prevent an outer wrapping <label> from stealing the gesture.
          event.preventDefault();
          event.stopPropagation();
        }}
        className={cn(
          "absolute inset-y-0 right-0 z-[2] flex w-10 items-center justify-center",
          "text-text-muted hover:text-text",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
    </div>
  );
}
