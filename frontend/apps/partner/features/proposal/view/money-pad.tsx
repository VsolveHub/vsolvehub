"use client";

import { Button, cn, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";

/**
 * A price, entered by tapping.
 *
 * ## Why not an input with a decimal keyboard
 *
 * That is what the composer had, and it was already the careful version — the
 * right `inputMode`, a 44px target, save on blur. It still assumes a soft
 * keyboard that appears, covers half the screen, and offers a vendor a text
 * cursor. On a cracked mid-range Android in daylight, on a building site, that
 * is the single hardest control in the flow.
 *
 * These keys are on the screen the whole time, they cannot be dismissed, and
 * they cannot produce anything that is not a number.
 *
 * ## Why the chips are there
 *
 * Estimates are not typed digit by digit; they are built out of round numbers.
 * A vendor pricing plaster thinks "fifteen thousand", not "1-5-0-0-0". The chips
 * add, they do not replace — tapping `+5,000` three times is `₹15,000`, which is
 * how the number was arrived at anyway.
 *
 * ## Whole rupees only
 *
 * `amountPaise` is the wire unit and every value here is a multiple of 100. No
 * vendor quotes a job in paise, and a decimal point is one more thing to
 * mistype — the composer's own `rupeesToPaise` already rounded them away, so
 * nothing is lost that was ever kept.
 */

export interface MoneyPadProps {
  /** What is being priced, in the vendor's own words. */
  readonly title: string;
  /** The icon from the preset, so the screen matches the tile they tapped. */
  readonly icon: PictogramName;
  readonly amountPaise: number | null;
  readonly onChange: (amountPaise: number | null) => void;
  readonly onDone: () => void;
  /** Rendered under the amount. The days stepper, or the quantity one. */
  readonly children?: React.ReactNode;
}

/** What a vendor reaches for. Round, and in the order they are usually added. */
const QUICK_ADD_RUPEES = [1_000, 5_000, 10_000] as const;

/** A guard, not a policy: ten crore is past any real estimate and stops a stuck key. */
const MAXIMUM_RUPEES = 100_000_000;

export function MoneyPad({
  title,
  icon,
  amountPaise,
  onChange,
  onDone,
  children,
}: MoneyPadProps) {
  // Held as rupees while being typed. Converting on every key would round the
  // display out from under somebody mid-number.
  const [rupees, setRupees] = useState<number>(amountPaise === null ? 0 : amountPaise / 100);

  function commit(next: number): void {
    const clamped = Math.min(Math.max(Math.round(next), 0), MAXIMUM_RUPEES);
    setRupees(clamped);
    onChange(clamped === 0 ? null : clamped * 100);
  }

  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      {/* The amount is clearly readable in an ultra-compact card */}
      <p
        aria-live="polite"
        className="rounded-card border-2 border-action bg-surface px-3 py-1 text-center text-2xl font-extrabold tabular-nums text-text shadow-2xs"
      >
        {formatMoney(rupees * 100)}
      </p>

      {children}

      <div className="flex gap-1.5">
        {QUICK_ADD_RUPEES.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => commit(rupees + step)}
            className={cn(
              "h-7 min-h-7 flex-1 rounded-full border border-info-line bg-info-surface",
              "text-xs font-bold tabular-nums text-info-text",
              "transition-colors active:bg-info-line/40 cursor-pointer",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            )}
          >
            +{step.toLocaleString("en-IN")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"].map((key) => (
          <PadKey
            key={key}
            label={key}
            onPress={() => commit(Number(`${rupees}${key}`))}
          />
        ))}
        <PadKey
          label="⌫"
          announce="Delete the last digit"
          onPress={() => commit(Math.floor(rupees / 10))}
        />
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <Button variant="ghost" size="sm" className="shrink-0 px-3 text-xs text-text-secondary" onClick={() => commit(0)}>
          Clear
        </Button>
        <Button block size="sm" className="flex-1 font-bold text-sm h-9" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}

function PadKey({
  label,
  announce,
  onPress,
}: {
  label: string;
  announce?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={announce}
      className={cn(
        "h-8.5 min-h-[34px] rounded-control border border-line bg-surface",
        "text-base font-bold tabular-nums text-text",
        "transition-colors active:bg-surface-sunken cursor-pointer",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      {label}
    </button>
  );
}
