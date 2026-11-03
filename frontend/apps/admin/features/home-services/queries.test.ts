import { describe, expect, it } from "vitest";

import { STATUS_GROUPS, groupFromParam, statusForGroup } from "./queries";

describe("home-service booking quick filters", () => {
  it("asks the server for every status in a stage", () => {
    expect(statusForGroup("upcoming")).toBe("CONFIRMED,EN_ROUTE");
    expect(statusForGroup("needs_help")).toBe("DISPUTED,RECOVERY_REQUIRED");
    expect(statusForGroup("")).toBe("");
  });

  it("covers every visit status exactly once across the stages", () => {
    const statuses = STATUS_GROUPS.flatMap((group) => (group.status ? group.status.split(",") : []));
    expect(new Set(statuses).size).toBe(statuses.length);
    expect(statuses).toHaveLength(11);
  });

  it("opens on the stage a link names, and on all visits for anything else", () => {
    expect(groupFromParam("needs_help")).toBe("needs_help");
    expect(groupFromParam("nonsense")).toBe("");
    expect(groupFromParam(null)).toBe("");
  });
});
