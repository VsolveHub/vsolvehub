import { describe, expect, it } from "vitest";

import { sourceDecisionKind } from "./source-decision";

describe("source decision", () => {
  it("offers the stage command on a stage case", () => {
    expect(sourceDecisionKind({ source_kind: "engagement_stage", source_id: "s-1" })).toBe("stage");
  });

  it("offers the safety command on a safety case", () => {
    expect(sourceDecisionKind({ source_kind: "safety_incident", source_id: "i-1" })).toBe("safety");
  });

  it("offers nothing without a source, or for another source", () => {
    expect(sourceDecisionKind({ source_kind: null, source_id: null })).toBeNull();
    expect(sourceDecisionKind({ source_kind: "shift_attendance", source_id: "s-2" })).toBeNull();
    expect(sourceDecisionKind({ source_kind: "engagement_stage", source_id: null })).toBeNull();
  });
});
