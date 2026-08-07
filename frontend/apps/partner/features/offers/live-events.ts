"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@vsolve/query";
import { useToast } from "@vsolve/ui";

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

export function subscribeToOfferEvents(
  onOfferCreated: (payload: OfferCreatedPayload) => void,
  options: SubscribeOptions = {},
): () => void {
  const EventSourceImpl = options.EventSourceClass ?? (typeof window !== "undefined" ? window.EventSource : undefined);

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

  return () => {
    es.removeEventListener("offer_created", listener as EventListener);
    es.close();
  };
}

function useOptionalToast() {
  try {
    return useToast();
  } catch {
    return { notify: () => {} };
  }
}

export function useOfferLiveEvents(enabled = true) {
  const queryClient = useQueryClient();
  const { notify } = useOptionalToast();

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribeToOfferEvents((_payload) => {
      notify("New service offer available!", "info");
      void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
    });

    return unsubscribe;
  }, [enabled, notify, queryClient]);
}
