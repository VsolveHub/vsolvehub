import { describe, expect, it } from "vitest";

import { ENQUIRY_FILTER_STATUSES } from "./stay-enquiries-workspace";
import { VISIT_FILTER_STATUSES } from "./stay-visits-workspace";

const ENQUIRY_STATES = ["SUBMITTED", "RESPONDED", "DECLINED", "WITHDRAWN", "EXPIRED", "CONFIRMED", "CANCELLED"];
const VISIT_STATES = ["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"];

function split(value: string): string[] {
  return value ? value.split(",") : [];
}

describe("stay tabs ask the server for disjoint states", () => {
  it("covers every enquiry state exactly once outside All", () => {
    const named = Object.entries(ENQUIRY_FILTER_STATUSES)
      .filter(([tab]) => tab !== "ALL")
      .flatMap(([, value]) => split(value));
    expect([...named].sort()).toEqual([...ENQUIRY_STATES].sort());
    expect(ENQUIRY_FILTER_STATUSES.ALL).toBe("");
  });

  it("covers every visit state exactly once", () => {
    const named = Object.values(VISIT_FILTER_STATUSES).flatMap(split);
    expect([...named].sort()).toEqual([...VISIT_STATES].sort());
  });
});
