import { describe, expect, it } from "vitest";

import { APPLICATION_TAB_STATUSES } from "./queries";

describe("my applications tabs", () => {
  it("asks for every state on All and real states elsewhere", () => {
    expect(APPLICATION_TAB_STATUSES.ALL).toBe("");
    const known = new Set([
      "SUBMITTED",
      "UNDER_REVIEW",
      "SHORTLISTED",
      "INTERVIEW",
      "CONNECTED",
      "CONTACTED",
      "REJECTED",
      "WITHDRAWN",
      "EXPIRED",
    ]);
    for (const value of Object.values(APPLICATION_TAB_STATUSES)) {
      for (const state of value ? value.split(",") : []) expect(known.has(state)).toBe(true);
    }
  });
});
