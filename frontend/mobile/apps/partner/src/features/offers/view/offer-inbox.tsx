// Ported from frontend/apps/partner/features/offers/view/offer-inbox.tsx
import { describeError, queryKeys } from "@vsolve/query/native";
import { Button, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollView, View } from "react-native";

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

function describeFailure(error: unknown): string | null {
  if (isOfferForbidden(error)) return null;
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

export function OfferInbox() {
  const queryClient = useQueryClient();
  const offersQuery = usePartnerOffers();
  const livePollPaused = offersQuery.data ? isTraversingHistory(offersQuery.data) : false;

  function restartFromPageOne() {
    void queryClient.resetQueries({ queryKey: queryKeys.partner.offers() });
  }

  if (offersQuery.isPending) {
    return (
      <View className="gap-3">
        <Skeleton className="h-52 w-full rounded-card" />
        <Skeleton className="h-52 w-full rounded-card" />
      </View>
    );
  }

  const offers = offersQuery.data?.pages.flatMap((page) => page.results) ?? [];
  const listError = offersQuery.error;

  if (offersQuery.isError && offers.length === 0) {
    const restartable = isCursorInvalid(listError) || isCursorContractFailure(listError);
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
    <ScrollView contentContainerClassName="gap-4 pb-8">
      <Text className="text-xs text-text-muted">
        {offersQuery.isFetching && !offersQuery.isFetchingNextPage
          ? "Checking for new offers…"
          : livePollPaused
            ? "Live updates are paused while you look through older offers."
            : "New offers appear here automatically."}
      </Text>
      {livePollPaused ? (
        <Button variant="outline" onPress={restartFromPageOne}>
          Back to the latest offers
        </Button>
      ) : null}
      {offers.length === 0 ? (
        <EmptyState
          title="No offers right now"
          description="When a job near you matches your skills and availability, it will appear here. Make sure you are online to receive offers."
        />
      ) : (
        <View className="gap-3">
          {offers.map((offer) => (
            <OfferRow key={offer.id} offer={offer} />
          ))}
        </View>
      )}
      {offersQuery.hasNextPage ? (
        <Button
          variant="outline"
          loading={offersQuery.isFetchingNextPage}
          loadingLabel="Loading more offers"
          onPress={() => void offersQuery.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
      <Button variant="outline" disabled={offersQuery.isFetching} onPress={() => void offersQuery.refetch()}>
        Refresh
      </Button>
    </ScrollView>
  );
}
