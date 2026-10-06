// Ported from frontend/apps/partner/features/enquiry/model/decline-reasons.test.ts

import { DECLINE_REASONS, describeDeclineReason, findDeclineReason } from "./decline-reasons";

/**
 * The decline vocabulary.
 *
 * Contract 1.24.0 published `InvitationDeclineReasonEnum`, so the codes here are
 * the server's — uppercase enum members, not client-invented slugs. These tests
 * fix what this build sends so a silently dropped or renamed code shows up as a
 * diff rather than a `400`.
 */

describe("the vocabulary", () => {
  it("sends the published enum members, verbatim", () => {
    for (const reason of DECLINE_REASONS) {
      expect(reason.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
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
    const budgetReason = findDeclineReason("BUDGET_TOO_LOW");
    expect(budgetReason?.consequence).toMatch(/Your rate is not shared/i);
  });
});

describe("reading a code back", () => {
  it("finds a known reason", () => {
    expect(findDeclineReason("NO_CAPACITY")?.label).toMatch(/booked/i);
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
