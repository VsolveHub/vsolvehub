"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { useMutation } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Offering work to a named Partner by hand.
 *
 * Automatic dispatch chooses a Partner from skills, area and availability. This
 * is the override for when it cannot — a Customer who asked for the Partner who
 * did the last job, a re-offer after a no-show, a job automatic dispatch keeps
 * failing to place.
 *
 * ## An offer is made, not accepted
 *
 * This creates an `OFFERED` record with an expiry. The Partner still accepts,
 * declines or lets it lapse; Operations cannot commit anyone else's time. The
 * console says so, because "offer to Partner" is easy to read as "assign to
 * Partner", and those are different promises to make to a Customer on the phone.
 *
 * ## Two endpoints, one decision
 *
 * A whole checkout and a single fulfilment unit are separate published commands.
 * They are one form because the operator's choice is "who does this work" and
 * the target is a property of what they are looking at, not a second decision.
 *
 * ## No idempotency key
 *
 * Neither endpoint publishes an `Idempotency-Key` parameter, so none is sent. A
 * key the server does not read is a comfort, not a guarantee — the real
 * protection here is that the command is never retried automatically and the
 * created offer is shown back with its own id.
 */

export type OfferTarget = "checkout" | "fulfilment-unit";

export interface ManualOfferInput {
  target: OfferTarget;
  /** The checkout id or the fulfilment unit id, matching `target`. */
  targetId: string;
  partnerId: string;
}

export function useCreateManualOffer() {
  return useMutation({
    mutationFn: (input: ManualOfferInput): Promise<Schemas["Offer"]> => {
      const client = getApiClient();
      const body = { partner_id: input.partnerId.trim() };

      return request(() =>
        input.target === "checkout"
          ? client.POST("/api/v1/operations/checkouts/{checkout_id}/offers/", {
              params: { path: { checkout_id: input.targetId.trim() } },
              body,
            })
          : client.POST("/api/v1/operations/fulfilment-units/{unit_id}/offers/", {
              params: { path: { unit_id: input.targetId.trim() } },
              body,
            }),
      );
    },
    // Never retried. A retried offer is a second offer on the same work, and the
    // Partner sees both.
    retry: false,
  });
}

/** The checkout, unit or Partner is not one this operator can offer against. */
export function isUnknownTarget(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/** The work is no longer in a state that can be offered. */
export function isNotOfferable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}
