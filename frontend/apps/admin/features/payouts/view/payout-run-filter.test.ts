import { describe, expect, it } from "vitest";

import { BATCH_LABEL, filterRuns } from "./payout-console";

const runs = [
  { id: "a", status: "PENDING_APPROVAL" },
  { id: "b", status: "APPROVED" },
  { id: "c", status: "PAYING" },
  { id: "d", status: "PAID" },
  { id: "e", status: "CANCELLED" },
  { id: "f", status: "FAILED" },
];

describe("payout run list", () => {
  it("leads with the runs a person still has to act on or watch", () => {
    expect(filterRuns(runs, "action").map((run) => run.id)).toEqual(["a", "b", "c", "f"]);
    expect(filterRuns(runs, "done").map((run) => run.id)).toEqual(["d", "e"]);
    expect(filterRuns(runs, "all")).toHaveLength(6);
  });

  it("names every status in plain words", () => {
    expect(BATCH_LABEL.PENDING_APPROVAL).toBe("Waiting for approval");
    expect(BATCH_LABEL.APPROVED).toBe("Approved, ready to pay");
    expect(BATCH_LABEL.PAYING).toBe("Sending to banks");
  });
});
