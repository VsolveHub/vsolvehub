// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAllIdempotencyKeys,
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

describe("when sessionStorage refuses to hold the key", () => {
  /**
   * Private mode and a full quota both throw on `setItem` *after* `getItem` has
   * answered null. Without the in-memory fallback that combination mints a
   * fresh key on every call, so a double-clicked payment becomes two payments
   * for exactly the users whose browser is most locked down.
   */
  function blockWrites() {
    return vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
  }

  it("keeps one key stable across repeated calls", () => {
    const spy = blockWrites();
    try {
      const first = getStableIdempotencyKey("payment:blocked");
      expect(getStableIdempotencyKey("payment:blocked")).toBe(first);
      expect(getStableIdempotencyKey("payment:blocked")).toBe(first);
    } finally {
      spy.mockRestore();
    }
  });

  it("still separates different operations", () => {
    const spy = blockWrites();
    try {
      expect(getStableIdempotencyKey("payment:one")).not.toBe(
        getStableIdempotencyKey("payment:two"),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("reports the key as in flight", () => {
    const spy = blockWrites();
    try {
      expect(hasIdempotencyKey("payment:reported")).toBe(false);
      getStableIdempotencyKey("payment:reported");
      expect(hasIdempotencyKey("payment:reported")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("clears the fallback so a settled operation does not resurrect its key", () => {
    const spy = blockWrites();
    try {
      const first = getStableIdempotencyKey("payment:settled");
      clearIdempotencyKey("payment:settled");
      expect(hasIdempotencyKey("payment:settled")).toBe(false);
      expect(getStableIdempotencyKey("payment:settled")).not.toBe(first);
    } finally {
      spy.mockRestore();
    }
  });

  it("hands back to storage once it starts accepting writes again", () => {
    const spy = blockWrites();
    const fallbackKey = getStableIdempotencyKey("payment:recovering");
    spy.mockRestore();

    // The fallback still answers, so the operation does not change identity
    // mid-attempt just because the quota freed up.
    expect(getStableIdempotencyKey("payment:recovering")).toBe(fallbackKey);
  });

  it("survives a throwing getItem as well as a throwing setItem", () => {
    const setSpy = blockWrites();
    const first = getStableIdempotencyKey("payment:hostile");
    const getSpy = vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "SecurityError");
    });
    try {
      expect(getStableIdempotencyKey("payment:hostile")).toBe(first);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

describe("clearAllIdempotencyKeys", () => {
  it("forgets every stored attempt so the next sign-in starts clean", () => {
    const first = getStableIdempotencyKey("checkout:abc");
    window.sessionStorage.setItem("vsolve.idem.other", "kept-until-sign-out");
    window.sessionStorage.setItem("vsh-partner-locale", "hi-IN");

    clearAllIdempotencyKeys();

    expect(hasIdempotencyKey("checkout:abc")).toBe(false);
    expect(getStableIdempotencyKey("checkout:abc")).not.toBe(first);
    expect(window.sessionStorage.getItem("vsolve.idem.other")).toBeNull();
    expect(window.sessionStorage.getItem("vsh-partner-locale")).toBe("hi-IN");
  });
});

describe("hasIdempotencyKey", () => {
  it("reports whether an operation is already in flight", () => {
    expect(hasIdempotencyKey("checkout:new")).toBe(false);
    getStableIdempotencyKey("checkout:new");
    expect(hasIdempotencyKey("checkout:new")).toBe(true);
  });
});
