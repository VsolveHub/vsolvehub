// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { checkoutIntentKey, planQuoteIntentKey, planSetIntentKey } from "./intents";

/**
 * The property the `Idempotency-Key` header depends on.
 *
 * A key that changes per attempt makes the header decorative: a double-tap or a
 * reconnect mid-request creates a second Booking Group. A key that *outlives* its
 * intent is the opposite failure — Django answers `idempotency_key_reused`
 * because the body no longer matches. Both are prevented by deriving the key
 * from the intent rather than minting one at the call site.
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("plan set", () => {
  const intent = {
    cartVersion: 3,
    addressId: "addr-1",
    preferredStart: "2026-08-03T10:00:00Z",
  };

  it("reuses one key across retries of the same intent", () => {
    expect(planSetIntentKey(intent)).toBe(planSetIntentKey(intent));
  });

  it("survives a reload, so a resumed attempt is the same attempt", () => {
    const first = planSetIntentKey(intent);
    // A fresh module read after a refresh sees the persisted key.
    expect(planSetIntentKey({ ...intent })).toBe(first);
  });

  it("mints a new key for every field that changes the request body", () => {
    const base = planSetIntentKey(intent);

    expect(planSetIntentKey({ ...intent, cartVersion: 4 })).not.toBe(base);
    expect(planSetIntentKey({ ...intent, addressId: "addr-2" })).not.toBe(base);
    expect(planSetIntentKey({ ...intent, preferredStart: "2026-08-04T10:00:00Z" })).not.toBe(
      base,
    );
  });
});

describe("plan quote and checkout", () => {
  it("keys a quote to its plan and a checkout to its quote", () => {
    expect(planQuoteIntentKey("plan-1")).toBe(planQuoteIntentKey("plan-1"));
    expect(planQuoteIntentKey("plan-2")).not.toBe(planQuoteIntentKey("plan-1"));

    expect(checkoutIntentKey("quote-1")).toBe(checkoutIntentKey("quote-1"));
    expect(checkoutIntentKey("quote-2")).not.toBe(checkoutIntentKey("quote-1"));
  });

  it("never shares a key between two different commands", () => {
    // The same opaque id can identify a plan and, later, a quote. A shared
    // namespace would send one command under the other's key.
    expect(planQuoteIntentKey("same-id")).not.toBe(checkoutIntentKey("same-id"));
  });

  it("keeps the key after success, so a resubmit reaches the same booking", () => {
    // Clearing on success is what would allow a second Booking Group: the retry
    // would arrive under a key Django has never seen.
    const key = checkoutIntentKey("quote-1");
    expect(checkoutIntentKey("quote-1")).toBe(key);
  });
});
