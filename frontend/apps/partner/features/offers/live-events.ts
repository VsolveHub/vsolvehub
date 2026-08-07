"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@vsolve/query";
import { useToast } from "@vsolve/ui";

/**
 * Foreground delivery of new offers, over the SSE stream in
 * `contracts/proposals/partner-offer-events.md`.
 *
 * Additive on purpose. `usePartnerOffers` polling is the reliable path and is
 * untouched; this only shortens the delay in the good case. If the stream is
 * refused, unavailable or drops, the inbox behaves exactly as it did before —
 * an offer must never be visible *only* because the stream delivered it.
 */

export interface OfferCreatedPayload {
  offer_id: string;
  fulfilment_unit_id: string;
  requested_start: string;
  expires_at: string;
}

export interface SubscribeOptions {
  url?: string;
  EventSourceClass?: typeof EventSource;
}

/**
 * How long a delivered `offer_id` is remembered for de-duplication.
 *
 * Comfortably longer than the server's replay window (30s) and than an offer's
 * own life (45s), so a replayed event is always recognised, while the map stays
 * bounded by the arrival rate over a few minutes rather than by session length.
 */
const SEEN_TTL_MS = 5 * 60_000;

/**
 * Remembers which offers have already been handled.
 *
 * The server replays `M1_OFFER_STREAM_REPLAY_SECONDS` of history to every new
 * connection, deliberately: an offer created between the client's list fetch and
 * its stream connecting belongs to neither, and a missed offer is not
 * recoverable inside a 45-second window. The contract's side of that bargain is
 * that clients treat `offer_id` as the event's identity — the server caps its
 * connections and `EventSource` reconnects, so replays are routine, not rare.
 *
 * Without this the partner gets a second toast for the same job every time a
 * connection turns over.
 */
export function createOfferDeduper(now: () => number = Date.now) {
  const seen = new Map<string, number>();

  return function isFirstSighting(offerId: string): boolean {
    const at = now();
    for (const [id, seenAt] of seen) {
      if (at - seenAt > SEEN_TTL_MS) seen.delete(id);
    }
    if (seen.has(offerId)) return false;
    seen.set(offerId, at);
    return true;
  };
}

export function subscribeToOfferEvents(
  onOfferCreated: (payload: OfferCreatedPayload) => void,
  options: SubscribeOptions = {},
): () => void {
  const EventSourceImpl =
    options.EventSourceClass ?? (typeof window !== "undefined" ? window.EventSource : undefined);

  if (!EventSourceImpl) {
    return () => {};
  }

  const url = options.url ?? "/api/v1/partner/offers/stream/";
  const es = new EventSourceImpl(url, { withCredentials: true });

  const listener = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as OfferCreatedPayload;
      if (data && typeof data === "object" && typeof data.offer_id === "string") {
        onOfferCreated(data);
      }
    } catch {
      // Ignore unparseable frames
    }
  };

  es.addEventListener("offer_created", listener as EventListener);

  // No `onerror` handling and no reconnect loop, both on purpose: `EventSource`
  // reconnects natively, which is what the server's capped connection lifetime
  // expects. A client-side loop on top of it would double up.
  return () => {
    es.removeEventListener("offer_created", listener as EventListener);
    es.close();
  };
}

export function useOfferLiveEvents(enabled = true) {
  const queryClient = useQueryClient();
  // Not wrapped in a try/catch. `useToast` throws when no `ToastProvider` is
  // mounted, and swallowing that would leave this hook opening a connection per
  // render to deliver a toast that never appears — the feature looking wired
  // while doing nothing. The partner layout mounts the provider; if that ever
  // regresses, this should fail loudly rather than quietly.
  const { notify } = useToast();
  // A ref, so it survives the effect re-running — `enabled` flipping as the
  // partner pages back through history tears the stream down and builds a new
  // one, and that new connection replays.
  const isFirstSighting = useRef<ReturnType<typeof createOfferDeduper> | null>(null);
  isFirstSighting.current ??= createOfferDeduper();

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribeToOfferEvents((payload) => {
      if (!isFirstSighting.current?.(payload.offer_id)) return;
      notify("A new offer just arrived.", "info");
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    });

    return unsubscribe;
    // `notify` and `queryClient` are both stable — memoised in their providers —
    // so this effect runs on mount and when `enabled` changes, and not on every
    // render. That matters more than usual here: each re-run closes and reopens
    // a connection, and every open stream holds a server worker thread.
  }, [enabled, notify, queryClient]);
}
