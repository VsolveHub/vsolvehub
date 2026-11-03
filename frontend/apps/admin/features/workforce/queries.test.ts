import { describe, expect, it } from "vitest";

import { REQUEST_GROUPS, REQUEST_STATUS_LABEL } from "./queries";

describe("crew and project request filters", () => {
  it("names every request status in plain words", () => {
    expect(Object.keys(REQUEST_STATUS_LABEL)).toHaveLength(13);
    expect(REQUEST_STATUS_LABEL.ENGAGED).toBe("Work in progress");
  });

  it("splits closed requests into completed and closed without work, with no overlap", () => {
    const completed = REQUEST_GROUPS.find((group) => group.key === "completed")!.filters;
    const other = REQUEST_GROUPS.find((group) => group.key === "closed_other")!.filters;
    expect("status" in completed && completed.status).toBe("CLOSED_COMPLETE");
    expect("status" in other && other.status.split(",")).not.toContain("CLOSED_COMPLETE");
  });
});
