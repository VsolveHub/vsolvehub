"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { EXPIRING_STATE, boundedPoll, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Partner's unit-scoped offer inbox (contract 1.9.0).
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
 * ## Commands are not idempotent, and this file does not pretend they are
 *
 * `POST /partner/offers/{offer_id}/{action}/` declares no `Idempotency-Key`, and
 * Django's `accept_unit_offer` is state-guarded rather than idempotent: a retry
 * after a lost response answers `400 offer_invalid` — "no longer available to
 * accept" — even when the first attempt succeeded and the Partner *has* the job.
 * See `contracts/proposals/0009-partner-offer-command-contract.md`.
 *
 * Three things follow, and all of them are deliberate:
 *
 *  1. `retry: false` on every command. The contract defines no safe replay, so
 *     an automatic retry would be this client inventing one.
 *  2. A failed command **re-reads the inbox** instead of asserting failure. The
 *     offer's own `status` is the truth; the error message is a guess about it.
 *  3. The UI says the outcome is unconfirmed rather than "you lost it". Telling
 *     a Partner they missed a job they actually won is the specific failure
 *     worth engineering around.
 */

export type Offer = Schemas["Offer"];
export type OfferStatus = Schemas["OfferStatusEnum"];

/** The four commands the view accepts. Django rejects anything else. */
export type OfferAction = "accept" | "decline" | "undo" | "commit";

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
 * True when every offer on the page has stopped moving on its own.
 *
 * An **empty** inbox is deliberately not settled, and the guard is not
 * defensive tidiness: `[].every(…)` is `true`, so without it a Partner with no
 * offers would stop polling at precisely the moment they are waiting for work
 * to arrive. New offers are pushed by Celery, not caused by anything on this
 * page, so an empty list is the one state that most needs watching.
 */
function inboxIsSettled(page: Schemas["OfferPage"]): boolean {
  return page.results.length > 0 && page.results.every(isOfferSettled);
}

/**
 * The live inbox.
 *
 * Page one only: `partner_offer_list` paginates with a cursor at runtime but
 * publishes no `cursor` query parameter, so the generated client cannot ask for
 * page two — see `contracts/proposals/0008-bounded-list-cursor-parameters.md`.
 * `next` is read so the screen can say the list is truncated rather than imply
 * it is complete.
 *
 * Polling is bounded and observational. Celery expires offers and the undo
 * window whether or not this page is open; the poll only decides how quickly a
 * Partner *sees* that. It stops when every offer has settled and backs off while
 * the endpoint is failing.
 */
export function usePartnerOffers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.partner.offers(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/offers/")),
    enabled,
    ...EXPIRING_STATE,
    ...boundedPoll<Schemas["OfferPage"]>({
      // Faster than the shared recovery interval: an offer expires in seconds
      // and the undo window is 120, so a ten-second poll would show a Partner a
      // countdown that is meaningfully behind the server.
      intervalMs: 5_000,
      isSettled: inboxIsSettled,
    }),
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && error.status === 403 ? false : failureCount < 2,
  });
}

export interface OfferCommandInput {
  offerId: string;
  action: OfferAction;
}

/**
 * Accept, decline, undo or commit one offer.
 *
 * The response is the offer's new state, so success writes it straight back into
 * the inbox rather than triggering a refetch — the command already returned the
 * answer a refetch would go and ask for.
 *
 * On failure the inbox is invalidated instead. That is the whole ambiguity
 * strategy in one line: when the client cannot know what happened, it goes and
 * looks rather than deciding.
 */
export function useOfferCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OfferCommandInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/offers/{offer_id}/{action}/", {
          params: { path: { offer_id: input.offerId, action: input.action } },
        }),
      ),
    onSuccess: (offer) => {
      queryClient.setQueryData<Schemas["OfferPage"]>(queryKeys.partner.offers(), (current) => {
        if (!current) return current;
        return {
          ...current,
          results: current.results.map((existing) =>
            existing.id === offer.id ? offer : existing,
          ),
        };
      });
    },
    onError: () => {
      // The command may or may not have applied. `offer.status` is the only
      // thing that knows, so ask it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    },
    retry: false,
  });
}

/**
 * `400 offer_invalid` — the offer moved on, *or* this is a retry of a command
 * that already worked.
 *
 * The two are indistinguishable from here, which is exactly the defect proposal
 * 0009 asks to fix. Callers must treat this as "unconfirmed, go and look", never
 * as "you lost it".
 */
export function isOfferUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "offer_invalid";
}

/** The offer belongs to another Partner, or the caller has no Partner profile. */
export function isOfferForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}
