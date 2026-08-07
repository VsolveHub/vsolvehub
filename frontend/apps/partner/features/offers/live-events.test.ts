import { describe, expect, it, vi } from "vitest";
import { subscribeToOfferEvents, type OfferCreatedPayload } from "./live-events";

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
