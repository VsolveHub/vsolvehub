import { Button, Input, StepDock, cn } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";
import type {
  ChargeCode,
  ChargeView,
  EstimateView,
} from "@/features/proposal/model/estimate-view";
import {
  BackGlyph,
  FocusedHeader,
  HeaderTile,
} from "@/features/proposal/view/parts/focused-header";

/**
 * The step between the priced lines and the money summary: everything that is a
 * real cost but is not labour — the tempo run, the two men who carried the DB
 * box up four floors, the municipal permit.
 *
 * ## The vocabulary is closed, and that is the whole screen
 *
 * The description is a select, never a text field, and there is deliberately no
 * "Miscellaneous". Every reference estimate this replaces had one, and it is
 * where the padding went: a charge the customer cannot identify is a charge they
 * cannot agree to, so they either query the whole estimate or quietly stop
 * replying. `ChargeCode` on the view type encodes that — the generic option is
 * not representable — and `CHARGE_OPTIONS` below is that type rendered. `CUSTOM`
 * exists for the genuine one-off, but it is a *named* custom: the partner has to
 * say what it is, which is exactly the cost of adding one.
 *
 * The sub-line under the heading says the rule out loud rather than leaving it to
 * be inferred from a short list, because a partner who reads "Named charges only"
 * once does not go looking for the free-text box.
 *
 * ## Open in place, not a picker sheet
 *
 * One charge carries its options inline (`openChargeId`) instead of opening an OS
 * picker. Six options is a list a partner reads at a glance, and keeping it on
 * the card means the amount they are about to justify stays on screen beside it.
 * Only one opens at a time — two expanded lists on a 390px screen leaves neither
 * the charges nor the totals visible.
 *
 * ## Pure, and unwired on purpose
 *
 * Props in, JSX out. It fetches nothing, holds no state and does no arithmetic —
 * `Items total`, `Other charges` and `Subtotal` all arrive pre-formatted on
 * `EstimateView.totals`, because a screen that adds two of its own figures is a
 * screen that will one day disagree with the invoice. The fields therefore carry
 * `defaultValue` rather than `value`; the handlers arrive with the composer that
 * mounts this.
 *
 * ## Why the card chrome is inline rather than `Card`
 *
 * `Card` is a 24px-padded surface. These are 12px and 14px, and `cn` is `clsx`
 * rather than `tailwind-merge` (see the note in `components/pictogram.tsx`), so a
 * padding passed as `className` joins the component's own instead of replacing
 * it and loses the tie. The border/background/radius are three tokens; spelling
 * them out is honest, and it is what `LedgerRow` does for the same reason.
 */

export interface ChargesScreenProps {
  estimate: EstimateView;
  /** The single charge rendered with its options open. Everything else stays shut. */
  openChargeId?: string;
}

/**
 * The controlled vocabulary, in the order a partner reaches for it.
 *
 * Travel and manpower first because they are on almost every job; the statutory
 * and one-off codes after. `CUSTOM` is last and is phrased as an instruction —
 * "name it" — so that choosing it reads as more work rather than as the easy
 * escape hatch, which is the behaviour a generic "Miscellaneous" rewards.
 */
const CHARGE_OPTIONS: readonly { code: ChargeCode; label: string }[] = [
  { code: "TRANSPORT", label: "Transportation" },
  { code: "LOADING_UNLOADING", label: "Loading & unloading" },
  { code: "DISPOSAL", label: "Disposal" },
  { code: "PERMIT_FEE", label: "Permit fee" },
  { code: "EQUIPMENT_DELIVERY", label: "Equipment delivery" },
  { code: "CUSTOM", label: "Something else — name it" },
];

/**
 * "₹200" -> "200".
 *
 * The amount arrives already formatted, and the field draws its own rupee sign
 * in the muted weight the design asks for — so the sign would otherwise be typed
 * twice. Display-only: nothing downstream parses this back into a number.
 */
function rupeeDigits(amount: string): string {
  return amount.replace(/[^\d,.]/gu, "");
}

export function ChargesScreen({ estimate, openChargeId }: ChargesScreenProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={estimate.documentTitle}
        backSlot={
          <HeaderTile>
            <BackGlyph label="Back to the estimate lines" />
          </HeaderTile>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-4">
        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-link">
            Other charges (if any)
          </h2>
          <p className="mt-[3px] text-[11.5px] font-medium leading-4 text-text-muted">
            Named charges only. Every charge is a real cost the customer can see.
          </p>
        </div>

        {estimate.charges.map((charge) => (
          <ChargeCard key={charge.id} charge={charge} open={charge.id === openChargeId} />
        ))}

        <AddChargeControl />

        {/* Server-derived, every figure. The divider is the only arithmetic on
            this screen and it is drawn, not computed. */}
        <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
          <TotalsRow label="Items total (labour)" value={estimate.totals.linesTotal} />
          <TotalsRow label="Other charges" value={estimate.totals.chargesTotal} />

          <span aria-hidden className="my-0.5 h-px bg-line" />

          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-text">Subtotal</span>
            <span className="text-[19px] font-extrabold tracking-[-0.02em] tabular-nums text-text">
              {estimate.totals.taxableValue}
            </span>
          </div>
        </div>
      </main>

      <StepDock>
        <Button block size="lg">
          Continue to summary
        </Button>
      </StepDock>
    </div>
  );
}

/**
 * One charge: what it is, what it costs, and the control that removes it.
 *
 * The open card thickens its border by a pixel and loses one of padding, so
 * opening a charge does not resize it and shift the totals below — the same
 * trick `LedgerRow` uses, and for the same reason.
 */
function ChargeCard({ charge, open }: { charge: ChargeView; open: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card bg-surface",
        open ? "border-2 border-action p-[11px]" : "border border-line p-3",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            "flex h-11 min-w-0 flex-1 items-center justify-between gap-1.5",
            "rounded-control border pl-3 pr-2.5 text-left text-sm font-semibold text-text",
            "transition-colors duration-fast ease-out",
            open ? "border-action bg-action-surface" : "border-line-strong bg-surface",
          )}
        >
          <span className="truncate">{charge.label}</span>
          {/* The pictogram set has one chevron — `back`. Rotated rather than
              redrawn, so the stroke weight stays identical to every other glyph. */}
          <Pictogram
            name="back"
            size="sm"
            className={cn("shrink-0", open ? "rotate-90" : "-rotate-90")}
          />
          <span className="sr-only">Change what this charge is</span>
        </button>

        <span className="relative w-24 shrink-0">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-text-muted"
          >
            ₹
          </span>
          <Input
            aria-label={`Amount for ${charge.label}`}
            inputMode="numeric"
            defaultValue={rupeeDigits(charge.amount)}
            placeholder="0"
            className="pl-7 font-bold tabular-nums"
          />
        </span>

        <RemoveChargeControl label={charge.label} />
      </div>

      {open ? <ChargeCodeList selected={charge.code} /> : null}
    </div>
  );
}

/**
 * The six codes, all of them, every time.
 *
 * Not truncated to what fits: a vocabulary the partner cannot see the end of is
 * one they will assume has a free-text option further down. The screen scrolls
 * instead.
 */
function ChargeCodeList({ selected }: { selected: ChargeCode }) {
  return (
    <ul className="mt-2 overflow-hidden rounded-[10px] border border-line bg-surface shadow-raised">
      {CHARGE_OPTIONS.map((option, index) => {
        const chosen = option.code === selected;

        return (
          <li key={option.code} className={cn(index > 0 && "border-t border-line")}>
            <button
              type="button"
              aria-current={chosen ? "true" : undefined}
              className={cn(
                "flex h-11 w-full items-center gap-2.5 px-3 text-left text-sm font-semibold",
                "transition-colors duration-fast ease-out",
                // signal-700 rather than the action role: signal-600 on the
                // signal-50 plate measures under 4.5:1, and this is text.
                chosen ? "bg-action-surface text-signal-700" : "text-text hover:bg-surface-hover",
              )}
            >
              {chosen ? (
                <Pictogram name="yes" size="sm" className="shrink-0" />
              ) : (
                // Holds the tick's column so the labels stay on one left edge.
                <span aria-hidden className="w-4 shrink-0" />
              )}
              <span className="truncate">{option.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 44x44, per the touch-target rule, even though the glyph inside it is 16px. */
function RemoveChargeControl({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-control text-danger-text",
        "transition-colors duration-fast ease-out hover:bg-danger-surface",
      )}
    >
      <Pictogram name="no" size="sm" />
      <span className="sr-only">Remove {label}</span>
    </button>
  );
}

/**
 * Adding a charge is a dashed row rather than a header "+".
 *
 * It sits at the end of the charges it extends, which is where a partner looks
 * after entering the last one, and its dashed edge says "not a charge yet"
 * without needing a label to explain that.
 */
function AddChargeControl() {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl",
        "border-[1.5px] border-dashed border-line-strong",
        "text-sm font-bold text-text-secondary",
        "transition-colors duration-fast ease-out hover:bg-surface-hover",
      )}
    >
      <Pictogram name="more" size="sm" />
      Add another charge
    </button>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
      <span className="text-text-secondary">{label}</span>
      <span className="font-bold tabular-nums text-text">{value}</span>
    </div>
  );
}
