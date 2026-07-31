"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "./cn";
import { controlChrome, useFieldContext } from "./field";

/**
 * Text input and multi-line input.
 *
 * Both read their id, description, error and required state from the
 * surrounding `Field`, so the ARIA wiring cannot be forgotten at a call site.
 */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Overrides the id from Field. Only needed for a control outside a Field. */
  id?: string;
}

export function Input({ className, id, ...props }: InputProps) {
  const field = useFieldContext();

  return (
    <input
      id={id ?? field?.controlId}
      aria-invalid={field?.invalid || undefined}
      aria-describedby={
        [field?.descriptionId, field?.errorId].filter(Boolean).join(" ") || undefined
      }
      required={field?.required}
      className={cn(controlChrome, "py-2.5", className)}
      {...props}
    />
  );
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id?: string;
}

export function Textarea({ className, id, rows = 4, ...props }: TextareaProps) {
  const field = useFieldContext();

  return (
    <textarea
      id={id ?? field?.controlId}
      rows={rows}
      aria-invalid={field?.invalid || undefined}
      aria-describedby={
        [field?.descriptionId, field?.errorId].filter(Boolean).join(" ") || undefined
      }
      required={field?.required}
      className={cn(controlChrome, "resize-y py-2.5", className)}
      {...props}
    />
  );
}
