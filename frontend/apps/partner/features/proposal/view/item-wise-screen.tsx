"use client";

import type { ReactNode } from "react";

import { Button, Input, QuantityStepper, SectionBand, Select, StepDock, cn } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";
import type { EstimateLineView, EstimateView } from "@/features/proposal/model/estimate-view";
import {
  BackGlyph,
  FocusedHeader,
  HeaderTile,
} from "@/features/proposal/view/parts/focused-header";
import { LedgerRow } from "@/features/proposal/view/parts/ledger-row";

/**
 * The item-wise estimate: what the partner is charging, line by line.
 *
 * The screen a partner spends the most time on, and the one the whole M2 pricing
 * story rests on — so it is a ledger, not a form. Collapsed rows read as a
 * document with section subtotals a partner can check at a glance; the one row
 * being edited opens in place and grows the four controls that change it. Only
 * one row is open at a time (`openLineId`), because two open rows on a 390px
 * screen means neither the list nor the editor fits.
 *
 * ## Labour only, and the row says so
 *
 * Every line here prices the partner's labour. The material is the customer's to
 * buy, which is why the open row carries a "Material the customer buys" block
 * under a dashed rule rather than a second price column: the shopping list
 * assembles itself from rows the partner is already entering. The dock repeats
 * the rule where it cannot be missed — "Items total · labour only".
 *
 * ## Pure, and unwired on purpose
 *
 * Props in, JSX out. It fetches nothing, holds no data state and does no
 * arithmetic — every figure arrives pre-formatted from `EstimateView`, because a
 * screen that divides by 100 is a screen that will one day divide twice. The
 * controls therefore carry `defaultValue` rather than `value`, and the stepper
 * gets `NOT_WIRED`: the handlers arrive with the composer that mounts this, not
 * from a `useState` smuggled in here.
 *
 * ## Where the open row's values come from
 *
 * Straight off `EstimateLineView` — `unit`, `quantity` and `rate` are carried as
 * structured fields beside the pre-rendered `workings` string. They are not
 * parsed back out of it. An earlier revision did exactly that, and a display
 * string is the worst available source of truth for a form: it breaks on a
 * locale that groups digits differently, on a unit containing a space, and on
 * the day somebody types `x` instead of `×`.
 */

export interface ItemWiseScreenProps {
  estimate: EstimateView;
  /** The single line rendered open. Everything else stays collapsed. */
  openLineId?: string;
}

/**
 * The units an estimate line is counted in.
 *
 * Presented in the order a trades partner reaches for them — piece counts first,
 * because most electrical, plumbing and fitting lines are counted rather than
 * measured. The line's own unit is prepended when it is not one of these, so a
 * unit the server already accepted is never silently swapped for "Nos".
 */
const UNIT_OPTIONS = ["Nos", "No", "Sqft", "Rft", "Point", "Job", "Hours", "Days"] as const;

/**
 * Stands in for the handler the wired composer will pass.
 *
 * Deliberately a named constant rather than an inline arrow: an inline `() => {}`
 * at the call site reads as an oversight, and this one is a decision. The screen
 * is presentational; nothing here may own the value the stepper shows.
 */
const NOT_WIRED = (): void => undefined;

interface LineWorkings {
  quantity: number;
  unit: string;
  /** Digits and grouping only — the rupee sign is drawn by the field, not stored. */
  rate: string;
}

function lineFields(line: EstimateLineView): LineWorkings {
  const quantity = Number(line.quantity);

  return {
    // The stepper needs a number and the view carries a decimal string, because
    // half-days and square feet are both real. A quantity that will not parse
    // falls back to one rather than to zero: a zero-quantity row prices at
    // nothing and looks deliberate.
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit: line.unit,
    // The field draws its own rupee prefix, so the value carries digits only.
    rate: line.rate.replace(/^\s*₹\s*/u, ""),
  };
}

export function ItemWiseScreen({ estimate, openLineId }: ItemWiseScreenProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={estimate.documentTitle}
        backSlot={
          <HeaderControl>
            <HeaderTile>
              <BackGlyph label="Back to the estimate" />
            </HeaderTile>
          </HeaderControl>
        }
        trailing={
          <HeaderControl>
            <HeaderTile emphasis>
              <Pictogram name="more" size="md" className="[stroke-width:2.2]" />
              <span className="sr-only">Add an item</span>
            </HeaderTile>
          </HeaderControl>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3 pt-3">
        {estimate.sections.map((section) => (
          <section key={section.id}>
            <SectionBand trailing={section.subtotal}>{section.title}</SectionBand>

            <div className="flex flex-col gap-2">
              {section.lines.map((line) => (
                <EstimateLine key={line.id} line={line} open={line.id === openLineId} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <StepDock label="Items total · labour only" amount={estimate.totals.linesTotal}>
        <Button block size="lg">
          Continue to charges
        </Button>
      </StepDock>
    </div>
  );
}

/**
 * Makes a header tile operable without reshaping it.
 *
 * `HeaderTile` renders a span, because the caller decides whether a tile is a
 * link or a button and this package owns no router. Wrapping rather than
 * restyling keeps the 44x44 target and the tile's own chrome exactly as the kit
 * draws them; the accessible name comes from the `sr-only` text inside.
 */
function HeaderControl({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 rounded-2xl",
        // navy-600 is invisible against the header's navy gradient; the inverse
        // ring is the one that can actually be seen here.
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "focus-visible:outline-focus-ring-inverse",
      )}
    >
      {children}
    </button>
  );
}

function EstimateLine({ line, open }: { line: EstimateLineView; open: boolean }) {
  return (
    <LedgerRow
      name={line.name}
      amount={line.amount}
      meta={line.workings}
      buyNote={line.buy?.note}
      open={open}
      removeSlot={open ? <RemoveLineControl name={line.name} /> : undefined}
    >
      <OpenLineFields line={line} />
    </LedgerRow>
  );
}

/** 44x44, per the touch-target rule, even though the glyph inside it is 16px. */
function RemoveLineControl({ name }: { name: string }) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-control text-danger-text",
        "transition-colors duration-fast ease-out hover:bg-danger-surface",
      )}
    >
      <Pictogram name="no" size="sm" />
      <span className="sr-only">Remove {name}</span>
    </button>
  );
}

/**
 * What an open row grows: the three numbers that make the amount, and the
 * material the customer has to go and buy for it.
 *
 * The stepper sits on its own line rather than beside the rate. `QuantityStepper`
 * renders a visible label — that is the whole point of the component, and it is
 * what makes "3" mean something to a screen reader with three steppers on one
 * screen — and a label plus a 136px control does not fit beside an 96px select
 * and a 92px rate on a 390px phone. Splitting the line keeps the kit's stepper
 * rather than hand-rolling a labelless copy of it.
 */
function OpenLineFields({ line }: { line: EstimateLineView }) {
  const workings = lineFields(line);
  const units = UNIT_OPTIONS.includes(workings.unit as (typeof UNIT_OPTIONS)[number])
    ? [...UNIT_OPTIONS]
    : [workings.unit, ...UNIT_OPTIONS];

  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0">
          <Select
            aria-label={`Unit for ${line.name}`}
            defaultValue={workings.unit}
            className="font-semibold"
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </span>

        <span className="relative w-23 shrink-0">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-text-muted"
          >
            ₹
          </span>
          <Input
            aria-label={`Rate per ${workings.unit} for ${line.name}`}
            inputMode="numeric"
            defaultValue={workings.rate}
            placeholder="0"
            className="pl-7 font-bold tabular-nums"
          />
        </span>
      </div>

      <QuantityStepper
        label="Quantity"
        value={workings.quantity}
        onChange={NOT_WIRED}
        unit={workings.unit}
        decrementLabel={`One less ${line.name}`}
        incrementLabel={`One more ${line.name}`}
      />

      <div className="mt-0.5 border-t border-dashed border-warm-300 pt-3">
        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-signal-700">
          <Pictogram name="all-work" size="xs" />
          Material the customer buys
        </span>

        <div className="flex gap-2">
          <span className="min-w-0 flex-1">
            <Input
              aria-label={`Material the customer buys for ${line.name}`}
              defaultValue={line.buy?.name ?? ""}
              placeholder="What to buy"
              className="text-sm font-semibold"
            />
          </span>

          <span className="w-21 shrink-0">
            <Input
              aria-label={`How much material for ${line.name}`}
              defaultValue={line.buy?.quantity ?? ""}
              placeholder="How many"
              className="text-sm font-bold tabular-nums"
            />
          </span>
        </div>
      </div>
    </div>
  );
}
