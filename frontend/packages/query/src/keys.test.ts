import { describe, expect, it } from "vitest";

import { queryKeys } from "./keys";

/**
 * Keys for the per-visit scheduling flow.
 *
 * These exist because a wrong key here is invisible: nothing throws, the screen
 * simply renders one cart's visits for another cart. The customer then picks a
 * slot against a `group_key` the server does not recognise, and the only symptom
 * is a `scheduling_groups_changed` refusal at the end of checkout.
 */
describe("scheduling group keys", () => {
  const address = "8bf0b4a2-0000-4000-8000-000000000001";

  it("separates carts at different versions", () => {
    expect(queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: address })).not.toEqual(
      queryKeys.booking.schedulingGroups({ cartVersion: 2, addressId: address }),
    );
  });

  it("separates addresses at the same cart version", () => {
    expect(queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: address })).not.toEqual(
      queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: "another-address" }),
    );
  });

  it("nests under booking so a cart command can invalidate it", () => {
    const key = queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: address });

    expect(key.slice(0, queryKeys.booking.all.length)).toEqual([...queryKeys.booking.all]);
  });

  it("does not collide with the windows key at the same inputs", () => {
    expect(queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: address })).not.toEqual(
      queryKeys.booking.windows({ cartVersion: 1, addressId: address }),
    );
  });
});

describe("suggestion keys", () => {
  it("separates carts at different versions", () => {
    expect(queryKeys.booking.suggestions(1)).not.toEqual(queryKeys.booking.suggestions(2));
  });

  it("nests under booking so a cart command can invalidate it", () => {
    const key = queryKeys.booking.suggestions(1);

    expect(key.slice(0, queryKeys.booking.all.length)).toEqual([...queryKeys.booking.all]);
  });

  it("stays clear of the plan-set subtree it must not be invalidated with", () => {
    expect(queryKeys.booking.suggestions(1)).not.toEqual(queryKeys.booking.planSets());
  });
});
