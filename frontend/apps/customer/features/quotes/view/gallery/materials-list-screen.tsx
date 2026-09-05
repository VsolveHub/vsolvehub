import Link from "next/link";
import {
  Check,
  ChevronLeft,
  Download,
  Share2,
  ShoppingBag,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  SectionBand,
  SegmentedTrack,
  StepDock,
  formatMoney,
  segmentStyles,
} from "@vsolve/ui";

/**
 * "Materials to buy" — the same labour-only quote, read as a shopping list.
 *
 * ## The problem this screen removes
 *
 * When the estimate is labour only, the customer buys the switches, pipes and
 * paint. Today that means standing at a shop counter copying an item list onto
 * paper off a phone, getting a specification wrong, and coming home with a 6 A
 * switch where the quote assumed 16 A. The quote already contains the list. So
 * the quote becomes the list: same document, second view, nothing retyped.
 *
 * It is deliberately NOT the project quote's materials. There the partner buys
 * them and they sit inside the price; there is no list to carry to a shop and
 * showing one would invite a customer to pay twice for the same fittings.
 *
 * ## Two things stated plainly, because money is involved
 *
 * These items are not inside the estimate total, and V Solve Hub earns nothing
 * on them. Both are said in the strip at the top rather than in fine print at
 * the bottom, because a customer reading this in a shop will not scroll first.
 *
 * ## The tick boxes are for the shop, so the row is the target
 *
 * Each row is a `<label>` around a native checkbox: the whole row toggles, and
 * the 22px box is the *indicator*, never the button — a thumb in a hardware shop
 * does not hit a 22px square. The checkbox is uncontrolled and styled entirely
 * through `peer-checked:`, so ticking needs no React state and no client
 * boundary — the browser holds the ticks for as long as the page is open.
 * Checked state is carried by the native input for assistive tech, and shown by
 * a fill, a tick and a strike-through, so it survives greyscale and colour
 * blindness.
 *
 * ## Pure by construction
 *
 * `supplied_by` is requested in proposal 0015 and not yet published, so nothing
 * here fetches. Every count is derived from the list beneath it rather than
 * supplied beside it, so a heading can never claim six items over a list of five.
 */

/** Where the item is bought. Chooses the band's icon, nothing else. */
export type TradeKind = "electrical" | "hardware";

const TRADE_ICONS: Record<TradeKind, LucideIcon> = {
  electrical: Zap,
  hardware: Wrench,
};

export interface ShoppingItem {
  id: string;
  /** What to ask for, e.g. "Modular switch". */
  name: string;
  /** What makes it the right one, e.g. "6A, white". */
  specification: string;
  /** How many, with its unit, e.g. "5 Nos" — units vary per line (Nos, ft, set). */
  quantity: string;
}

export interface ShoppingGroup {
  id: string;
  /** The shop this list is carried into, e.g. "Electrical shop". */
  title: string;
  trade: TradeKind;
  items: readonly ShoppingItem[];
}

export interface MaterialsListScreenProps {
  /** Header title, also the label of the selected segment. */
  title: string;
  /** Who fits what is bought, e.g. "Ramesh". First name — this copy is spoken. */
  partnerFirstName: string;
  /** Paise. The labour estimate these materials are NOT part of. */
  quoteTotalPaise: number;
  groups: readonly ShoppingGroup[];
  /** The other view of this same quote. */
  workHref: string;
  onBack?: () => void;
  onShare?: () => void;
  onDownloadPdf?: () => void;
}

function countLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

export function MaterialsListScreen({
  title,
  partnerFirstName,
  quoteTotalPaise,
  groups,
  workHref,
  onBack,
  onShare,
  onDownloadPdf,
}: MaterialsListScreenProps) {
  const totalItems = groups.reduce((running, group) => running + group.items.length, 0);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span className="sr-only">Back</span>
            <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          </button>

          <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-bold text-text">
            {title}
          </h1>

          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-link hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span className="sr-only">Share this list</span>
            <Share2 aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-3 pb-4">
        <SegmentedTrack label="Two views of one quote">
          <Link href={workHref} className={segmentStyles()}>
            The work
          </Link>
          <span aria-current="page" className={segmentStyles({ selected: true })}>
            {title} · {totalItems}
          </span>
        </SegmentedTrack>

        {/* The whole point of the screen, said before the first item: don't copy
            this onto paper, and nobody is taking a cut of what you spend. */}
        <div className="flex gap-2.5 rounded-xl border border-info-line bg-info-surface px-3 py-2.5">
          <ShoppingBag aria-hidden className="mt-px h-[18px] w-[18px] shrink-0 text-text-link" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-[18px] text-navy-800">
              Show this at any electrical shop. {partnerFirstName} fits what you buy; V Solve
              Hub takes no cut on materials.
            </p>
            <p className="mt-1 text-[12.5px] font-bold leading-[18px] text-navy-800">
              These {totalItems} items are not part of the {formatMoney(quoteTotalPaise)}{" "}
              estimate.
            </p>
          </div>
        </div>

        {groups.map((group) => {
          const TradeIcon = TRADE_ICONS[group.trade];

          return (
            <section key={group.id}>
              <SectionBand>
                <span className="inline-flex items-center gap-2">
                  <TradeIcon aria-hidden className="h-[15px] w-[15px] text-text-link" />
                  {group.title} · {countLabel(group.items.length)}
                </span>
              </SectionBand>

              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {group.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex min-h-11 cursor-pointer items-center gap-[11px] px-3 py-2 hover:bg-surface-hover"
                  >
                    {/* Visually hidden, still the real control: it carries the
                        checked state to assistive tech and to the styling below. */}
                    <input type="checkbox" className="peer sr-only" />

                    <span
                      aria-hidden
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-[1.5px] border-line-strong bg-surface text-transparent transition-colors duration-fast peer-checked:border-action-secondary peer-checked:bg-action-secondary peer-checked:text-text-inverse peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
                    >
                      {/* `currentColor`, so the box's own text colour reveals it. */}
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>

                    <span className="min-w-0 flex-1 peer-checked:line-through peer-checked:opacity-60">
                      <span className="block text-[13.5px] font-bold tracking-[-0.01em] text-text">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-text-muted">
                        {item.specification}
                      </span>
                    </span>

                    <span className="inline-flex h-[30px] min-w-[56px] shrink-0 items-center justify-center rounded-lg bg-info-surface px-2.5 text-[13px] font-extrabold tabular-nums text-info-text">
                      {item.quantity}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <StepDock>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onDownloadPdf}
            className="h-[50px] shrink-0 rounded-[11px]"
            icon={<Download className="h-[17px] w-[17px]" />}
          >
            PDF
          </Button>
          <Button
            onClick={onShare}
            className="h-[50px] flex-1 rounded-[11px] text-[15px]"
            icon={<Share2 className="h-[18px] w-[18px]" />}
          >
            Share this list
          </Button>
        </div>
      </StepDock>
    </div>
  );
}
