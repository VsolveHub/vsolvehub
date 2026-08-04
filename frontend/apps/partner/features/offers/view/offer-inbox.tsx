"use client";

import { describeError, queryKeys } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { useQueryClient } from "@tanstack/react-query";

import {
  isCursorContractFailure,
  isCursorInvalid,
  isIdempotencyInProgress,
  isIdempotencyKeyReused,
  isOfferForbidden,
  isOfferReservationConflict,
  isOfferUnavailable,
  isTraversingHistory,
  useOfferCommand,
  usePartnerOffers,
  type Offer,
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
 * Offer commands are idempotent under a stable key (proposal 0009). A lost
 * Accept response keeps that key; an explicit replay must reuse it. Until the
 * inbox re-read answers, this component never renders an ambiguous failure as
 * "you lost it".
 *
 * Getting this wrong is not cosmetic. Telling someone they lost a job they hold
 * makes them walk away from work that is already reserved in their name.
 *
 * ## One command state per offer
 *
 * Each row owns its own mutation, rather than the inbox owning one and
 * remembering which id it belongs to. With a single shared mutation, starting
 * an Accept on offer B while offer A's is still in flight re-enables A's
 * buttons, and whichever request settles first clears the pending flag for
 * both — a Partner could press Accept twice on the same job under two different
 * idempotency keys. Scoping the mutation to the row it acts on removes the
 * class of bug rather than sequencing around it.
 */

/**
 * What to say when a command failed, or `null` when there is nothing to say.
 *
 * The wording for `offer_invalid` is deliberately not "you lost it". Until the
 * inbox re-read comes back, both readings are live, and the one that would make
 * a Partner walk away from work they hold is the expensive one to get wrong.
 *
 * A 403 or 404 returns `null`: it is the one unambiguous outcome — the offer is
 * not this Partner's — and the re-read the mutation triggers removes the row
 * outright. A message about a row that is about to vanish is noise.
 */
function describeFailure(error: unknown): string | null {
  if (isOfferForbidden(error)) {
    return null;
  }
  if (isOfferReservationConflict(error)) {
    return "Another professional already holds this job. It was not assigned to you.";
  }
  if (isIdempotencyKeyReused(error)) {
    return "That request could not be replayed safely. Check the offer status above before trying a different action.";
  }
  if (isIdempotencyInProgress(error)) {
    return "That request is still being processed. We are re-checking this offer's status — do not assume it failed.";
  }
  if (isOfferUnavailable(error)) {
    return "We could not confirm that. It may already have gone through — check the status above before trying again, and do not assume you lost it.";
  }
  return `${describeError(error, "mutation").message} We are re-checking this offer's status.`;
}

/**
 * One offer and the command state that belongs to it.
 *
 * The mutation lives here so "is this row busy?" and "did this row's command
 * fail?" are answered by the row itself. Two rows can have commands in flight at
 * once without either one reporting the other's outcome.
 */
function OfferRow({ offer }: { offer: Offer }) {
  const command = useOfferCommand();

  return (
    <OfferCard
      offer={offer}
      isBusy={command.isPending}
      unconfirmedMessage={command.isError ? describeFailure(command.error) : null}
      onCommand={(action) => command.mutate({ offerId: offer.id, action })}
    />
  );
}

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
  const queryClient = useQueryClient();
  const offersQuery = usePartnerOffers();

  function restartFromPageOne() {
    void queryClient.resetQueries({ queryKey: queryKeys.partner.offers() });
  }

  if (offersQuery.isPending) return <InboxSkeleton />;

  const offers = offersQuery.data?.pages.flatMap((page) => page.results) ?? [];
  const listError = offersQuery.error;
  /**
   * Live updates stop while the Partner reads back through older pages.
   *
   * Said out loud rather than left to be noticed. A poller that has stopped
   * looks exactly like one that is up to date, and the difference matters here:
   * the offers on this screen have deadlines.
   */
  const livePollPaused = offersQuery.data ? isTraversingHistory(offersQuery.data) : false;

  if (offersQuery.isError && offers.length === 0) {
    const restartable =
      isCursorInvalid(listError) || isCursorContractFailure(listError);

    return (
      <ErrorState
        title={restartable ? "We could not continue this list" : "We could not load your offers"}
        message={
          restartable
            ? "Start again from the beginning — newer offers keep arriving while you do."
            : describeError(listError, "read").message
        }
        actionLabel={restartable ? "Start from the beginning" : "Try again"}
        onAction={() => {
          if (restartable) {
            restartFromPageOne();
            return;
          }
          void offersQuery.refetch();
        }}
      />
    );
  }

  return (
    <div>
      {/* Freshness stated rather than implied: a poller that has quietly stopped
          looks identical to one that is up to date. */}
      <p className="text-sm text-text-secondary" aria-live="polite">
        {offersQuery.isFetching && !offersQuery.isFetchingNextPage
          ? "Checking for new offers…"
          : livePollPaused
            ? "Live updates are paused while you look through older offers. Go back to the latest to resume them."
            : "New offers appear here automatically. Closing this page does not affect them."}
      </p>

      {livePollPaused ? (
        <div className="mt-3">
          <Button variant="outline" onClick={restartFromPageOne}>
            Back to the latest offers
          </Button>
        </div>
      ) : null}

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
            <OfferRow key={offer.id} offer={offer} />
          ))}
        </ul>
      )}

      {offersQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => void offersQuery.fetchNextPage()}
            loading={offersQuery.isFetchingNextPage}
            loadingLabel="Loading more offers"
            disabled={offersQuery.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}

      {offersQuery.isFetchNextPageError && listError ? (
        <>
          <p className="mt-3 text-sm text-critical" role="alert">
            {isCursorInvalid(listError) || isCursorContractFailure(listError)
              ? "We could not load the next page. Start from the beginning to try again."
              : describeError(listError, "read").message}
          </p>
          {isCursorInvalid(listError) || isCursorContractFailure(listError) ? (
            <div className="mt-3">
              <Button variant="outline" onClick={restartFromPageOne}>
                Start from the beginning
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-6">
        {/* Disabled for *any* fetch, including a next-page one. A refetch that
            overlaps a cursor traversal races two writers into the same page
            list, and the loser silently decides what the Partner ends up
            looking at. */}
        <Button variant="outline" onClick={() => void offersQuery.refetch()} disabled={offersQuery.isFetching}>
          Check now
        </Button>
      </div>
    </div>
  );
}
