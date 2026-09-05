import { Button, cn } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

/**
 * The bottom sheet that turns "type six lines" into "tap six tiles".
 *
 * A partner standing in a customer's flat is not going to type "Switch (6A)"
 * eight times, and the estimate that never gets written is the job that never
 * gets quoted. So the sheet offers the items this partner actually charges for,
 * as targets big enough to hit one-handed, and the row it adds is editable the
 * moment it lands.
 *
 * ## The rate is the partner's own, and the label says whose it is
 *
 * `lastRate` is what THIS partner last charged for this item. It is not a
 * platform suggestion, a market average, or a recommended price, and the tile is
 * labelled "Nos · last ₹80" rather than "₹80" so it cannot be read as one.
 *
 * That distinction is FE-6, not a copy preference. Vsolve does not publish
 * prices on a partner's behalf: a number this app invented and dropped into a
 * partner's estimate would be an unpublished price presented as theirs, and the
 * customer would receive it as the partner's quote. The explanatory line
 * ("set your own price after adding") exists for the same reason — the rate is a
 * starting point the partner owns, and changing it is the expected next step,
 * not a correction.
 *
 * Presentational. It holds no selection state and adds nothing; the composer
 * above it owns `selectedIds` and what happens on submit.
 */

/**
 * One tappable item.
 *
 * Defined here rather than in the estimate view model because a preset is not
 * part of an estimate — it is the partner's own history of what they charge,
 * which reaches this screen from a different read and outlives any one document.
 *
 * `lastRate` arrives already formatted. Nothing in this file does arithmetic on
 * money or renders a rupee sign it derived itself.
 */
export interface QuickAddPreset {
  id: string;
  /** e.g. "Switch (6A)". Shown verbatim; the partner named it. */
  name: string;
  /** What it is counted in, e.g. "Nos". */
  unit: string;
  /** What this partner last charged, formatted, e.g. "₹80". Never a suggestion. */
  lastRate: string;
}

export interface QuickAddSheetProps {
  presets: readonly QuickAddPreset[];
  /**
   * Which presets are currently ticked. The one source of truth for selection —
   * a `selected` flag on the preset itself would be a second one, and the two
   * would eventually disagree.
   */
  selectedIds: readonly string[];
}

export function QuickAddSheet({ presets, selectedIds }: QuickAddSheetProps) {
  const count = selectedIds.length;

  return (
    <div
      className={cn(
        "flex max-h-[88%] flex-col rounded-t-card border border-line/60 bg-surface",
        "shadow-overlay",
      )}
    >
      <div className="flex shrink-0 justify-center pb-1 pt-3">
        <span aria-hidden className="h-1 w-10 rounded-full bg-line-strong" />
      </div>

      <div className="shrink-0 px-5 pb-3 pt-2">
        <h2 className="text-base font-bold text-text">Quick add common items</h2>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Tap to add a row. The rate shown is what <strong className="font-bold">you</strong> last
          charged — set your own price after adding.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto px-5 pt-1">
        {presets.map((preset) => (
          <PresetTile
            key={preset.id}
            preset={preset}
            selected={selectedIds.includes(preset.id)}
          />
        ))}
      </div>

      <div className="shrink-0 px-5 pt-3">
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-control",
            "border-[1.5px] border-dashed border-line-strong",
            "text-sm font-bold text-text-secondary",
            "transition-colors duration-fast ease-out hover:bg-surface-hover",
          )}
        >
          <Pictogram name="more" size="sm" />
          Add a custom item
        </button>
      </div>

      <div
        className={cn(
          "mt-3.5 flex shrink-0 justify-end gap-2 border-t border-line px-5 pt-4",
          "pb-[max(1.625rem,env(safe-area-inset-bottom))]",
        )}
      >
        <Button variant="ghost">Cancel</Button>
        {/* Navy rather than orange: the primary action on this screen is the one
            that ends it, and the sheet sits over a screen whose own orange "+"
            is what opened it. */}
        <Button variant="secondary">
          Add {count} {count === 1 ? "item" : "items"}
        </Button>
      </div>
    </div>
  );
}

/**
 * One preset, as a target rather than a row.
 *
 * Selected is carried by three things at once — a two-pixel navy edge, a tinted
 * fill, and a tick — because plan 03 forbids state signalled by colour alone,
 * and because a partner glancing at this in a stairwell has to count what they
 * have picked without reading. `aria-pressed` says the same thing to a screen
 * reader; the tick is decorative once it does.
 *
 * The border thickens by a pixel on selection and the padding loses one, so
 * ticking a tile does not resize it and reflow the grid under the partner's
 * thumb — the same trick `LedgerRow` uses when a row opens.
 */
function PresetTile({ preset, selected }: { preset: QuickAddPreset; selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex min-h-15 items-center gap-2.5 rounded-card text-left",
        "transition-colors duration-fast ease-out",
        selected
          ? "border-2 border-selected bg-selected-surface p-[8px_9px]"
          : "border border-line bg-surface p-[9px_10px] hover:bg-surface-hover",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-[0.6875rem]",
          selected ? "bg-selected text-text-inverse" : "bg-surface-sunken text-text-secondary",
        )}
      >
        <Pictogram name="all-work" size="sm" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-bold tracking-[-0.01em] text-text">
          {preset.name}
        </span>
        {/* "last" is doing real work here: it says the number is this partner's
            own history, not a price Vsolve is recommending. See FE-6 above. */}
        <span className="mt-0.5 truncate text-[10.5px] font-medium tabular-nums text-text-muted">
          {preset.unit} · last {preset.lastRate}
        </span>
      </span>

      {selected ? (
        <Pictogram name="yes" size="sm" className="shrink-0 text-text-link" />
      ) : null}
    </button>
  );
}
