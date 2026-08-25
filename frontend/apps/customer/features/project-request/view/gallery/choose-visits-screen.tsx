"use client";

import { Calendar, MapPin } from "lucide-react";
import { useId } from "react";
import { Button, cn } from "@vsolve/ui";

import { FieldLabel, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { StepMeter } from "../parts/step-meter";

/**
 * Step 3 of 3 — Choose visits & send.
 *
 * The last screen of the brief: the customer confirms what they wrote, says how
 * many professionals should come and price it, and gives each of those visits a
 * time. Then one action sends it.
 *
 * ## Why this is a gallery component and not a route
 *
 * Contract 1.43.0 lets a customer choose a `plan_size` of 1..3 and nothing else.
 * The slot grid, the signed token and the confirm all live under
 * `/api/v1/partner/…`, so there is no customer-facing DTO to render from. Rather
 * than invent one and ship a screen that pretends to be wired, this is a pure
 * component — props in, JSX out, no fetching and no data state — rendered from
 * fixed sample values at `/design/m2/choose-visits`. The wired route arrives
 * with proposal 0015 and BE-2, and takes this component with it.
 *
 * ## Why it carries its own shell rather than `MobileScreen`
 *
 * `MobileScreen` is the shipped shell and this header is a copy of it, down to
 * the truncation rule and the trailing step slot — but its root is
 * `min-h-[100dvh]`, which is the right answer for a real route and the wrong one
 * inside a 390×844 artboard frame. On any viewport taller than 844px the docked
 * footer would land below the frame's `overflow-hidden` and be clipped away,
 * which is the one thing this screen must not do. The header, footer and scroll
 * region below are the same measurements; `ScreenHeading` and `FieldLabel` come
 * straight from that file, and the meter is A5's own `StepMeter`.
 *
 * ## Where the touch targets are
 *
 * Four rows here carry an inline word — one Edit, two Change, one Choose. None
 * of those words is a control: a 30px-wide "Edit" is well under the 44px floor,
 * and a miss on it lands on whatever is behind. In every case the **whole row**
 * is the button and the word is `aria-hidden` decoration inside it, which is
 * the rule `PickerRow` already follows and the reason a nested `<button>` never
 * appears here.
 */

export interface ChooseVisitsRecap {
  /** The service, repeated from step 1. Also the header title. */
  serviceName: string;
  /** The answered details as one line: "Two bathrooms · 12 fittings · …". */
  facts: string;
  /** Locality-level only. The exact address is withheld until payment. */
  site: string;
  /** "From Tue, 2 September · ± a week". */
  startLine: string;
}

export interface VisitTierOption {
  planSize: number;
  /** Server-published. The client never invents a price — see `VisitPlanChooser`. */
  priceLabel: string;
}

export interface VisitSlotRow {
  /** 1-based, and the number shown in the leading chip. */
  index: number;
  /** "Tue 2 Sep · 10:00 – 12:00", or null while the visit has no time yet. */
  when: string | null;
}

export interface ChooseVisitsScreenProps {
  recap: ChooseVisitsRecap;
  tiers: readonly VisitTierOption[];
  /** The chosen plan size. One of `tiers`. */
  planSize: number;
  /** The price of the chosen plan, for the reassurance line. */
  chosenPriceLabel: string;
  /** One row per requested estimate. Its length tracks `planSize`. */
  visits: readonly VisitSlotRow[];
  step?: number;
  total?: number;
  onBack?: () => void;
  onEdit?: () => void;
  onPlanSizeChange?: (planSize: number) => void;
  onPickVisit?: (index: number) => void;
  onSend?: () => void;
}

function professionals(count: number): string {
  return count === 1 ? "1 professional" : `${count} professionals`;
}

/**
 * The recap of steps 1 and 2, as one tappable card.
 *
 * The card is the control, not the word "Edit" in its corner. Everything the
 * card shows — the service, the answers, the site, the start window — is edited
 * in the same place, so a single target that covers all of it is both the
 * honest mapping and the one that clears the touch floor without growing the
 * title row to 44px and pushing the artboard apart.
 */
function RecapCard({
  recap,
  onEdit,
}: {
  recap: ChooseVisitsRecap;
  onEdit?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit your request. ${recap.serviceName}. ${recap.facts}. ${recap.site}. ${recap.startLine}`}
      className={cn(
        "w-full rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-card",
        "transition-colors duration-fast hover:bg-surface-hover",
      )}
    >
      <span aria-hidden className="flex items-baseline gap-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-[-0.015em] text-text">
          {recap.serviceName}
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-text-link">Edit</span>
      </span>

      <span
        aria-hidden
        className="mt-1 block text-[12.5px] leading-[18px] text-text-muted"
      >
        {recap.facts}
      </span>

      <span aria-hidden className="my-2.5 block h-px bg-line" />

      <span
        aria-hidden
        className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-text-secondary"
      >
        <MapPin className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="min-w-0 truncate">{recap.site}</span>
      </span>
      <span
        aria-hidden
        className="flex items-center gap-2 text-[13px] font-medium text-text-secondary"
      >
        <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="min-w-0 truncate">{recap.startLine}</span>
      </span>
    </button>
  );
}

/**
 * How many estimates to ask for.
 *
 * Three tiles rather than the shipped chooser's three stacked rows, because at
 * this point in the flow the price is the comparison being made and a row of
 * three puts the three prices side by side. Native radios inside the labels, so
 * arrow-key navigation and the group announcement come from the platform rather
 * than from a roving `tabindex` written here.
 */
function EstimateCountChooser({
  tiers,
  planSize,
  onPlanSizeChange,
}: {
  tiers: readonly VisitTierOption[];
  planSize: number;
  onPlanSizeChange?: (planSize: number) => void;
}) {
  // `h3`, not a `<legend>`: the shell's header owns the `h1` and `ScreenHeading`
  // the `h2`, so this is the third level down — and a legend is a group name
  // rather than a heading, which would drop the question out of the outline a
  // screen-reader user navigates by.
  const labelId = useId();

  return (
    <section className="rounded-card border border-info-line bg-info-surface px-3.5 py-4">
      <h3 id={labelId} className="text-base font-extrabold text-text">
        How many estimates do you want?
      </h3>
      <p className="mt-1 mb-3 text-[13px] leading-[18px] text-navy-800">
        Each professional measures the site and prices it in writing.
      </p>

      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
        {tiers.map((tier) => {
          const checked = planSize === tier.planSize;
          return (
            <label
              key={tier.planSize}
              className={cn(
                "flex min-h-[92px] cursor-pointer flex-col items-center gap-1.5",
                "rounded-card bg-surface text-center transition-colors duration-fast",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                // The chosen tile's border thickens by a pixel and its padding
                // loses one, so choosing never nudges the tile beside it.
                checked
                  ? "border-2 border-action-secondary px-[5px] py-[9px]"
                  : "border border-navy-100 px-1.5 py-2.5 hover:bg-surface-hover",
              )}
            >
              <input
                type="radio"
                name="estimate-count"
                value={tier.planSize}
                checked={checked}
                onChange={() => onPlanSizeChange?.(tier.planSize)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-[11px]",
                  "text-base font-extrabold tabular-nums",
                  checked
                    ? "bg-action-secondary text-action-secondary-text"
                    : "bg-surface-sunken text-text-secondary",
                )}
              >
                {tier.planSize}
              </span>
              <span
                aria-hidden
                className={cn(
                  "text-[11px]",
                  checked ? "font-bold text-text" : "font-semibold text-text-muted",
                )}
              >
                {tier.planSize === 1 ? "professional" : "professionals"}
              </span>
              <span
                aria-hidden
                className={cn(
                  "text-[13px] tabular-nums text-text",
                  checked ? "font-extrabold" : "font-bold",
                )}
              >
                {tier.priceLabel}
              </span>
              {/* The tile is three glyph fragments; the whole answer is spoken
                  once here rather than assembled from them. */}
              <span className="sr-only">
                {`${professionals(tier.planSize)}, ${tier.priceLabel}`}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One requested visit and its time.
 *
 * `PickerRow`'s shape and its exact token vocabulary — `border-line bg-surface`
 * settled, `border-[1.5px] border-action bg-action-surface` with
 * `text-warning-text` outstanding — plus the leading index chip the artboard
 * adds, which ties the row to the numbered tile the customer just chose above
 * it. That chip is the only reason this is not a `PickerRow` call.
 */
function VisitSlotRowButton({
  visit,
  onPick,
}: {
  visit: VisitSlotRow;
  onPick?: (index: number) => void;
}) {
  const outstanding = visit.when === null;

  return (
    <button
      type="button"
      onClick={() => onPick?.(visit.index)}
      aria-label={
        outstanding
          ? `Visit ${visit.index}. Choose a time.`
          : `Visit ${visit.index}. Currently ${visit.when}. Change`
      }
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-card border px-3.5 py-2 text-left",
        "transition-colors duration-fast",
        outstanding
          ? "border-[1.5px] border-action bg-action-surface hover:bg-signal-100"
          : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
          "text-[13px] font-extrabold tabular-nums",
          outstanding
            ? "bg-signal-100 text-signal-700"
            : "bg-surface-sunken text-text-secondary",
        )}
      >
        {visit.index}
      </span>

      <span aria-hidden className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[11px] font-semibold",
            outstanding ? "text-warning-text" : "text-text-muted",
          )}
        >
          {`Visit ${visit.index}`}
        </span>
        <span
          className={cn(
            "block truncate text-[13.5px] font-semibold",
            outstanding ? "text-text-muted" : "text-text",
          )}
        >
          {visit.when ?? "Choose a time"}
        </span>
      </span>

      <span
        aria-hidden
        className={cn(
          "shrink-0 text-[13px] font-semibold",
          outstanding ? "text-warning-text" : "text-text-link",
        )}
      >
        {outstanding ? "Choose" : "Change"}
      </span>
    </button>
  );
}

export function ChooseVisitsScreen({
  recap,
  tiers,
  planSize,
  chosenPriceLabel,
  visits,
  step = 3,
  total = 3,
  onBack,
  onEdit,
  onPlanSizeChange,
  onPickVisit,
  onSend,
}: ChooseVisitsScreenProps) {
  // Every visit owns its own time, so the send is gated on all of them rather
  // than on a count. A request sent with a hole in it is a request Operations
  // has to chase by phone.
  const outstanding = visits.some((visit) => visit.when === null);

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* `MobileScreen`'s header, measurement for measurement. The status-bar
          inset is the artboard frame's, not a real device's. */}
      <header className="shrink-0 border-b border-line bg-surface pt-11">
        <div className="flex h-14 items-center gap-1 px-1">
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control",
              "text-text-secondary hover:bg-surface-hover hover:text-text",
            )}
          >
            <span className="sr-only">Back</span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>

          <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-bold text-text">
            {recap.serviceName}
          </h1>

          <span className="shrink-0 pr-2 text-xs font-semibold text-text-muted">
            {`Step ${step} of ${total}`}
          </span>
        </div>
        <StepMeter step={step} total={total} />
      </header>

      <main className="flex flex-1 flex-col gap-[14px] overflow-y-auto p-[14px]">
        <ScreenHeading title="Choose visits & send" />

        <RecapCard recap={recap} onEdit={onEdit} />

        <EstimateCountChooser
          tiers={tiers}
          planSize={planSize}
          onPlanSizeChange={onPlanSizeChange}
        />

        <div>
          <FieldLabel>Pick a time for each visit</FieldLabel>
          <div className="flex flex-col gap-2">
            {visits.map((visit) => (
              <VisitSlotRowButton
                key={visit.index}
                visit={visit}
                onPick={onPickVisit}
              />
            ))}
          </div>
        </div>
      </main>

      {/* The reassurance sits *above* the action, not below it: it is the
          promise that makes the tap safe to make, so it has to be read before
          the tap rather than explain it afterwards. */}
      <footer
        className={cn(
          "shrink-0 border-t border-line bg-surface px-3.5 pt-3",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs leading-5 text-text-muted">
            {`Free to send. ${chosenPriceLabel} only when a professional confirms a time.`}
          </p>
          <Button
            block
            variant="secondary"
            onClick={onSend}
            disabled={outstanding}
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            {`Send to ${professionals(planSize)}`}
          </Button>
        </div>
      </footer>
    </div>
  );
}
