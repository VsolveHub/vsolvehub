"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn, useT } from "@vsolve/ui";

export interface InlineQuantityControlProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly decrementLabel: string;
  readonly incrementLabel: string;
}

const STEP_BUTTON = cn(
  "grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-control",
  "border border-line-strong bg-surface text-lg text-text",
  "transition-colors duration-fast ease-out hover:bg-surface-hover active:bg-surface-sunken",
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-warm-400",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
);

/**
 * A compact quantity control for catalogue rows where values can be large.
 *
 * The step buttons remain useful for small corrections, but the value is an
 * input rather than an output so a vendor can enter forty running feet in one
 * action. A local string preserves the empty state while the vendor replaces a
 * selected value; valid digits are sent to the draft immediately, where the
 * existing debounced preview prevents a request per key press.
 */
export function InlineQuantityControl({
  label,
  value,
  onChange,
  decrementLabel,
  incrementLabel,
}: InlineQuantityControlProps) {
  const t = useT();
  const [draft, setDraft] = useState(() => String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);

  const parsedDraft = /^\d+$/.test(draft) ? Number(draft) : null;
  const effectiveValue =
    parsedDraft !== null && Number.isSafeInteger(parsedDraft) ? parsedDraft : value;

  function adjust(delta: -1 | 1) {
    const next = Math.max(0, effectiveValue + delta);
    setDraft(String(next));
    onChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(String(value));
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      adjust(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      adjust(-1);
    }
  }

  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <button
        type="button"
        aria-label={decrementLabel}
        disabled={effectiveValue <= 0}
        onClick={() => adjust(-1)}
        className={STEP_BUTTON}
      >
        <span aria-hidden>−</span>
      </button>

      <input
        type="text"
        role="spinbutton"
        aria-label={t("proposal.screens.quantity.typeNumber", { label })}
        aria-valuemin={0}
        aria-valuenow={effectiveValue}
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        autoComplete="off"
        value={draft}
        onFocus={(event) => {
          editing.current = true;
          event.currentTarget.select();
        }}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          if (!/^\d*$/.test(nextDraft)) return;

          setDraft(nextDraft);
          if (nextDraft === "") return;

          const next = Number(nextDraft);
          if (Number.isSafeInteger(next)) onChange(next);
        }}
        onBlur={() => {
          editing.current = false;
          setDraft(String(value));
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "h-11 w-13 rounded-control border border-line-strong bg-surface px-1 text-center",
          "text-base font-bold tabular-nums text-text caret-action",
          "transition-colors duration-fast ease-out hover:bg-surface-hover",
          "focus:border-action focus:bg-action-surface focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2",
        )}
      />

      <span className="sr-only" aria-live="polite">
        {t("proposal.screens.quantity.live", { value })}
      </span>

      <button
        type="button"
        aria-label={incrementLabel}
        onClick={() => adjust(1)}
        className={STEP_BUTTON}
      >
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}
