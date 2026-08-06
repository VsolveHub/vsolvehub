import { describe, expect, it } from "vitest";

import {
  cartMergeConflict,
  cartVersionConflict,
  duplicateCartItemConflict,
  isCartItemNotFound,
  isCommandInFlight,
  isIdempotencyKeyReused,
  isPlanStale,
  isQuoteExpired,
  planUnavailable,
} from "./conflicts";
import { conflict } from "./fixtures";

/**
 * Five server refusals, five different recoveries.
 *
 * They all arrive as 409, so status cannot tell them apart, and collapsing any
 * two produces the same failure: a customer told "something went wrong" about a
 * decision they could have made themselves.
 */

describe("cart version conflict", () => {
  it("carries the version the server actually holds", () => {
    const detected = cartVersionConflict(
      conflict("cart_version_conflict", { current_version: 7 }),
    );

    expect(detected).toEqual({ currentVersion: 7 });
  });

  it("is still a conflict when the server names no version", () => {
    // Degrading to "not a conflict" would let a rejected edit look applied.
    expect(cartVersionConflict(conflict("cart_version_conflict"))).toEqual({
      currentVersion: null,
    });
  });

  it("does not fire for other refusals or transport failures", () => {
    expect(cartVersionConflict(conflict("duplicate_cart_item"))).toBeNull();
    expect(cartVersionConflict(new Error("offline"))).toBeNull();
    expect(cartVersionConflict(null)).toBeNull();
  });
});

describe("cart item not found", () => {
  it("recognises the published code", () => {
    expect(isCartItemNotFound(conflict("cart_item_not_found"))).toBe(true);
  });

  it("does not fire for other refusals", () => {
    expect(isCartItemNotFound(conflict("cart_version_conflict"))).toBe(false);
    expect(isCartItemNotFound(new Error("offline"))).toBe(false);
  });
});

describe("duplicate cart item", () => {
  it("points at the item that already says this", () => {
    const detected = duplicateCartItemConflict(
      conflict("duplicate_cart_item", {
        existing_item_id: "item-9",
        current_version: 4,
        recovery: "update_existing_item",
      }),
    );

    expect(detected).toEqual({ existingItemId: "item-9", currentVersion: 4 });
  });

  it("is never confused with a version conflict", () => {
    // One means "edit the item you have"; the other means "read the cart again".
    expect(duplicateCartItemConflict(conflict("cart_version_conflict"))).toBeNull();
  });
});

describe("login cart merge", () => {
  it("lists every overlapping item so each can be ruled on", () => {
    const detected = cartMergeConflict(
      conflict("cart_merge_conflict", {
        customer_cart_version: 2,
        session_cart_version: 5,
        allowed_actions: ["KEEP_CUSTOMER", "KEEP_SESSION", "KEEP_BOTH"],
        conflicts: [
          {
            kind: "EXACT_DUPLICATE",
            customer_item_id: "c-1",
            session_item_id: "s-1",
            variant_id: "v-1",
          },
          { kind: "DECISION_REQUIRED", customer_item_id: "c-2", session_item_id: "s-2" },
        ],
      }),
    );

    expect(detected?.customerCartVersion).toBe(2);
    expect(detected?.sessionCartVersion).toBe(5);
    expect(detected?.duplicates).toEqual([
      { customerItemId: "c-1", sessionItemId: "s-1" },
      { customerItemId: "c-2", sessionItemId: "s-2" },
    ]);
  });

  it("does not turn a limit refusal into a per-item decision", () => {
    // No item id means no choice can resolve it, so offering radios would be a
    // control that cannot work.
    const detected = cartMergeConflict(
      conflict("cart_merge_conflict", {
        customer_cart_version: 2,
        session_cart_version: 5,
        conflicts: [
          { kind: "CART_LIMIT_EXCEEDED", combined_item_count: 7, maximum_item_count: 5 },
        ],
      }),
    );

    expect(detected?.duplicates).toEqual([]);
    expect(detected?.limit).toEqual({ combinedItemCount: 7, maximumItemCount: 5 });
  });

  it("flags a mid-merge version change as needing a re-read, not a decision", () => {
    const detected = cartMergeConflict(
      conflict("cart_merge_conflict", {
        customer_cart_version: 3,
        session_cart_version: 6,
        conflicts: [{ kind: "CART_VERSION_CHANGED" }],
      }),
    );

    expect(detected?.versionChanged).toBe(true);
    expect(detected?.duplicates).toEqual([]);
  });

  it("ignores conflict rows it cannot read rather than inventing an item", () => {
    const detected = cartMergeConflict(
      conflict("cart_merge_conflict", { conflicts: ["nonsense", null, 42] }),
    );

    expect(detected?.duplicates).toEqual([]);
  });
});

describe("fulfilment planning", () => {
  it("reports which cart item could not be placed, and why", () => {
    const failures = planUnavailable(
      conflict("fulfilment_plan_unavailable", {
        item_failures: [
          { cart_item_id: "item-1", reason: "no_eligible_capacity" },
          { cart_item_id: null, reason: "dependency_cycle" },
        ],
      }),
    );

    expect(failures).toEqual([
      { cartItemId: "item-1", reason: "no_eligible_capacity" },
      { cartItemId: null, reason: "dependency_cycle" },
    ]);
  });

  it("is an empty list, not null, when the server names no item", () => {
    // Null means "this was not a planning refusal". An empty list means "it was,
    // and the server gave no per-item detail" — the screen must still say the
    // plan failed.
    expect(planUnavailable(conflict("fulfilment_plan_unavailable"))).toEqual([]);
  });

  it("tells a stale plan apart from an infeasible one", () => {
    // One re-plans against the current cart; the other needs a different time or
    // a smaller booking. They are not the same message.
    expect(isPlanStale(conflict("fulfilment_plan_stale"))).toBe(true);
    expect(isPlanStale(conflict("fulfilment_plan_unavailable"))).toBe(false);
    expect(planUnavailable(conflict("fulfilment_plan_stale"))).toBeNull();
  });
});

describe("quote and command state", () => {
  it("recognises an expired quote", () => {
    expect(isQuoteExpired(conflict("quote_expired"))).toBe(true);
    expect(isQuoteExpired(conflict("fulfilment_plan_stale"))).toBe(false);
  });

  it("separates a command still running from a key used on a different body", () => {
    // The first means wait for the authoritative result. The second is a client
    // bug and must never be answered with a fresh key, which would duplicate the
    // command it caught.
    expect(isCommandInFlight(conflict("idempotency_in_progress"))).toBe(true);
    expect(isIdempotencyKeyReused(conflict("idempotency_in_progress"))).toBe(false);

    expect(isIdempotencyKeyReused(conflict("idempotency_key_reused"))).toBe(true);
    expect(isCommandInFlight(conflict("idempotency_key_reused"))).toBe(false);
  });

  it("claims none of them for a transport failure", () => {
    // "Your price expired" is a statement about the server. Saying it because
    // the network dropped is a fabricated claim.
    for (const check of [isQuoteExpired, isPlanStale, isCommandInFlight]) {
      expect(check(new Error("offline"))).toBe(false);
    }
  });
});
