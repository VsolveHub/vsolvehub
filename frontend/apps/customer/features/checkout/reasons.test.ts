import { describe, expect, it } from "vitest";

import { conflict, planSet } from "./fixtures";
import {
  describeConfirmFailure,
  describeItemFailure,
  describePlanReasons,
  describePlanSetFailure,
  describeQuoteFailure,
  describeUnitReasons,
  readReasonCodes,
} from "./reasons";

/**
 * Wording for refusals the customer has to act on.
 *
 * The assertions below are about *instructions*, not phrasing. Two of these
 * refusals arrive as the same 409 and tell the customer to do opposite things —
 * one to wait and one to start again — so collapsing them is not a copy
 * regression, it is the difference between one booking and two.
 */

describe("reason codes the server publishes as `unknown`", () => {
  it("keeps only the strings, because the contract promises nothing else", () => {
    expect(readReasonCodes(["a", 1, null, "", "b"])).toEqual(["a", "b"]);
    expect(readReasonCodes("not an array")).toEqual([]);
    expect(readReasonCodes(undefined)).toEqual([]);
  });

  it("shows an unmapped code rather than inventing a sentence for it", () => {
    // A code nobody has seen before is still the server's answer. Replacing it
    // with "this was separated for operational reasons" would read as an
    // explanation the server never gave.
    expect(describePlanReasons(["some_new_planner_reason"])).toEqual([
      "Some new planner reason",
    ]);
  });

  it("drops the positional marker, which identifies a unit rather than explaining it", () => {
    expect(describeUnitReasons(["unit_0", "compatible_same_partner_sequential"])).toEqual([
      "One professional can safely do all of this in a single visit.",
    ]);
  });

  it("says so plainly when the server gave no reason at all", () => {
    expect(describeItemFailure(null)).toMatch(/did not give a reason/i);
  });
});

describe("a refused pricing", () => {
  it("sends a stale plan back to re-planning, not to retrying the same list", () => {
    const message = describeQuoteFailure(conflict("fulfilment_plan_stale"));
    expect(message).toMatch(/pick a time again/i);
    expect(message).toMatch(/nothing has been booked or charged/i);
  });

  it("tells a reused key on quote creation to start over, which is readable copy", () => {
    const message = describeQuoteFailure(conflict("idempotency_key_reused"));
    expect(message).toMatch(/booking changed after this quote was started/i);
    expect(message).toMatch(/nothing has been booked or charged/i);
  });

  it("falls back to the shared description for anything else", () => {
    const message = describeQuoteFailure(conflict("some_other_refusal"));
    expect(message).not.toMatch(/pick a time again/i);
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("an unusable plan set", () => {
  /**
   * These used to bolt `decisive_reasons` onto the fixture and assert the result. The fixture is
   * declared `satisfies Schemas["FulfilmentPlanSet"]` and has no such field, and neither does
   * the server's payload — so the tests passed against a shape nobody publishes while the real
   * function returned its fallback for every input. `status` is what the plan set actually
   * carries, so it is what these assert on.
   */

  it("tells a timed-out set it can simply be re-priced", () => {
    const message = describePlanSetFailure({ ...planSet(), status: "EXPIRED" });

    expect(message).toMatch(/15 minutes/i);
    expect(message).toMatch(/nothing has been booked or charged/i);
    // The recovery is the point: nothing changed, so the same choices should return.
    expect(message).toMatch(/fresh times/i);
  });

  it("does not tell a timed-out set that the booking changed", () => {
    // The old fallback said exactly this for a timeout, which sends the customer looking for an
    // edit they never made.
    const message = describePlanSetFailure({ ...planSet(), status: "EXPIRED" });

    expect(message).not.toMatch(/booking changed/i);
  });

  it("tells an invalidated set the booking moved underneath it", () => {
    const message = describePlanSetFailure({ ...planSet(), status: "INVALIDATED" });

    expect(message).toMatch(/booking changed/i);
    expect(message).toMatch(/nothing has been booked or charged/i);
  });

  it("shows a neutral recovery message when the set is selected without an active quote", () => {
    const message = describePlanSetFailure({ ...planSet(), status: "SELECTED" });

    expect(message).toBe("We couldn’t confirm these options. Please choose a time again.");
  });

  it("claims only what is certain when there is no plan set at all", () => {
    const message = describePlanSetFailure(null);

    expect(message).toBe("These options are no longer current. Nothing has been booked or charged.");
  });
});

describe("a refused confirmation", () => {
  it("tells an in-flight duplicate to wait, never to send again", () => {
    // The single most important sentence in the flow: this is exactly when a
    // customer reaches for the button a second time.
    const message = describeConfirmFailure(conflict("idempotency_in_progress"));
    expect(message).toMatch(/wait a moment/i);
    expect(message).toMatch(/rather than confirming again/i);
    expect(message).not.toMatch(/try again/i);
  });

  it("tells a reused key to start the confirmation over, which is the opposite instruction", () => {
    const message = describeConfirmFailure(conflict("idempotency_key_reused"));
    expect(message).toMatch(/start the confirmation again/i);
    expect(message).not.toMatch(/wait a moment/i);
  });

  it("treats an expired quote as a price that lapsed, not as a failed booking", () => {
    const message = describeConfirmFailure(conflict("quote_expired"));
    expect(message).toMatch(/expired before it was confirmed/i);
    expect(message).toMatch(/nothing has been booked or charged/i);
  });

  it("never claims a server refusal when the request simply did not arrive", () => {
    const message = describeConfirmFailure(new Error("offline"));
    expect(message).not.toMatch(/expired/i);
    expect(message).not.toMatch(/wait a moment/i);
  });
});
