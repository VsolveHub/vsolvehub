"use client";

import { describeError, queryKeys } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, useT } from "@vsolve/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, RefreshCw } from "lucide-react";

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
function describeFailure(error: unknown, t: ReturnType<typeof useT>): string | null {
  if (isOfferForbidden(error)) {
    return null;
  }
  if (isOfferReservationConflict(error)) {
    return t("offers.inbox.failure.reservationConflict");
  }
  if (isIdempotencyKeyReused(error)) {
    return t("offers.inbox.failure.keyReused");
  }
  if (isIdempotencyInProgress(error)) {
    return t("offers.inbox.failure.inProgress");
  }
  if (isOfferUnavailable(error)) {
    return t("offers.inbox.failure.unavailable");
  }
  return t("offers.inbox.failure.generic", { message: describeError(error, "mutation").message });
}

/**
 * One offer and the command state that belongs to it.
 *
 * The mutation lives here so "is this row busy?" and "did this row's command
 * fail?" are answered by the row itself. Two rows can have commands in flight at
 * once without either one reporting the other's outcome.
 */
function OfferRow({ offer, index }: { offer: Offer; index: number }) {
  const t = useT();
  const command = useOfferCommand();

  return (
    <div
      className="vsh-stagger-rise"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <OfferCard
        offer={offer}
        isBusy={command.isPending}
        unconfirmedMessage={command.isError ? describeFailure(command.error, t) : null}
        onCommand={(action) => command.mutate({ offerId: offer.id, action })}
      />
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-52 w-full rounded-card" />
      ))}
    </div>
  );
}

export function OfferInbox() {
  const t = useT();
  const queryClient = useQueryClient();
  const offersQuery = usePartnerOffers();

  const livePollPaused = offersQuery.data ? isTraversingHistory(offersQuery.data) : false;

  function restartFromPageOne() {
    void queryClient.resetQueries({ queryKey: queryKeys.partner.offers() });
  }

  if (offersQuery.isPending) return <InboxSkeleton />;

  const offers = offersQuery.data?.pages.flatMap((page) => page.results) ?? [];
  const listError = offersQuery.error;

  if (offersQuery.isError && offers.length === 0) {
    const restartable =
      isCursorInvalid(listError) || isCursorContractFailure(listError);

    return (
      <ErrorState
        title={
          restartable ? t("offers.inbox.error.cannotContinue") : t("offers.inbox.error.cannotLoad")
        }
        message={
          restartable
            ? t("offers.inbox.error.restartMessage")
            : describeError(listError, "read").message
        }
        actionLabel={restartable ? t("offers.inbox.startFromBeginning") : t("common.tryAgain")}
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
      <p className="flex items-center gap-1.5 text-xs text-text-muted" aria-live="polite">
        {offersQuery.isFetching && !offersQuery.isFetchingNextPage ? (
          <>
            <RefreshCw size={12} className="animate-spin" aria-hidden />
            {t("offers.inbox.checking")}
          </>
        ) : livePollPaused ? (
          t("offers.inbox.livePaused")
        ) : (
          t("offers.inbox.liveOn")
        )}
      </p>

      {livePollPaused ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={restartFromPageOne}>
            {t("offers.inbox.backToLatest")}
          </Button>
        </div>
      ) : null}

      {offers.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Clock size={32} />}
            title={t("offers.inbox.empty.title")}
            description={t("offers.inbox.empty.description")}
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {offers.map((offer, index) => (
            <OfferRow key={offer.id} offer={offer} index={index} />
          ))}
        </ul>
      )}

      {offersQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void offersQuery.fetchNextPage()}
            loading={offersQuery.isFetchingNextPage}
            loadingLabel={t("offers.inbox.loadingMore")}
            disabled={offersQuery.isFetchingNextPage}
          >
            {t("offers.inbox.loadMore")}
          </Button>
        </div>
      ) : null}

      {offersQuery.isFetchNextPageError && listError ? (
        <>
          <p className="mt-3 text-sm text-critical" role="alert">
            {isCursorInvalid(listError) || isCursorContractFailure(listError)
              ? t("offers.inbox.nextPageError")
              : describeError(listError, "read").message}
          </p>
          {isCursorInvalid(listError) || isCursorContractFailure(listError) ? (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={restartFromPageOne}>
                {t("offers.inbox.startFromBeginning")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-6 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={() => void offersQuery.refetch()}
          disabled={offersQuery.isFetching}
        >
          {t("offers.inbox.checkNow")}
        </Button>
      </div>
    </div>
  );
}
