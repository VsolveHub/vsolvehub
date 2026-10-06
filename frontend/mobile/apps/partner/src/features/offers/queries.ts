// Ported from frontend/apps/partner/features/offers/queries.ts

import {
  ApiRequestError,
  getStableIdempotencyKey,
  request,
  type Schemas,
} from "@vsolve/api-client";
import {
  CursorContractError,
  EXPIRING_STATE,
  boundedPoll,
  cursorFromNextUrl,
  queryKeys,
} from "@vsolve/query/native";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";

/**
 * The Partner's unit-scoped offer inbox (contract 1.13.0).
 *
 * ## What an offer is allowed to contain
 *
 * One Fulfilment Unit and nothing else: that unit's service lines, an
 * approximate area, its timing, its requirements and the money for it. No
 * Customer name, no exact address, no sibling unit from the same Booking Group.
 * That separation is enforced by the projection, not by this client — which is
 * the right place for it — so the job here is simply never to reconstruct what
 * the server withheld. There is no lookup from `checkout_id` to anything, and
 * `fulfilment_unit_id` is an opaque reference rather than a key into another
 * read.
 *
 * ## Commands are idempotent under a stable key
 *
 * `POST /partner/offers/{offer_id}/{action}/` requires `Idempotency-Key`. The
 * same offer and same action reuse one key across rerenders, refetches, network
 * timeouts, lost responses, explicit replay and page refresh within the session
 * (see `contracts/proposals/0009-partner-offer-command-contract.md`).
 *
 * Three things follow, and all of them are deliberate:
 *
 *  1. `retry: false` on every command. Automatic mutation retry would invent a
 *     second attempt under a key the Partner has not asked to replay.
 *  2. A failed command **re-reads the inbox** instead of asserting failure when
 *     the outcome is ambiguous. The offer's own `status` is the truth.
 *  3. The UI says the outcome is unconfirmed rather than "you lost it". Telling
 *     a Partner they missed a job they actually won is the specific failure
 *     worth engineering around.
 */

export type Offer = Schemas["Offer"];
export type OfferPage = Schemas["OfferPage"];
export type OfferStatus = Schemas["OfferStatusEnum"];
/** Prefer the generated enum over a divergent handwritten union. */
export type OfferAction = Schemas["OfferActionEnum"];

/**
 * Statuses where nothing further happens without the Partner.
 *
 * `COMMITTED` is done. `ACCEPTED_PENDING_UNDO` is *not* settled — the undo
 * window expires on a server timer into a commitment, so the inbox keeps
 * watching until it resolves.
 */
const SETTLED_STATUSES: readonly OfferStatus[] = [
  "COMMITTED",
  "DECLINED",
  "UNDONE",
  "EXPIRED",
  "REVOKED",
];

export function isOfferSettled(offer: Offer): boolean {
  return SETTLED_STATUSES.includes(offer.status);
}

/**
 * True when every *loaded* offer has stopped moving on its own.
 *
 * An **empty** inbox is deliberately not settled, and the guard is not
 * defensive tidiness: `[].every(…)` is `true`, so without it a Partner with no
 * offers would stop polling at precisely the moment they are waiting for work
 * to arrive. New offers are pushed by Celery, not caused by anything on this
 * page, so an empty list is the one state that most needs watching.
 *
 * Across infinite pages, settlement considers every offer already loaded — not
 * only page one — so a settled page-two offer cannot keep the inbox polling
 * forever, and an unsettled page-two offer cannot stop it early.
 */
function inboxIsSettled(data: InfiniteData<OfferPage>): boolean {
  const offers = data.pages.flatMap((page) => page.results);
  return offers.length > 0 && offers.every(isOfferSettled);
}

/**
 * True once the Partner has loaded past the newest page.
 *
 * TanStack Query refetches **every retained page** of an infinite query on an
 * ordinary refetch — there is no per-page refetch in v5, and a five-second
 * interval over a three-page traversal is fifteen sequential cursor reads a
 * minute against a live inbox. The traversal is also the part that cannot
 * usefully be polled: page two is history, and re-walking it on a timer answers
 * a question nobody asked.
 *
 * So live observation belongs to page one, and asking for more pages is what
 * ends it. Nothing is lost by stopping: Celery owns every deadline either way,
 * the countdowns on screen run off the server clock rather than off refetches,
 * and `refetchOnWindowFocus` still catches the Partner up when they come back.
 * Returning to page one resumes it, which the inbox offers as an explicit
 * control rather than leaving the Partner to guess.
 */
export function isTraversingHistory(data: InfiniteData<OfferPage>): boolean {
  return data.pages.length > 1;
}

/**
 * When the poll stops, for either of its two unrelated reasons.
 *
 * Kept as one predicate because `boundedPoll` takes one, and kept as two named
 * halves because they mean different things: settled is *finished*, traversing
 * is *paused*. Only the second one has a way back.
 */
function livePollStops(data: InfiniteData<OfferPage>): boolean {
  return isTraversingHistory(data) || inboxIsSettled(data);
}

/** `400 cursor_invalid` — restart from page one rather than truncating silently. */
export function isCursorInvalid(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "cursor_invalid";
}

export function isCursorContractFailure(error: unknown): boolean {
  return error instanceof CursorContractError;
}

/**
 * The live inbox, traversed page by page.
 *
 * Cursor pagination through the generated `cursor` query parameter. The list
 * identity stays in the query key; each page's opaque cursor is only a
 * `pageParam`. `next` is never raw-fetched.
 *
 * Polling is bounded and observational. Celery expires offers and the undo
 * window whether or not this page is open; the poll only decides how quickly a
 * Partner *sees* that. It stops when every loaded offer has settled, pauses
 * once the Partner traverses past page one, and backs off while the endpoint is
 * failing. Hidden tabs pause via `refetchIntervalInBackground: false`.
 */
export function usePartnerOffers(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.partner.offers(),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/partner/offers/", {
          params: {
            query: {
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      );
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    enabled,
    ...EXPIRING_STATE,
    ...boundedPoll<InfiniteData<OfferPage>>({
      // Faster than the shared recovery interval: an offer expires in seconds
      // and the undo window is 120, so a ten-second poll would show a Partner a
      // countdown that is meaningfully behind the server.
      intervalMs: 5_000,
      isSettled: livePollStops,
    }),
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && error.status === 403 ? false : failureCount < 2,
  });
}

/**
 * One stable key per offer + action for the life of the logical command.
 *
 * Different offer ids or actions mint different keys. The same pair reuses its
 * key across rerenders, refetches, timeouts, lost responses, explicit replay and
 * same-session refresh. The key is never cleared while the outcome is unknown.
 */
export function offerCommandIntentKey(input: { offerId: string; action: OfferAction }): string {
  return getStableIdempotencyKey(`partner-offer:${input.offerId}:${input.action}`);
}

export interface OfferCommandInput {
  offerId: string;
  action: OfferAction;
}

/**
 * Accept, decline, undo or commit one offer.
 *
 * The response is the offer's new state, so success writes it straight back into
 * every loaded page rather than triggering a refetch — the command already
 * returned the answer a refetch would go and ask for.
 *
 * On failure the inbox is invalidated instead when the outcome is ambiguous.
 * That is the whole ambiguity strategy in one line: when the client cannot know
 * what happened, it goes and looks rather than deciding.
 */
export function useOfferCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OfferCommandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/offers/{offer_id}/{action}/", {
          params: {
            path: { offer_id: input.offerId, action: input.action },
            header: { "Idempotency-Key": offerCommandIntentKey(input) },
          },
        }),
      ),
    onSuccess: (offer) => {
      queryClient.setQueryData<InfiniteData<OfferPage>>(queryKeys.partner.offers(), (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            results: page.results.map((existing) =>
              existing.id === offer.id ? offer : existing,
            ),
          })),
        };
      });
    },
    onError: () => {
      // The command may or may not have applied. `offer.status` is the only
      // thing that knows, so ask it. Keep the stable key — clearing it here
      // would mint a new key on replay and defeat idempotency.
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    },
    retry: false,
  });
}

/**
 * `400 offer_invalid` — the offer moved on under a state guard.
 *
 * With a stable idempotency key, a same-key replay of an accepted Accept returns
 * the held offer rather than this code. When this still arrives, treat it as
 * unconfirmed until the inbox re-read answers — never as "you lost it".
 */
export function isOfferUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "offer_invalid";
}

/** Another Partner already holds the reservation for this unit. */
export function isOfferReservationConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "offer_reservation_conflict";
}

/** The key was previously used for a different request body. */
export function isIdempotencyKeyReused(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_key_reused";
}

/** A same-key request is still being processed — wait and look again. */
export function isIdempotencyInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}

/** The offer belongs to another Partner, or the caller has no Partner profile. */
export function isOfferForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}
