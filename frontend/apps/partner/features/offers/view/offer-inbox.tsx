"use client";

import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { useState } from "react";

import {
  isOfferForbidden,
  isOfferUnavailable,
  useOfferCommand,
  usePartnerOffers,
  type OfferAction,
} from "../queries";
import { OfferCard } from "./offer-card";

/**
 * The Partner's offer inbox.
 *
 * ## Watching, not driving
 *
 * Celery expires offers, closes the undo window and moves the group along
 * whether this page is open or not. The poll here decides only how quickly a
 * Partner *sees* that, so it stops once nothing on the page can change and backs
 * off while the endpoint is failing. A Partner who closes the app does not lose
 * a job; a Partner who leaves it open does not gain one.
 *
 * ## Failure is unconfirmed, not lost
 *
 * The offer commands are not idempotent (proposal 0009), so a retry after a lost
 * response answers "no longer available to accept" whether the Partner missed it
 * *or won it*. This component never renders the second case as the first. A
 * failed command re-reads the inbox and says the outcome is unconfirmed, and the
 * offer's own status — arriving a moment later — is what actually answers.
 *
 * Getting this wrong is not cosmetic. Telling someone they lost a job they hold
 * makes them walk away from work that is already reserved in their name.
 */

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-56 w-full" />
      ))}
    </div>
  );
}

export function OfferInbox() {
  const offersQuery = usePartnerOffers();
  const command = useOfferCommand();
  const [pendingOfferId, setPendingOfferId] = useState<string | null>(null);
  const [unconfirmedOfferId, setUnconfirmedOfferId] = useState<string | null>(null);

  function runCommand(offerId: string, action: OfferAction) {
    setPendingOfferId(offerId);
    setUnconfirmedOfferId(null);
    command.mutate(
      { offerId, action },
      {
        onError: (error) => {
          // Forbidden is unambiguous — this offer is not the caller's. Anything
          // else may or may not have applied, so it is marked unconfirmed and
          // the inbox re-read decides.
          if (!isOfferForbidden(error)) setUnconfirmedOfferId(offerId);
        },
        onSuccess: () => setUnconfirmedOfferId(null),
        onSettled: () => setPendingOfferId(null),
      },
    );
  }

  /**
   * What to say when a command failed.
   *
   * The wording for `offer_invalid` is deliberately not "you lost it". Until the
   * inbox re-read comes back, both readings are live, and the one that would
   * make a Partner walk away from work they hold is the expensive one to get
   * wrong.
   */
  function describeFailure(error: unknown): string {
    if (isOfferForbidden(error)) {
      return "This offer is not available to you any more.";
    }
    if (isOfferUnavailable(error)) {
      return "We could not confirm that. It may already have gone through — check the status above before trying again, and do not assume you lost it.";
    }
    return `${describeError(error, "mutation").message} We are re-checking this offer's status.`;
  }

  if (offersQuery.isPending) return <InboxSkeleton />;

  if (offersQuery.isError) {
    return (
      <ErrorState
        title="We could not load your offers"
        message={describeError(offersQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void offersQuery.refetch()}
      />
    );
  }

  const page = offersQuery.data;
  const offers = page?.results ?? [];

  return (
    <div>
      {/* Freshness stated rather than implied: a poller that has quietly stopped
          looks identical to one that is up to date. */}
      <p className="text-sm text-text-secondary" aria-live="polite">
        {offersQuery.isFetching
          ? "Checking for new offers…"
          : offersQuery.isError
            ? "We could not check just now — your offers are unchanged."
            : "New offers appear here automatically. Closing this page does not affect them."}
      </p>

      {offers.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No offers right now"
            description="When a job near you matches your skills and availability, it will appear here. Make sure you are online to receive offers."
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              isBusy={pendingOfferId === offer.id}
              unconfirmedMessage={
                unconfirmedOfferId === offer.id && command.isError
                  ? describeFailure(command.error)
                  : null
              }
              onCommand={(action) => runCommand(offer.id, action)}
            />
          ))}
        </ul>
      )}

      {/*
        Page one only — `partner_offer_list` publishes no `cursor` parameter, so
        the generated client cannot request the next page (proposal 0008). A
        Partner told their list is truncated can at least act on it; one shown a
        partial list as complete cannot.
      */}
      {page?.next ? (
        <p className="mt-4 text-sm text-text-secondary">
          Showing your most recent offers. There are more than fit on this page.
        </p>
      ) : null}

      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => void offersQuery.refetch()}
          disabled={offersQuery.isFetching}
        >
          Check now
        </Button>
      </div>
    </div>
  );
}
