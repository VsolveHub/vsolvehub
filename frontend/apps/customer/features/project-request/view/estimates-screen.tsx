"use client";

import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import type { QuoteCardView } from "@/features/quotes/adapters";
import { AwaitingEstimateCard, EstimateCard } from "./parts/estimate-card";

/**
 * A5 · 7 — Estimates.
 *
 * ## There is no sticky action, and that is the design
 *
 * Every other screen in this flow docks one button, because every other screen
 * has one thing to do. This one has two, and they are two different vendors —
 * a docked CTA would have to pick one, which is the choice the customer came
 * here to make. So the decision lives in the cards and the footer carries only
 * the promise that makes reading them safe: nothing is charged until you choose.
 *
 * ## No badge, no reordering
 *
 * Both estimates were priced after a site visit by a verified professional.
 * Ranking them, or marking one "recommended", would be this platform expressing
 * a preference between two vendors it has no basis to prefer between — on the
 * one screen whose entire job is letting the customer form their own. They are
 * presented in arrival order.
 *
 * ## The waiting card is not decoration
 *
 * A customer holding one estimate on a two-visit plan cannot otherwise tell
 * whether the second is coming or whether this is all they get, and the cost of
 * guessing wrong is choosing early. The dashed card says which visit it is
 * waiting on.
 */

export interface EstimatesScreenProps {
  cards: readonly QuoteCardView[];
  /** True when every estimate on this request shares one tax basis. */
  isComparableOnOneBasis: boolean;
  /** How many estimates the plan is still expecting. */
  awaiting: number;
  /** When the visit for the outstanding estimate happened, if known. */
  awaitingVisitedOn: string | null;
  /** Duration per proposal id, when the vendor dated their stages. */
  timelineFor: (proposalId: string) => string | null;
  onBack: () => void;
  onRead: (proposalId: string) => void;
  onChoose?: (proposalId: string) => void;
  isChoosing?: boolean;
  notice?: ReactNode;
}

export function EstimatesScreen({
  cards,
  isComparableOnOneBasis,
  awaiting,
  awaitingVisitedOn,
  timelineFor,
  onBack,
  onRead,
  onChoose,
  isChoosing = false,
  notice,
}: EstimatesScreenProps) {
  return (
    <MobileScreen
      title={cards.length === 1 ? "1 estimate" : `${cards.length} estimates`}
      onBack={onBack}
      // No action. See the header note.
      reassurance="Nothing is charged until you choose one."
    >
      {notice}

      <p className="text-[13.5px] leading-[21px] text-text-secondary">
        {isComparableOnOneBasis
          ? "Both priced after seeing the site, on the same tax basis."
          : "These state tax differently, so read the totals with that in mind."}
      </p>

      <div className="flex flex-col gap-3">
        {cards.map((card) => (
          <EstimateCard
            key={card.proposalId}
            card={card}
            isComparableOnOneBasis={isComparableOnOneBasis}
            timeline={timelineFor(card.proposalId)}
            onRead={() => onRead(card.proposalId)}
            onChoose={onChoose === undefined ? undefined : () => onChoose(card.proposalId)}
            isChoosing={isChoosing}
          />
        ))}

        {awaiting > 0 ? <AwaitingEstimateCard visitedOn={awaitingVisitedOn} /> : null}
      </div>

      {/* The other payment, named for the first time and kept apart from the
          visit fee. The project is funded stage by stage; the fee that bought
          these estimates was never part of it. */}
      <div className="flex items-start gap-2.5 rounded-[14px] border border-warm-300 bg-warm-100 px-3.5 py-3">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-[17px] w-[17px] shrink-0 text-text-secondary"
        >
          <path d="M10 2.5 4 5v4.5c0 3.4 2.5 6.5 6 8 3.5-1.5 6-4.6 6-8V5l-6-2.5Z" />
        </svg>
        <p className="text-[12.5px] leading-[19px] text-text">
          We hold each stage payment until you approve that stage.
        </p>
      </div>
    </MobileScreen>
  );
}
