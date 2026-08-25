import Link from "next/link";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import {
  Badge,
  Button,
  SectionBand,
  SegmentedTrack,
  StepDock,
  cn,
  formatMoney,
  segmentStyles,
} from "@vsolve/ui";

/**
 * "The work" — one half of a LABOUR-ONLY estimate.
 *
 * ## Which quote this is, and which it is not
 *
 * M2 estimates come in two shapes and they must never be shown in one another's
 * clothes. On the project quote the partner supplies the materials inside the
 * price, so the total is the whole cost of the job and there is nothing for the
 * customer to buy. This screen is the other shape: Ramesh quotes his labour, and
 * the switches, pipes and paint are bought by the customer at a shop. The ₹2,513
 * here is *not* the cost of finishing the room, and a customer who reads it as
 * one has been misled by the screen rather than by the partner.
 *
 * So the fact is stated twice and early: a warning strip directly under the
 * segmented control, and the dock's own sub-line, which names labour and charges
 * separately so the total cannot be mistaken for an all-in figure. The strip is
 * a link because "you buy 9 materials yourself" raises exactly one question —
 * *which nine?* — and the answer is one tap away.
 *
 * ## One quote, two views
 *
 * The materials list is not a second document. It is this quote read the other
 * way round, which is why the two are segments of one control rather than two
 * entries in a list: nothing about the estimate changes between them, only which
 * column of it the customer is looking at. The unselected segment is a `<Link>`
 * (see `segmentStyles`' own note) so the browser's back button, a reload and a
 * shared URL all behave.
 *
 * ## Pure by construction
 *
 * `supplied_by` is requested in proposal 0015 and not yet published, so there is
 * no DTO behind this and nothing to fetch. Props in, JSX out. Amounts arrive in
 * paise and are formatted here; the screen adds nothing up — every subtotal and
 * total is supplied, so a row and its band can never disagree because they were
 * computed in two places.
 */

export interface BreakdownLine {
  id: string;
  /** The work done, e.g. "Switch (6A) — fitting". */
  label: string;
  /** Rate and count, e.g. "5 Nos × ₹80". Omitted on a flat charge. */
  quantity?: string;
  /** Paise. Server-derived; this screen only formats it. */
  amountPaise: number;
}

export interface BreakdownSection {
  id: string;
  /** The group name, e.g. "Wiring & points". Rendered uppercase by the band. */
  title: string;
  /** Paise. Supplied, never summed here — see the note above. */
  subtotalPaise: number;
  lines: readonly BreakdownLine[];
}

export interface QuoteBreakdownScreenProps {
  /** The partner whose estimate this is, e.g. "Ramesh Electricals". */
  partnerName: string;
  /** How the estimate is priced, e.g. "Item-wise". Shown as the header badge. */
  modeLabel: string;
  /** How many materials the customer buys. Drives the segment and the strip. */
  materialCount: number;
  sections: readonly BreakdownSection[];
  /** Paise. The three labour bands, as one figure for the dock's sub-line. */
  labourPaise: number;
  /** Paise. Transport and handling — priced, but not labour. */
  chargesPaise: number;
  /** e.g. "GST 18%". The rate is the server's to state, not this screen's. */
  taxLabel: string;
  taxPaise: number;
  /** Paise. What the customer actually pays the partner. */
  totalPaise: number;
  /** The other view of this same quote. */
  materialsHref: string;
  onBack?: () => void;
  onChoose?: () => void;
}

export function QuoteBreakdownScreen({
  partnerName,
  modeLabel,
  materialCount,
  sections,
  labourPaise,
  chargesPaise,
  taxLabel,
  taxPaise,
  totalPaise,
  materialsHref,
  onBack,
  onChoose,
}: QuoteBreakdownScreenProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-1 px-2">
          {/* 44px, not the 36px glyph box the artboard draws: this is the
              control itself, so it has to be the whole touch target. */}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span className="sr-only">Back</span>
            <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          </button>

          <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-bold text-text">
            {partnerName}
          </h1>

          <div className="flex shrink-0 items-center pr-1">
            <Badge tone="action">{modeLabel}</Badge>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-3 pb-4">
        <SegmentedTrack label="Two views of one quote">
          <span aria-current="page" className={segmentStyles({ selected: true })}>
            The work
          </span>
          <Link href={materialsHref} className={segmentStyles()}>
            Materials to buy · {materialCount}
          </Link>
        </SegmentedTrack>

        {/* The question every labour-only estimate provokes, answered above the
            first rupee rather than in a footnote under the total. */}
        <Link
          href={materialsHref}
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5",
            "border border-warning-line bg-warning-surface",
            "hover:bg-signal-100",
          )}
        >
          <ShoppingBag aria-hidden className="h-[18px] w-[18px] shrink-0 text-signal-700" />
          <span className="min-w-0 flex-1 text-[12.5px] leading-[17px] text-warning-text">
            This price is <strong className="font-bold">labour only</strong>. You buy{" "}
            {materialCount} materials yourself.
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-signal-700" />
        </Link>

        {sections.map((section) => (
          <section key={section.id}>
            <SectionBand trailing={formatMoney(section.subtotalPaise)}>
              {section.title}
            </SectionBand>

            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {section.lines.map((line) => (
                <div key={line.id} className="flex items-baseline gap-2.5 px-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-text">
                      {line.label}
                    </span>
                    {line.quantity === undefined ? null : (
                      <span className="mt-0.5 block text-[11.5px] text-text-muted">
                        {line.quantity}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-text">
                    {formatMoney(line.amountPaise)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      <StepDock label="You pay" amount={formatMoney(totalPaise)}>
        {/* Left-aligned under the amount, not centred under the button: it is
            the total's own composition, so it reads as part of that number. */}
        <p className="text-[11.5px] text-text-muted">
          Labour {formatMoney(labourPaise)} · Charges {formatMoney(chargesPaise)} · {taxLabel}{" "}
          {formatMoney(taxPaise)}
        </p>
        <Button block onClick={onChoose} className="h-[50px] rounded-[11px] text-[15px]">
          Choose this estimate
        </Button>
      </StepDock>
    </div>
  );
}
