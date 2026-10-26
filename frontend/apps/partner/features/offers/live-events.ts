"use client";

import { browserApiBaseUrl } from "@/lib/api/browser";

/**
 * Foreground delivery for Partner stream events over
 * `GET /api/v1/partner/offers/stream/`.
 *
 * Multiplexes same-day offers, advance job assignments, and in-app booking /
 * enquiry notices on the one connection the server already holds open. Polling
 * remains the reliable path for each surface; this only shortens the delay.
 */

export interface OfferCreatedPayload {
  offer_id: string;
  fulfilment_unit_id: string;
  requested_start: string;
  expires_at: string;
}

export interface JobAssignedPayload {
  fulfilment_unit_id: string;
  requested_start: string;
}

export interface NotificationCreatedPayload {
  notification_id: string;
  purpose: string;
  title: string;
  body: string;
  target_kind?: string;
  target_id?: string;
}

export interface PartnerStreamHandlers {
  onOfferCreated?: (payload: OfferCreatedPayload) => void;
  onJobAssigned?: (payload: JobAssignedPayload) => void;
  onNotificationCreated?: (payload: NotificationCreatedPayload) => void;
}

export interface SubscribeOptions {
  url?: string;
  EventSourceClass?: typeof EventSource;
}

const SEEN_TTL_MS = 5 * 60_000;
const STREAM_RECONNECT_MS = 2_000;

/**
 * Same-origin relative URL when the browser client uses the dev proxy — an
 * empty `NEXT_PUBLIC_API_BASE_URL`, or a page on a different loopback host than
 * the API (see `browserApiBaseUrl`). The stream needs the session cookie too.
 */
export function partnerStreamUrl(): string {
  const base = browserApiBaseUrl().replace(/\/$/, "");
  if (!base) return "/api/v1/partner/offers/stream/";
  return `${base}/api/v1/partner/offers/stream/`;
}

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

export function createIdDeduper(prefix: string, now: () => number = Date.now) {
  const seen = new Map<string, number>();

  return function isFirstSighting(id: string): boolean {
    const at = now();
    for (const [key, seenAt] of seen) {
      if (at - seenAt > SEEN_TTL_MS) seen.delete(key);
    }
    const key = `${prefix}:${id}`;
    if (seen.has(key)) return false;
    seen.set(key, at);
    return true;
  };
}

function parseJson<T>(data: string): T | null {
  try {
    const parsed = JSON.parse(data) as T;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function subscribeToPartnerStream(
  handlers: PartnerStreamHandlers,
  options: SubscribeOptions = {},
): () => void {
  const EventSourceImpl =
    options.EventSourceClass ?? (typeof window !== "undefined" ? window.EventSource : undefined);

  if (!EventSourceImpl) {
    return () => {};
  }

  const url = options.url ?? partnerStreamUrl();
  let es: EventSource | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const onOfferCreated = (event: MessageEvent) => {
    const data = parseJson<OfferCreatedPayload>(event.data);
    if (data && typeof data.offer_id === "string") {
      handlers.onOfferCreated?.(data);
    }
  };

  const onJobAssigned = (event: MessageEvent) => {
    const data = parseJson<JobAssignedPayload>(event.data);
    if (data && typeof data.fulfilment_unit_id === "string") {
      handlers.onJobAssigned?.(data);
    }
  };

  const onNotificationCreated = (event: MessageEvent) => {
    const data = parseJson<NotificationCreatedPayload>(event.data);
    if (data && typeof data.notification_id === "string" && typeof data.title === "string") {
      handlers.onNotificationCreated?.(data);
    }
  };

  const attach = (source: EventSource) => {
    source.addEventListener("offer_created", onOfferCreated as EventListener);
    source.addEventListener("job_assigned", onJobAssigned as EventListener);
    source.addEventListener("notification_created", onNotificationCreated as EventListener);
  };

  const detach = (source: EventSource) => {
    source.removeEventListener("offer_created", onOfferCreated as EventListener);
    source.removeEventListener("job_assigned", onJobAssigned as EventListener);
    source.removeEventListener("notification_created", onNotificationCreated as EventListener);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, STREAM_RECONNECT_MS);
  };

  const connect = () => {
    if (closed) return;
    es?.close();
    es = new EventSourceImpl(url, { withCredentials: true });
    attach(es);
    es.onerror = () => {
      detach(es!);
      es?.close();
      es = null;
      scheduleReconnect();
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (es) {
      detach(es);
      es.close();
    }
  };
}

/** @deprecated Use subscribeToPartnerStream */
export function subscribeToOfferEvents(
  onOfferCreated: (payload: OfferCreatedPayload) => void,
  options: SubscribeOptions = {},
): () => void {
  return subscribeToPartnerStream({ onOfferCreated }, options);
}
