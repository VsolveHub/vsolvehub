"use client";

import type { SelectHTMLAttributes } from "react";

import { cn } from "./cn";
import { controlChrome, useFieldContext } from "./field";

/**
 * Native select.
 *
 * Native rather than a custom listbox on purpose: the OS picker is the most
 * usable control on a phone, works with every assistive technology, and cannot
 * be broken by a scroll container or a z-index. A custom listbox is only worth
 * it for search or multi-select, neither of which Milestone 1 needs.
 *
 * B1 acceptance: "native/custom selects remain readable in every state." The
 * failure it refers to is real and easy to reproduce — a `<select>` styled with
 * only a background colour inherits the OS text colour for its `<option>`s. On
 * a device in dark mode, Chrome renders the popup with a light background and
 * light text, and the options become invisible. The fix is to set colour and
 * background explicitly on both the select and its options, which the rules
 * below do.
 *
 * `appearance-none` plus a drawn chevron is also deliberate: the default arrow
 * is unstyleable and sits inconsistently across browsers.
 */

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id?: string;
  /**
   * Shown as a disabled first option. A select must never silently default to
   * its first real value — plan 03 forbids a preselected slot or option that the
   * customer did not choose.
   */
  placeholder?: string;
}

export function Select({ className, id, placeholder, children, ...props }: SelectProps) {
  const field = useFieldContext();

  return (
    <div className="relative">
      <select
        id={id ?? field?.controlId}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={
          [field?.descriptionId, field?.errorId].filter(Boolean).join(" ") || undefined
        }
        required={field?.required}
        // `defaultValue=""` pairs with the disabled placeholder so nothing is
        // preselected unless the caller passes a value.
        defaultValue={placeholder && props.value === undefined ? "" : undefined}
        className={cn(
          controlChrome,
          "appearance-none py-2.5 pr-10",
          // Explicit colours on the options. Without these the popup inherits
          // OS colours and can render light-on-light.
          "[&>option]:bg-white [&>option]:text-[color:var(--color-navy-900)]",
          "[&>option:disabled]:text-[color:var(--color-warm-500)]",
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>

      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
      >
        <path d="M6 8l4 4 4-4" />
      </svg>
    </div>
  );
}
