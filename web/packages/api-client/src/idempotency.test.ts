// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearIdempotencyKey,
  createIdempotencyKey,
  getStableIdempotencyKey,
  hasIdempotencyKey,
} from "./idempotency";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("createIdempotencyKey", () => {
  it("produces unique keys", () => {
    const keys = new Set(Array.from({ length: 200 }, () => createIdempotencyKey()));
    expect(keys.size).toBe(200);
  });
});

describe("getStableIdempotencyKey", () => {
  it("returns the same key for repeated calls on one operation", () => {
    // This is the whole point: a double-click or a retry must reuse the key so
    // the server collapses them into one effect.
    const first = getStableIdempotencyKey("checkout:abc");
    const second = getStableIdempotencyKey("checkout:abc");
    expect(second).toBe(first);
  });

  it("returns different keys for different operations", () => {
    const checkout = getStableIdempotencyKey("checkout:abc");
    const extension = getStableIdempotencyKey("extension:abc");
    expect(extension).not.toBe(checkout);
  });

  it("survives a page reload for the same operation", () => {
    const before = getStableIdempotencyKey("payment:xyz");
    // A reload loses module state but not sessionStorage. Simulate by reading
    // the stored value the way a fresh module instance would.
    const stored = window.sessionStorage.getItem("vsolve.idem.payment:xyz");
    expect(stored).toBe(before);
    expect(getStableIdempotencyKey("payment:xyz")).toBe(before);
  });

  it("mints a new key after the previous operation is cleared", () => {
    const first = getStableIdempotencyKey("payment:xyz");
    clearIdempotencyKey("payment:xyz");
    expect(hasIdempotencyKey("payment:xyz")).toBe(false);
    expect(getStableIdempotencyKey("payment:xyz")).not.toBe(first);
  });

  it("still returns a usable key when storage is unavailable", () => {
    // Private browsing can make sessionStorage throw. Server-side idempotency is
    // the real guarantee, so the client must degrade rather than fail the flow.
    const spy = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const key = getStableIdempotencyKey("checkout:blocked");
    expect(key).toMatch(/[0-9a-f-]{16,}/);
    spy.mockRestore();
  });
});

describe("hasIdempotencyKey", () => {
  it("reports whether an operation is already in flight", () => {
    expect(hasIdempotencyKey("checkout:new")).toBe(false);
    getStableIdempotencyKey("checkout:new");
    expect(hasIdempotencyKey("checkout:new")).toBe(true);
  });
});
