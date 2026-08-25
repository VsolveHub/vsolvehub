import { Button, FactTile } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import { BackGlyph } from "@/features/proposal/view/parts/focused-header";

/**
 * A fixed-time A5 site-visit offer, at the size a partner answers it standing
 * in the street.
 *
 * ## What is different about this offer
 *
 * Every previous visit offer in this app ended in a slot picker: the partner
 * was shown a job and asked when they could come. BE-3 inverts that — the
 * customer picks the time before the offer is cut, so the only two answers left
 * are yes and no. That is the whole reason this screen exists rather than a
 * variant of `visit-slot-picker.tsx`, and it is why the info note below the
 * facts says so in words. A partner who has answered twenty of the old offers
 * will look for the picker; the note is what stops them hunting for it.
 *
 * The ring is the second half of the same idea. A fixed time is only offered to
 * one partner at a time and for a short window, so the cost of reading slowly is
 * losing the job — the countdown is the screen's largest element after the money
 * for that reason, not for drama.
 *
 * ## Presentational
 *
 * Props in, JSX out. It fetches nothing, holds no state, runs no timer and
 * formats no money: `countdownLabel` and `earningLabel` arrive already
 * formatted, because a screen that reformats a server figure is a screen that
 * will one day disagree with the server. The ticking clock, and the mutation
 * behind either button, belong to the route that will own this once BE-3
 * publishes. Until then it is rendered from sample props at `/design/m2/offer`.
 *
 * The two controls therefore carry no handlers — the same shape
 * `EstimateModeScreen` uses, and what keeps this a server component.
 *
 * ## Deviations from the artboard, stated rather than hidden
 *
 * - The artboard's Service tile reads "Electrical"; this renders the full
 *   `serviceName` the rest of the gallery uses ("General Electrical Works") so
 *   the two M2 visit screens cannot disagree about what the job is. `FactTile`
 *   truncates it, which is what that component is built to do.
 * - The back tile is written out here instead of reusing `HeaderTile`. That
 *   component is toned for the navy focused header (`bg-surface/13
 *   text-surface`); on an orange hero it needs ink, not white, and `cn` is
 *   clsx rather than tailwind-merge, so passing a competing `bg-*` through
 *   `className` would leave the cascade — not this file — to pick the winner.
 *   `BackGlyph`, the part that is genuinely shared, is imported.
 * - The tinted note is a plain element rather than `Card` for the same reason:
 *   `Card` bakes in `border-line bg-surface`, and an informational plate has to
 *   replace both.
 */

/** `2 · π · 66`, the radius the artboard draws the ring at. */
const RING_CIRCUMFERENCE = 414.7;

export interface FixedTimeOfferScreenProps {
  /** What the visit is for, e.g. "General Electrical Works". */
  serviceName: string;
  /** Locality only. No exact address exists on this screen — see the foot note. */
  areaLabel: string;
  /** Pre-formatted, e.g. "Mon 19 May". */
  dateLabel: string;
  /** Pre-formatted, e.g. "10:00 · 2 hrs". */
  startsLabel: string;
  /** What the partner receives, already formatted, e.g. "₹149". */
  earningLabel: string;
  /** The digits inside the ring, e.g. "1:42". Formatted by the caller. */
  countdownLabel: string;
  /** Seconds left in the window. Drives the arc only; the digits are `countdownLabel`. */
  remainingSeconds: number;
  /** The window's full length in seconds — the arc's denominator. */
  windowSeconds: number;
}

export function FixedTimeOfferScreen({
  serviceName,
  areaLabel,
  dateLabel,
  startsLabel,
  earningLabel,
  countdownLabel,
  remainingSeconds,
  windowSeconds,
}: FixedTimeOfferScreenProps) {
  /*
    Clamped at both ends. An unclamped fraction above 1 wraps the dash pattern
    and redraws a full ring, which reads as a clock that has just been reset;
    below 0 it would draw the arc back on again.
  */
  const fraction =
    windowSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / windowSeconds)) : 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - fraction);

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* The screen is a ring, a figure and four pictures; the landmark still
          needs a name. */}
      <h1 className="sr-only">Site visit offer — {serviceName}</h1>

      <div className="relative flex shrink-0 flex-col items-center gap-3 rounded-b-[26px] bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] px-5 pt-[max(2.75rem,env(safe-area-inset-top))] pb-6.5 shadow-raised">
        <span className="absolute left-3 top-[max(3.125rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-2xl bg-text/10 text-text">
          <BackGlyph label="Back" />
        </span>

        <div className="relative mt-3.5 h-[150px] w-[150px]">
          <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden>
            <circle cx="75" cy="75" r="66" className="fill-text/12" />
            <circle cx="75" cy="75" r="66" fill="none" className="stroke-text/18" strokeWidth="11" />
            <circle
              cx="75"
              cy="75"
              r="66"
              fill="none"
              className="stroke-text"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 75 75)"
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <Pictogram name="time" size="md" className="text-text" />
            <span className="sr-only">Time left</span>
            <span className="text-[2.375rem] font-extrabold leading-tight tabular-nums text-text">
              {countdownLabel}
            </span>
          </div>
        </div>

        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-action-text opacity-80">
          You receive
        </span>
        <span className="-mt-1.5 text-[3.25rem] font-extrabold leading-none tracking-[-0.025em] tabular-nums text-action-text">
          {earningLabel}
        </span>
        <span className="max-w-[27ch] text-center text-[0.8125rem] font-semibold leading-[18px] text-action-text">
          For this site visit. Paid after you mark it complete.
        </span>
      </div>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4">
        <div className="grid grid-cols-2 gap-2.5">
          <FactTile
            icon={<Pictogram name="papers" size="md" />}
            label="Service"
            value={serviceName}
          />
          <FactTile icon={<Pictogram name="distance" size="md" />} label="Area" value={areaLabel} />
          <FactTile icon={<Pictogram name="date" size="md" />} label="Date" value={dateLabel} />
          <FactTile icon={<Pictogram name="time" size="md" />} label="Starts" value={startsLabel} />
        </div>

        {/* The M2 change, stated once. No slot picker anywhere on this screen. */}
        <div className="flex gap-2.5 rounded-card border border-info-line bg-info-surface px-3.5 py-3">
          <span className="mt-px shrink-0 text-info-text">
            <Pictogram name="later" size="sm" />
          </span>
          <p className="text-[12.5px] leading-[18px] text-info-text">
            The customer picked this time. Take it or pass — there is nothing to schedule.
          </p>
        </div>

        <p className="mt-0.5 pb-4 text-xs leading-[17px] text-text-muted">
          The exact address appears once the customer pays.
        </p>
      </main>

      {/*
        Two tiers, carried by shape as well as colour: filled and 80px against
        outlined and 64px, so the pair cannot be confused at a glance in
        sunlight. Both state their verb — a partner turning down money on a
        glyph alone is the defect this replaced.
      */}
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="flex h-20 items-center justify-center gap-3 rounded-[20px] bg-success-text shadow-[0_3px_0_var(--color-success-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="yes" size="lg" className="text-surface" />
          <span className="text-xl font-bold text-surface">Take this visit</span>
        </button>

        <Button
          variant="outline"
          size="lg"
          block
          className="h-16"
          icon={<Pictogram name="no" size="md" className="text-text-muted" />}
        >
          Pass on this one
        </Button>
      </div>
    </div>
  );
}
