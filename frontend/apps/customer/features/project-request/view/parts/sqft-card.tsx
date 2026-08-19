"use client";

import { Button, Sheet } from "@vsolve/ui";
import { useState } from "react";

/**
 * A floor area, entered on a keypad rather than typed into a field.
 *
 * ## Why not a slider
 *
 * People know their square footage or they do not. A slider makes the ones who
 * know hunt for a value they could have typed in two seconds, and it makes the
 * ones who do not produce a confident-looking number they invented — which a
 * vendor then quotes against. A number entry lets the first group answer and the
 * second group leave it alone.
 *
 * ## Why a sheet rather than an inline `<input type="number">`
 *
 * A number input on a phone opens the OS keypad over the bottom of the screen,
 * which is exactly where this flow docks its Continue button. The customer types
 * a value and cannot see the control that accepts it. A sheet puts the field and
 * its confirm together, above the keyboard, and dismissing it is a cancel.
 *
 * The value still commits only on confirm — same rule as every other dialog in
 * this app.
 */

export interface SqftCardProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** The catalogue's help text, when it publishes one. */
  hint?: string;
  /**
   * The unit beside the number — "sq ft".
   *
   * Absent where nothing published says what the number counts. An unlabelled
   * number is unhelpful; a wrongly labelled one sends a vendor to measure the
   * wrong thing. See `model/questions`.
   */
  unit?: string;
}

export function SqftCard({ label, value, onChange, hint, unit }: SqftCardProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const parsed = Number.parseInt(draft, 10);
  const isValid = Number.isFinite(parsed) && parsed > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setDraft(value === null ? "" : String(value));
          setOpen(true);
        }}
        aria-label={
          value === null
            ? `${label}. Not answered`
            : `${label}. Currently ${value}${unit === undefined ? "" : ` ${unit}`}. Change`
        }
        className="w-full rounded-[14px] border border-line bg-surface px-3.5 py-[13px] text-left transition-colors duration-fast hover:bg-surface-hover"
      >
        <span aria-hidden className="block text-xs font-semibold text-text-muted">
          {label}
        </span>
        <span aria-hidden className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-[-0.02em] tabular-nums text-text">
            {value === null ? "—" : value.toLocaleString("en-IN")}
          </span>
          {unit === undefined ? null : <span className="text-sm text-text-muted">{unit}</span>}
        </span>
      </button>

      {hint !== undefined ? (
        <p className="mt-1.5 text-xs leading-5 text-text-muted">{hint}</p>
      ) : null}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={hint ?? "A rough number is fine — vendors measure on the visit."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={!isValid}
              onClick={() => {
                if (!isValid) return;
                onChange(parsed);
                setOpen(false);
              }}
            >
              Done
            </Button>
          </>
        }
      >
        <div className="flex items-baseline gap-2 py-2">
          <input
            // `inputMode` rather than `type="number"`: the numeric keypad without
            // the spinner, the scroll-wheel-changes-the-value trap, or the
            // browser's own idea of what a valid number looks like.
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
            aria-label={unit === undefined ? label : `${label}, in ${unit}`}
            className="min-w-0 flex-1 border-b-2 border-line-strong bg-transparent pb-1 text-[32px] font-bold tabular-nums text-text outline-none focus-visible:border-focus-ring"
          />
          {unit === undefined ? null : <span className="shrink-0 text-base text-text-muted">{unit}</span>}
        </div>
      </Sheet>
    </div>
  );
}
