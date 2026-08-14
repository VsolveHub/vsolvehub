"use client";

import { EmptyState } from "@vsolve/ui";
import { Users } from "lucide-react";
import { useCallback, useState } from "react";

import { AsyncSection, asyncStateFrom } from "@/components/async-section";

import type { CrewOfferAnswer } from "../model/offer-state";
import { usePartnerCrewOffers, type CrewOfferList as CrewOfferListPayload } from "../queries";
import { CrewOfferCard } from "./crew-offer-card";
import { CrewOfferOutcome } from "./crew-offer-outcome";

/**
 * The crew-offer inbox: every live offer this lead can still answer.
 *
 * `M2-FE-316`. Ordered by the server (`responds_by`, then `created_at`), so the
 * one about to run out is at the top and this list never reorders itself between
 * polls.
 *
 * ## Usually one row, and built for that
 *
 * A rate-card request has exactly one crew slot and the cascade sends a small
 * wave, so the ordinary state of this screen is a single offer that must fit on a
 * phone without scrolling past the number and the clock. Each row is therefore
 * the whole decision surface rather than a summary that opens a detail — one tap
 * fewer on a decision measured in minutes, and there is no second screen's worth
 * of information to move to.
 *
 * ## The empty state is not a failure
 *
 * No offers is the normal state between waves, and it is where a lead spends most
 * of their time. It says the screen is watching — which is true, it polls — rather
 * than implying something is wrong or that they have missed something.
 *
 * ## Why this component holds the answers
 *
 * `GET /partner/crew-offers/` filters to `INVITED`, so an offer this lead accepts
 * or declines is gone from the very next read — and both commands invalidate this
 * list on success. Rendering the outcome from inside the row would therefore show
 * a lead **"do not travel yet"** for one frame and then replace it with "No jobs
 * waiting on you right now", which is the worst sentence this screen could show
 * somebody who has just won a job.
 *
 * So the answers live here, above the live list, and the server refetch cannot
 * reach them. They are session state on purpose: a held win is followed up on the
 * shifts screen once the booking fee clears, and pretending this inbox is where a
 * lead tracks a won job would be a second, staler home for it.
 */

export interface CrewOfferListProps {
  /** The crew roster's route, for the roster shortfall. From the resolved workspace. */
  readonly crewHref: string;
}

export function CrewOfferList({ crewHref }: CrewOfferListProps) {
  const offers = usePartnerCrewOffers();
  const [answers, setAnswers] = useState<readonly CrewOfferAnswer[]>([]);

  const recordAnswer = useCallback((answer: CrewOfferAnswer) => {
    setAnswers((previous) => [
      answer,
      ...previous.filter((held) => held.offer.invitation_id !== answer.offer.invitation_id),
    ]);
  }, []);

  const answeredIds = new Set(answers.map((answer) => answer.offer.invitation_id));

  return (
    <div className="flex flex-col gap-4">
      {answers.length > 0 ? (
        <ul className="flex list-none flex-col gap-4 p-0">
          {answers.map((answer) => (
            <li key={answer.offer.invitation_id}>
              <CrewOfferOutcome answer={answer} />
            </li>
          ))}
        </ul>
      ) : null}

      <AsyncSection
        state={asyncStateFrom(offers, (data: CrewOfferListPayload) =>
          // Answered rows are dropped here too, not only by the server. Between
          // the command succeeding and the refetch landing the row is still in
          // the cache, and drawing the card beside its own outcome would offer a
          // second accept on a job already answered.
          data.offers.filter((offer) => !answeredIds.has(offer.invitation_id)),
        )}
        label="Loading your crew offers"
        isEmpty={(rows) => rows.length === 0}
        onRetry={() => void offers.refetch()}
        empty={
          answers.length > 0 ? (
            <EmptyState
              icon={<Users size={24} aria-hidden />}
              title="Nothing else waiting on you"
              description="This screen keeps watching. The next day-rate job arrives here on its own."
            />
          ) : (
            <EmptyState
              icon={<Users size={24} aria-hidden />}
              title="No jobs waiting on you right now"
              description="Vsolve sends day-rate jobs straight to you — no quote to write, the price already published. This screen is watching, so leave it open if you are free today."
            />
          )
        }
      >
        {(rows) => (
          <ul className="flex list-none flex-col gap-4 p-0">
            {rows.map((offer) => (
              <li key={offer.invitation_id}>
                <CrewOfferCard offer={offer} crewHref={crewHref} onAnswered={recordAnswer} />
              </li>
            ))}
          </ul>
        )}
      </AsyncSection>
    </div>
  );
}
