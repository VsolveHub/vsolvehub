// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTabChannel, type TabMessage } from "./cross-tab";

let channels: Array<{ close: () => void }> = [];

function open() {
  const channel = createTabChannel();
  channels.push(channel);
  return channel;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  for (const channel of channels) channel.close();
  channels = [];
  vi.restoreAllMocks();
});

describe("publish and subscribe", () => {
  it("delivers a message from one tab to another", async () => {
    const publisher = open();
    const subscriber = open();
    const received: TabMessage[] = [];
    subscriber.subscribe((message) => received.push(message));

    publisher.publish({ type: "session.logout" });

    // BroadcastChannel delivery is asynchronous.
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ type: "session.logout" });
  });

  it("delivers a checkout identifier so a second tab can defer", async () => {
    const publisher = open();
    const subscriber = open();
    const received: TabMessage[] = [];
    subscriber.subscribe((message) => received.push(message));

    publisher.publish({ type: "checkout.started", checkoutSessionId: "cs_123" });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ type: "checkout.started", checkoutSessionId: "cs_123" });
  });

  it("stops delivering after unsubscribe", async () => {
    const publisher = open();
    const subscriber = open();
    const received: TabMessage[] = [];
    const unsubscribe = subscriber.subscribe((message) => received.push(message));

    unsubscribe();
    publisher.publish({ type: "session.logout" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toHaveLength(0);
  });

  it("keeps delivering to remaining listeners when one throws", async () => {
    const publisher = open();
    const subscriber = open();
    const received: TabMessage[] = [];

    subscriber.subscribe(() => {
      throw new Error("listener bug");
    });
    subscriber.subscribe((message) => received.push(message));

    publisher.publish({ type: "session.authenticated" });

    await vi.waitFor(() => expect(received).toHaveLength(1));
  });

  it("ignores malformed payloads from a different app version", async () => {
    const subscriber = open();
    const received: TabMessage[] = [];
    subscriber.subscribe((message) => received.push(message));

    // Simulate a sibling posting something this version does not understand.
    const raw = new BroadcastChannel("vsolve.tabs");
    raw.postMessage("not-an-object");
    raw.postMessage({ noType: true });
    raw.close();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toHaveLength(0);
  });
});

describe("storage fallback", () => {
  it("delivers via the storage event when BroadcastChannel is unavailable", async () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error deliberately removing the API to exercise the fallback
    delete globalThis.BroadcastChannel;

    try {
      const subscriber = open();
      const received: TabMessage[] = [];
      subscriber.subscribe((message) => received.push(message));

      // The `storage` event does not fire in the tab that wrote the value, so a
      // sibling write is simulated directly.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "vsolve.tabs.message",
          newValue: JSON.stringify({ message: { type: "session.logout" }, nonce: 1 }),
        }),
      );

      await vi.waitFor(() => expect(received).toHaveLength(1));
      expect(received[0]).toEqual({ type: "session.logout" });
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  it("writes a changing nonce so a repeated message still fires", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error deliberately removing the API to exercise the fallback
    delete globalThis.BroadcastChannel;

    try {
      const publisher = open();
      publisher.publish({ type: "session.logout" });
      const first = window.localStorage.getItem("vsolve.tabs.message");
      publisher.publish({ type: "session.logout" });
      const second = window.localStorage.getItem("vsolve.tabs.message");

      // Identical logical messages must produce different stored values or the
      // storage event would not fire the second time.
      expect(second).not.toBe(first);
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  it("does not throw when storage is blocked", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error deliberately removing the API to exercise the fallback
    delete globalThis.BroadcastChannel;
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    try {
      const publisher = open();
      // Coordination degrades; server idempotency remains the guarantee.
      expect(() => publisher.publish({ type: "session.logout" })).not.toThrow();
    } finally {
      spy.mockRestore();
      globalThis.BroadcastChannel = original;
    }
  });
});
