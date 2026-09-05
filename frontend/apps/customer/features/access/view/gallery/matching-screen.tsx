"use client";

import { Calendar, Check, Radio } from "lucide-react";
import { Badge, Button, cn } from "@vsolve/ui";

/**
 * A5 · Matching — one professional per requested visit, each found separately.
 *
 * ## Why every visit carries its own state
 *
 * A visit plan asks several professionals for a price, and they answer
 * independently: one accepts in four minutes, one is still being offered around,
 * and one slot has nobody free at all. A single screen-level status — "Finding
 * professionals" — would be true of the middle one and a lie about the other
 * two, and the customer would have no way to see that the Thursday slot is the
 * one that needs a different time.
 *
 * So the state lives on the card, not on the screen. Three cards, three badges,
 * three different bodies. The failure of one is visibly contained to that card:
 * "Choose another time" appears on the unmatched slot only, and the held and
 * searching siblings are untouched by it.
 *
 * ## Nothing here says "booked"
 *
 * Held is not booked. A professional has accepted the time and is holding it for
 * a few minutes while the customer pays; nothing has been charged and nothing is
 * confirmed. The badge says "Held", the strip says "Nothing has been charged
 * yet.", and the footer says what paying would actually do. `VisitTrackerScreen`
 * is the only screen in this flow allowed to show "Booked", because it is the
 * only one that runs after payment.
 *
 * ## Why the counts are derived
 *
 * "1 of 3 visits has a professional" is computed from the same array the cards
 * are rendered from, so the sentence cannot disagree with the list under it —
 * which is exactly the defect that a hand-written headline produces the first
 * time a state changes.
 *
 * ## Why this is a gallery component and not a route
 *
 * There is no customer-facing DTO behind it: BE-2/BE-3/BE-4 are unpublished, and
 * the matching state lives under `/api/v1/partner/…`. Rather than invent DTOs and
 * ship a screen that pretends to be wired, this is a pure component — props in,
 * JSX out, no fetching and no data state — rendered from fixed sample values at
 * `/design/m2/matching`.
 *
 * ## Why it carries its own shell rather than `MobileScreen`
 *
 * `MobileScreen` is the shipped shell and this header is a copy of it, down to
 * the truncation rule — but its root is `min-h-[100dvh]`, which is right for a
 * real route and wrong inside a 390x844 artboard frame, where a viewport taller
 * than 844px would push the docked footer under the frame's `overflow-hidden`.
 * The measurements below are the same ones.
 */

export type MatchingVisitState = "HELD" | "SEARCHING" | "NO_PROFESSIONAL_FOUND";

interface VisitBase {
  /** 1-based, and the number shown on the card. */
  index: number;
  /** "Tue 2 Sep". */
  day: string;
  /** "10:00 – 12:00". */
  window: string;
}

/**
 * One requested visit. A discriminated union rather than a bag of optional
 * fields, so a HELD card cannot be rendered without the countdown it exists to
 * show, and a SEARCHING card cannot silently lose its offer counts.
 */
export type MatchingVisit =
  | (VisitBase & {
      state: "HELD";
      /** Already formatted against the server clock — this screen owns no timer. */
      holdRemaining: string;
    })
  | (VisitBase & {
      state: "SEARCHING";
      offeredTo: number;
      availableCount: number;
    })
  | (VisitBase & { state: "NO_PROFESSIONAL_FOUND" });

export interface MatchingProfessional {
  /** "Ravi K." — the short form, which is all a held slot has earned. */
  shortName: string;
  initials: string;
  trade: string;
  rating: string;
  visitCount: number;
}

export interface MatchingScreenProps {
  serviceName: string;
  visits: readonly MatchingVisit[];
  /** Who accepted the held slot. */
  professional: MatchingProfessional;
  /** Server-published. The client never invents a price. */
  planPriceLabel: string;
  /**
   * The fixed empty-state sentence, passed in rather than written here so the
   * one place it is worded stays the one place it is worded. It must say plainly
   * that nothing has been charged — see FE-2.
   */
  noProfessionalCopy: string;
  onBack?: () => void;
  /** Offered on the unmatched slot only. */
  onChooseAnotherTime?: (visitIndex: number) => void;
  onPay?: () => void;
}

/**
 * State as a tone *and* a word, never a tone alone (plan 03).
 *
 * The three words are deliberately unlike each other. "Held" and "Searching"
 * would both be defensible as "In progress", and collapsing them would hide the
 * one distinction the customer acts on: a held slot is waiting on them, a
 * searching one is not.
 */
function VisitStateBadge({ state }: { state: MatchingVisitState }) {
  if (state === "HELD") {
    return (
      <Badge tone="warning" dot>
        Held
      </Badge>
    );
  }
  if (state === "SEARCHING") {
    return (
      <Badge tone="info" dot>
        Searching
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dot>
      No professional found
    </Badge>
  );
}

/** The accepted professional, as a row inside the held card. */
function ProfessionalRow({ professional }: { professional: MatchingProfessional }) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5 rounded-[12px] bg-surface-sunken px-2.5 py-2">
      <span
        aria-hidden
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          "bg-action-secondary text-[13px] font-extrabold text-action-secondary-text",
        )}
      >
        {professional.initials}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-text">
          {professional.shortName}
        </span>
        <span className="block truncate text-[11.5px] text-text-muted">
          {`${professional.trade} · ${professional.rating} rating · ${professional.visitCount} visits`}
        </span>
      </span>

      <Check aria-hidden className="h-4 w-4 shrink-0 text-success-text" />
    </div>
  );
}

/**
 * How far the offer has travelled.
 *
 * The rail is `aria-hidden` because the sentence above it already states both
 * numbers; announcing a decorative bar after them would say the same thing twice
 * and less clearly. Its widths come from the counts rather than a class, since a
 * Tailwind class built from a variable compiles to nothing.
 */
function OfferProgress({ offeredTo, availableCount }: { offeredTo: number; availableCount: number }) {
  const remaining = Math.max(0, availableCount - offeredTo);

  return (
    <div aria-hidden className="flex gap-[3px]">
      <span
        className="h-1 rounded-full bg-info-text"
        style={{ flexGrow: offeredTo, flexBasis: 0 }}
      />
      <span
        className="h-1 rounded-full bg-warm-300"
        style={{ flexGrow: remaining, flexBasis: 0 }}
      />
    </div>
  );
}

function VisitCard({
  visit,
  professional,
  noProfessionalCopy,
  onChooseAnotherTime,
}: {
  visit: MatchingVisit;
  professional: MatchingProfessional;
  noProfessionalCopy: string;
  onChooseAnotherTime?: (visitIndex: number) => void;
}) {
  return (
    <article className="rounded-card border border-line bg-surface p-[14px] shadow-card">
      <div className="flex items-center justify-between gap-2.5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {`Visit ${visit.index}`}
        </h3>
        <VisitStateBadge state={visit.state} />
      </div>

      <p className="mt-2.5 text-[15px] font-bold tracking-[-0.015em] text-text">
        {`${visit.day} · ${visit.window}`}
      </p>

      {visit.state === "HELD" ? (
        <>
          <ProfessionalRow professional={professional} />
          <p className="mt-2 text-[12.5px] leading-[18px] text-text-secondary">
            Accepted your time. Held for{" "}
            <strong className="font-bold text-warning-text">{visit.holdRemaining}</strong> while you
            pay.
          </p>
        </>
      ) : null}

      {visit.state === "SEARCHING" ? (
        <>
          <p className="mb-1.5 mt-2.5 text-[12.5px] leading-[18px] text-text-secondary">
            {`Offered to ${visit.offeredTo} of ${visit.availableCount} available professionals.`}
          </p>
          <OfferProgress offeredTo={visit.offeredTo} availableCount={visit.availableCount} />
        </>
      ) : null}

      {visit.state === "NO_PROFESSIONAL_FOUND" ? (
        <>
          <p className="mt-2.5 text-[12.5px] leading-[18px] text-text-secondary">
            {noProfessionalCopy}
          </p>
          {/* The only recovery on the screen, and it sits on the only card that
              needs recovering. Outline rather than filled: it is the way out of
              a dead end, not the thing the screen is recommending. */}
          <Button
            block
            variant="outline"
            icon={<Calendar className="h-4 w-4" />}
            onClick={() => onChooseAnotherTime?.(visit.index)}
            className="mt-3"
          >
            Choose another time
          </Button>
        </>
      ) : null}
    </article>
  );
}

/** "Visit 1", "Visits 1 and 2", "Visits 1, 2 and 3". */
function heldVisitLabel(held: readonly MatchingVisit[]): string {
  const numbers = held.map((visit) => String(visit.index));
  const noun = numbers.length === 1 ? "Visit" : "Visits";
  const list =
    numbers.length <= 1
      ? numbers.join("")
      : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;

  return `${noun} ${list}`;
}

export function MatchingScreen({
  serviceName,
  visits,
  professional,
  planPriceLabel,
  noProfessionalCopy,
  onBack,
  onChooseAnotherTime,
  onPay,
}: MatchingScreenProps) {
  const held = visits.filter((visit) => visit.state === "HELD");

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
            {serviceName}
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 overflow-y-auto px-[14px] py-4">
        {/* The count is stated in words, so the summary survives greyscale and
            says the same thing to a screen reader as it does to an eye. */}
        <div className="flex items-center gap-3 rounded-card border border-info-line bg-info-surface px-[14px] py-3">
          <Radio aria-hidden className="h-5 w-5 shrink-0 text-info-text" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text">
              {`${held.length} of ${visits.length} visits ${
                held.length === 1 ? "has" : "have"
              } a professional`}
            </p>
            <p className="mt-0.5 text-xs text-info-text">Nothing has been charged yet.</p>
          </div>
        </div>

        <ul aria-label="Requested visits" className="m-0 flex list-none flex-col gap-3 p-0">
          {visits.map((visit) => (
            <li key={visit.index}>
              <VisitCard
                visit={visit}
                professional={professional}
                noProfessionalCopy={noProfessionalCopy}
                onChooseAnotherTime={onChooseAnotherTime}
              />
            </li>
          ))}
        </ul>
      </main>

      {/* The reassurance sits *above* the action: it is what makes the tap safe
          to make, so it has to be read before the tap rather than explain it
          afterwards. Its first clause names the visits paying would actually
          book, and is absent when paying would book none of them. */}
      <footer
        className={cn(
          "shrink-0 border-t border-line bg-surface px-3.5 pt-3",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs leading-5 text-text-muted">
            {held.length > 0 ? `Paying now books ${heldVisitLabel(held)}. ` : ""}
            Visits without a professional are refunded.
          </p>
          <Button block onClick={onPay} className="h-[50px] rounded-[11px] text-[15px]">
            {`Pay ${planPriceLabel} and confirm`}
          </Button>
        </div>
      </footer>
    </div>
  );
}
