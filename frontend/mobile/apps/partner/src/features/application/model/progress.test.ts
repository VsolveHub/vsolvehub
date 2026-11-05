// Ported from frontend/apps/partner/features/application/model/progress.test.ts
import type { Schemas } from "@vsolve/api-client";
import { previousStep, progressSummary, stepProgress } from "./progress";

type Application = Schemas["PartnerApplication"];

const EMPTY = {
  id: "app-1",
  status: "DRAFT",
  version: 1,
  can_edit: true,
  consents_complete: false,
  required_document_kinds: ["GOVERNMENT_ID", "ADDRESS_PROOF"],
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

/** Everything the 4-step mobile application needs. */
const COMPLETE = {
  ...EMPTY,
  display_name: "webaura",
  biography: "Home appliance service partner",
  experience_years: 5,
  consents_complete: true,
  consents: [
    { purpose: "PARTNER_TERMS", document_version: "2026-07", withdrawn_at: null },
    { purpose: "PRIVACY_NOTICE", document_version: "2026-07", withdrawn_at: null },
  ],
  documents: withDocuments(["GOVERNMENT_ID", "ADDRESS_PROOF"]),
} as unknown as Application;

describe("what counts as a step in the 4-step sequence", () => {
  it("excludes the review screen from the denominator", () => {
    const summary = progressSummary(COMPLETE);
    const steps = stepProgress(COMPLETE);

    expect(steps.filter((step) => step.state === "waypoint").map((step) => step.href)).toEqual([
      "/apply/review",
    ]);
    expect(summary.total).toBe(3);
    expect(summary.done).toBe(3);
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
    const summary = progressSummary(null);
    expect(summary.done).toBe(0);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.nextIncomplete?.href).toBe("/apply/about");
  });
});

describe("partial progress", () => {
  it("counts a step done only when everything it collects is present", () => {
    const halfDocs = {
      ...EMPTY,
      display_name: "webaura",
      documents: withDocuments(["GOVERNMENT_ID"]),
    } as Application;
    const steps = stepProgress(halfDocs);

    const about = steps.find((step) => step.href === "/apply/about");
    const docs = steps.find((step) => step.href === "/apply/documents");

    expect(about?.state).toBe("done");
    expect(docs?.state).toBe("todo");
    expect(docs?.outstanding).toBe(1);
  });

  it("has nothing left to point at once the record is complete", () => {
    expect(progressSummary(COMPLETE).nextIncomplete).toBeNull();
    expect(progressSummary(COMPLETE).fraction).toBe(1);
  });
});

describe("stepping backwards in 4-step sequence", () => {
  it("gives the previous step in the sequence", () => {
    expect(previousStep("/apply/review")?.href).toBe("/apply/documents");
    expect(previousStep("/apply/documents")?.href).toBe("/apply/consent");
    expect(previousStep("/apply/consent")?.href).toBe("/apply/about");
  });

  it("tolerates a trailing slash", () => {
    expect(previousStep("/apply/documents/")?.href).toBe("/apply/consent");
  });

  it("has nowhere to go back to from the first step", () => {
    expect(previousStep("/apply/about")).toBeNull();
  });

  it("returns null for a path that is not a step", () => {
    expect(previousStep("/apply/insurance")).toBeNull();
  });
});
