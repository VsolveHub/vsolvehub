import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import { previousStep, progressSummary, stepProgress } from "./progress";

/**
 * Completion, and the two ways it could lie.
 *
 * The onboarding header states "Step 3 of 6" and a bar states a percentage, and
 * the overview states "2 things left". All three read this module. The failures
 * worth guarding are the ones where those numbers quietly disagree with each
 * other or with the record.
 */

type Application = Schemas["PartnerApplication"];

const EMPTY = {
  id: "app-1",
  status: "DRAFT",
  version: 1,
  display_name: "",
  biography: "",
  experience_years: 0,
  skill_codes: [],
  service_variant_ids: [],
  service_area_ids: [],
  consents: [],
  documents: [],
  transitions: [],
  change_request_message: null,
  submitted_at: null,
  reviewed_at: null,
  review_assigned_at: null,
  review_assigned_to_id: null,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
} as unknown as Application;

function withDocuments(kinds: readonly string[]): Application["documents"] {
  return kinds.map((kind, index) => ({
    id: `doc-${index}`,
    kind,
    status: "PENDING",
    review_reason: null,
  })) as unknown as Application["documents"];
}

/** Everything a submission needs, and nothing more. */
const COMPLETE = {
  ...EMPTY,
  display_name: "Ravi",
  skill_codes: ["ELECTRICAL"],
  service_variant_ids: ["var-1"],
  service_area_ids: ["area-1"],
  consents: [{ purpose: "PARTNER_TERMS", document_version: "2026-07", withdrawn_at: null }],
  documents: withDocuments(["GOVERNMENT_ID", "ADDRESS_PROOF"]),
} as unknown as Application;

describe("what counts as a step", () => {
  it("excludes the overview and the review screen from the denominator", () => {
    /*
      They collect nothing — they are the way in and the way out. Counting them
      would make "4 of 8" mean something different from "2 things left to do",
      and an applicant would be reading two numbers that never agree.
    */
    const summary = progressSummary(COMPLETE);
    const steps = stepProgress(COMPLETE);

    expect(steps.filter((step) => step.state === "waypoint").map((step) => step.href)).toEqual([
      "/apply",
      "/apply/review",
    ]);
    expect(summary.total).toBe(5);
    expect(summary.done).toBe(5);
  });

  it("marks a step that collects nothing required as optional, never as done", () => {
    /*
      The headline negative. `/apply/schedule` has no entry in `requirements`,
      so grouping alone reports zero requirements and zero unmet — which would
      put a tick against something the applicant has not done. A false tick in
      onboarding is worse than a missing one: it is the reason somebody submits
      believing they published hours they never set.
    */
    const schedule = stepProgress(EMPTY).find((step) => step.href === "/apply/schedule");

    expect(schedule?.state).toBe("optional");
    expect(schedule?.state).not.toBe("done");
  });
});

describe("a brand-new applicant", () => {
  it("has done none of it", () => {
    const summary = progressSummary(EMPTY);
    expect(summary.done).toBe(0);
    expect(summary.fraction).toBe(0);
    expect(summary.nextIncomplete?.href).toBe("/apply/about");
  });

  it("reports the same before an application exists at all", () => {
    // `null` is the 404 case — nobody has applied. Nothing is on the record, so
    // nothing is complete. Honest rather than pessimistic.
    const summary = progressSummary(null);
    expect(summary.done).toBe(0);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.nextIncomplete?.href).toBe("/apply/about");
  });
});

describe("partial progress", () => {
  it("counts a step done only when everything it collects is present", () => {
    /*
      `/apply/work` carries two requirements — SKILLS and SERVICES — and one of
      them being satisfied is not the step being finished.
    */
    const halfWork = { ...EMPTY, display_name: "Ravi", skill_codes: ["ELECTRICAL"] } as Application;
    const steps = stepProgress(halfWork);

    const about = steps.find((step) => step.href === "/apply/about");
    const work = steps.find((step) => step.href === "/apply/work");

    expect(about?.state).toBe("done");
    expect(work?.state).toBe("todo");
    expect(work?.outstanding).toBe(1);
  });

  it("points at the first unfinished step, in sequence order", () => {
    // Not "the one with the most missing" and not the last one found — an
    // applicant resuming should land where the form actually stops.
    const started = { ...COMPLETE, service_area_ids: [], display_name: "" } as Application;
    expect(progressSummary(started).nextIncomplete?.href).toBe("/apply/about");
  });

  it("has nothing left to point at once the record is complete", () => {
    expect(progressSummary(COMPLETE).nextIncomplete).toBeNull();
    expect(progressSummary(COMPLETE).fraction).toBe(1);
  });
});

describe("stepping backwards", () => {
  it("gives the previous step in the sequence", () => {
    expect(previousStep("/apply/areas")?.href).toBe("/apply/work");
  });

  it("tolerates a trailing slash, because Next produces either form", () => {
    expect(previousStep("/apply/areas/")?.href).toBe("/apply/work");
  });

  it("has nowhere to go back to from the first step", () => {
    expect(previousStep("/apply")).toBeNull();
  });

  it("returns null for a path that is not a step", () => {
    // The specialist-work branch is not on the main sequence. A back control
    // that guessed would send somebody to an unrelated screen.
    expect(previousStep("/apply/insurance")).toBeNull();
  });
});
