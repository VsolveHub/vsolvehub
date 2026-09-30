import { describe, expect, it } from "vitest";

import type { ProposalSelection } from "@vsolve/query";

import { destinationAfterSelection } from "./selection-navigation";

function selection(engagementId: string | null): ProposalSelection {
  return {
    id: "selection-1",
    requirement: "requirement-1",
    proposal: "proposal-1",
    partner: "partner-1",
    status: "CONFIRMED",
    reconfirm_by: null,
    decided_at: "2026-08-21T08:00:00Z",
    decline_reason_code: "",
    engagement_id: engagementId,
    created_at: "2026-08-21T08:00:00Z",
  };
}

describe("selection navigation", () => {
  it("opens the engagement returned by a confirmed choice", () => {
    expect(destinationAfterSelection(selection("engagement-1"))).toBe(
      "/jobs/engagement-1",
    );
  });

  it("does not invent a destination for a legacy pending selection", () => {
    expect(destinationAfterSelection(selection(null))).toBeNull();
  });
});
