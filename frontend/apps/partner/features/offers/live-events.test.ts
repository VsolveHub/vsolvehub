import { describe, expect, it, vi } from "vitest";
import {
  createOfferDeduper,
  subscribeToOfferEvents,
  type OfferCreatedPayload,
} from "./live-events";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  options?: EventSourceInit;
  listeners: Map<string, (event: MessageEvent) => void> = new Map();
  closed = false;

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.options = options;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (this.listeners.get(type) === listener) {
      this.listeners.delete(type);
    }
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: string) {
    const listener = this.listeners.get(type);
    if (listener) {
      listener({ data } as MessageEvent);
    }
  }
}

describe("subscribeToOfferEvents", () => {
  it("connects to the SSE endpoint with credentials and receives offer_created events", () => {
    const onOfferCreated = vi.fn();
    const unsubscribe = subscribeToOfferEvents(onOfferCreated, {
      EventSourceClass: MockEventSource as unknown as typeof EventSource,
    });

    expect(MockEventSource.instances.length).toBe(1);
    const instance = MockEventSource.instances[0]!;
    expect(instance.url).toBe("/api/v1/partner/offers/stream/");
    expect(instance.options?.withCredentials).toBe(true);

    const payload: OfferCreatedPayload = {
      offer_id: "offer-123",
      fulfilment_unit_id: "unit-456",
      requested_start: "2026-08-10T17:00:00+05:30",
      expires_at: "2026-08-10T14:32:45Z",
    };

    instance.emit("offer_created", JSON.stringify(payload));
    expect(onOfferCreated).toHaveBeenCalledTimes(1);
    expect(onOfferCreated).toHaveBeenCalledWith(payload);

    unsubscribe();
    expect(instance.closed).toBe(true);
  });

  it("safely ignores malformed JSON frames", () => {
    const onOfferCreated = vi.fn();
    subscribeToOfferEvents(onOfferCreated, {
      EventSourceClass: MockEventSource as unknown as typeof EventSource,
    });

    const instance = MockEventSource.instances[MockEventSource.instances.length - 1]!;
    instance.emit("offer_created", "not-json");
    expect(onOfferCreated).not.toHaveBeenCalled();
  });
});

describe("createOfferDeduper", () => {
  /**
   * The contract's requirement on this side of the wire. The server replays 30
   * seconds of history to every new connection so an offer arriving between the
   * list fetch and the stream connecting is never missed; the price is that a
   * reconnect re-delivers recent events, and reconnects are routine because the
   * server caps connection lifetime.
   */
  it("reports an offer once, however many times the server replays it", () => {
    const isFirstSighting = createOfferDeduper();

    expect(isFirstSighting("offer-123")).toBe(true);
    expect(isFirstSighting("offer-123")).toBe(false);
    expect(isFirstSighting("offer-123")).toBe(false);
  });

  it("treats distinct offers as distinct", () => {
    const isFirstSighting = createOfferDeduper();

    expect(isFirstSighting("offer-123")).toBe(true);
    expect(isFirstSighting("offer-456")).toBe(true);
  });

  it("forgets offers old enough that no replay could still carry them", () => {
    let now = 0;
    const isFirstSighting = createOfferDeduper(() => now);

    expect(isFirstSighting("offer-123")).toBe(true);
    now += 6 * 60_000;

    // Not a correctness risk — an offer this old has long expired — but it is
    // what keeps the map bounded by arrival rate instead of session length.
    expect(isFirstSighting("offer-123")).toBe(true);
  });
});
