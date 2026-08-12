import { describe, expect, it } from "vitest";

import { DECLINE_REASONS, describeDeclineReason, findDeclineReason } from "./decline-reasons";

/**
 * The decline vocabulary.
 *
 * It is client-owned because contract 1.21.0 publishes none — `reason_code` is
 * an unconstrained slug and Django stores whatever arrives. These tests fix the
 * shape of what this build sends so the day a server vocabulary lands, the diff
 * is visible rather than silent.
 */

describe("the vocabulary", () => {
  it("sends slugs, because Django stores them in a SlugField", () => {
    for (const reason of DECLINE_REASONS) {
      expect(reason.code).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(reason.code.length).toBeLessThanOrEqual(80);
    }
  });

  it("has no duplicate codes", () => {
    const codes = DECLINE_REASONS.map((reason) => reason.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("tells the vendor what each reason is used for", () => {
    // A reason box nobody explains is a reason box people click through, and a
    // decline reason nobody acts on makes the matcher look like it is learning
    // when it is not.
    for (const reason of DECLINE_REASONS) {
      expect(reason.consequence.trim()).not.toBe("");
    }
  });

  it("never promises the customer sees the vendor's own rate", () => {
    const budgetReason = findDeclineReason("rate_too_low");
    expect(budgetReason?.consequence).toMatch(/Your rate is not shared/i);
  });
});

describe("reading a code back", () => {
  it("finds a known reason", () => {
    expect(findDeclineReason("no_capacity")?.label).toMatch(/booked/i);
  });

  it("returns nothing for a code this build does not carry", () => {
    expect(findDeclineReason("something_new")).toBeNull();
  });

  it("de-slugs an unknown code rather than hiding it", () => {
    // Reachable in two ordinary ways: `withdraw_invitation` writes
    // `requirement_changed`, and a newer deployment can add codes this bundle
    // predates. Showing the raw record beats showing nothing.
    expect(describeDeclineReason("requirement_changed")).toBe("Requirement changed");
    expect(describeDeclineReason("cluster-already-holds-slot")).toBe(
      "Cluster already holds slot",
    );
  });

  it("shows nothing for an empty code", () => {
    // The ordinary state of a live invitation: `decline_reason_code` is blank
    // until somebody declines.
    expect(describeDeclineReason("")).toBe("");
  });
});
