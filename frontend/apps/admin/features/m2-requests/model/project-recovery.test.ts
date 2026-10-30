import { describe, expect, it } from "vitest";

import {
  hasDisputedMilestone,
  transferQuotes,
  transferableMilestones,
  type ProjectMilestone,
} from "./project-recovery";

function milestone(patch: Partial<ProjectMilestone>): ProjectMilestone {
  return {
    stage_id: "s",
    milestone_label: "Stage",
    kind: "WORK",
    status: "PENDING",
    funding_state: "REQUIRED",
    ...patch,
  } as ProjectMilestone;
}

describe("project recovery", () => {
  it("prices only unfinished work and unfunded advances", () => {
    const rows = [
      milestone({ stage_id: "a", status: "PENDING" }),
      milestone({ stage_id: "b", status: "APPROVED" }),
      milestone({ stage_id: "c", status: "IN_PROGRESS", kind: "MATERIAL_ADVANCE", funding_state: "FUNDED" }),
      milestone({ stage_id: "d", status: "CORRECTION_REQUESTED" }),
    ];
    expect(transferableMilestones(rows).map((m) => m.stage_id)).toEqual(["a", "d"]);
  });

  it("spots a disputed milestone", () => {
    expect(hasDisputedMilestone([milestone({ status: "DISPUTED" })])).toBe(true);
    expect(hasDisputedMilestone([milestone({})])).toBe(false);
  });

  it("builds one quote per milestone in paise", () => {
    const rows = [milestone({ stage_id: "a" }), milestone({ stage_id: "b", milestone_label: "Paint" })];
    expect(transferQuotes(rows, { a: "1500", b: "250.50" })).toEqual({
      quotes: [
        { stage_id: "a", amount_paise: 150000 },
        { stage_id: "b", amount_paise: 25050 },
      ],
    });
    expect(transferQuotes(rows, { a: "1500" })).toEqual({ error: "Enter the new vendor's price for “Paint”." });
  });
});
