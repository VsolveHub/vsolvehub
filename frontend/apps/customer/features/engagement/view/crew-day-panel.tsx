"use client";

import { canRecordCrewDay } from "@vsolve/query";
import { Button, ConfirmAction, Disclosure } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import {
  useConfirmCrewArrival,
  useRateCardState,
  useReportCrewNoShow,
} from "@/features/crew/queries";

/**
 * Whether the crew turned up — on the booking, which is the only screen that
 * knows which crew is meant.
 *
 * ## Why it moved off the request
 *
 * These two buttons lived in `crew-dispatch-panel` on `/requests/[id]`, beside
 * the cascade states they have nothing to do with. A request is what the
 * Customer *asked for*; a booking is what is *happening*. Recording an arrival
 * against a request means recording it against the question rather than the
 * answer — and the moment a request can produce more than one booking, the
 * screen has no way to say which crew arrived.
 *
 * It also put the whole post-confirmation apparatus — arrival, no-show, the fee
 * outcome, the frozen rate terms — on the screen a Customer opens to check
 * whether anyone has accepted yet.
 *
 * ## Read from the rate card, not from the engagement
 *
 * `canRecordCrewDay` answers from `RateCardState`, which is where the booking
 * and its fee actually live; the engagement carries neither. So this component
 * takes a requirement id and does its own read rather than being handed a view
 * that cannot know the answer.
 */

export interface CrewDayPanelProps {
  requirementId: string;
}

export function CrewDayPanel({ requirementId }: CrewDayPanelProps) {
  const rateQuery = useRateCardState(requirementId);
  const arrival = useConfirmCrewArrival();
  const noShow = useReportCrewNoShow();
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);

  const state = rateQuery.data ?? null;

  // Silent when there is nothing to record. This panel is mounted for every
  // lead-only booking, and most of them are not on their first day — a card
  // saying "nothing to do today" is the density this change exists to remove.
  if (state === null || !canRecordCrewDay(state)) return null;

  const isPending = arrival.isPending || noShow.isPending;

  return (
    <section className="mt-4 rounded-card border border-line bg-surface p-4">
      <h2 className="font-semibold text-text">Did the crew arrive?</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Tell us either way. This is what settles your booking fee.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          onClick={() => arrival.mutate({ requirementId })}
          loading={arrival.isPending}
          loadingLabel="Recording"
        >
          They arrived
        </Button>
        <Button variant="outline" onClick={() => setConfirmingNoShow(true)} disabled={isPending}>
          Nobody came
        </Button>
      </div>

      <div className="mt-3">
        <Disclosure summary="What happens to my booking fee?">
          If the crew arrives, the fee is earned and we keep it — it is what you
          paid to hold the booking. If nobody comes, you get it back in full and
          we look for another crew at no extra cost. If the crew travels and
          cannot work because the site was not ready, the fee is not returned:
          part goes to the supervisor for the journey his team made, and the rest
          to us.
        </Disclosure>
      </div>

      <div className="mt-3">
        <AccessRefusal
          error={arrival.error ?? noShow.error}
          attempting="record what happened today"
        />
      </div>

      <ConfirmAction
        open={confirmingNoShow}
        onOpenChange={setConfirmingNoShow}
        title="Nobody came?"
        consequence="We will refund your booking fee in full and start looking for another crew at no extra cost. Only say this if nobody turned up at all — if they came and could not work, tell support instead."
        confirmLabel="Nobody came"
        cancelLabel="Go back"
        onConfirm={() => {
          noShow.mutate({ requirementId });
          setConfirmingNoShow(false);
        }}
        pending={noShow.isPending}
        destructive
      />
    </section>
  );
}
