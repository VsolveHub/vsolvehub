// Ported from frontend/apps/partner/features/application/model/progress.test.ts
import type { Schemas } from "@vsolve/api-client";
import { previousStep, progressSummary, stepProgress } from "./progress";

type Application = Schemas["PartnerApplication"];

const EMPTY = {
  id: "app-1",
  status: "DRAFT",
  track: "STAY_HOST",
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

/** Everything the short (stays and rentals) application needs. */
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

describe("what counts as a step", () => {
  it("counts Agree & send, where the agreements are accepted, as a step", () => {
    const summary = progressSummary(COMPLETE);
    const steps = stepProgress(COMPLETE);

    expect(steps.filter((step) => step.state === "waypoint")).toEqual([]);
    expect(steps.map((step) => step.href)).toEqual(["/apply/about", "/apply/documents", "/apply/review"]);
    expect(summary.total).toBe(3);
    expect(summary.done).toBe(3);
  });

  it("keeps Agree & send open until the agreements are accepted", () => {
    const unsigned = { ...COMPLETE, consents_complete: false } as Application;
    expect(progressSummary(unsigned).nextIncomplete?.href).toBe("/apply/review");
  });
});

describe("a services applicant", () => {
  const SERVICES = {
    ...COMPLETE,
    track: "SERVICES",
    skill_codes: ["electrician"],
    service_variant_ids: ["variant-1"],
    service_area_ids: ["area-1"],
  } as unknown as Application;

  it("points at Where you work until an area is chosen", () => {
    const noArea = { ...SERVICES, service_area_ids: [] } as unknown as Application;
    expect(progressSummary(noArea).nextIncomplete?.href).toBe("/apply/areas");
  });

  it("points at Your hours until every chosen area has hours, as the server requires", () => {
    expect(progressSummary(SERVICES, { rules: [], exceptions: [] } as never).nextIncomplete?.href).toBe(
      "/apply/schedule",
    );
    const withHours = {
      rules: [{ service_area_id: "area-1", is_active: true }],
      exceptions: [],
    } as never;
    expect(progressSummary(SERVICES, withHours).nextIncomplete).toBeNull();
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

describe("stepping backwards", () => {
  it("gives the previous step on the services path", () => {
    expect(previousStep("/apply/review", "SERVICES")?.href).toBe("/apply/documents");
    expect(previousStep("/apply/documents", "SERVICES")?.href).toBe("/apply/schedule");
    expect(previousStep("/apply/schedule", "SERVICES")?.href).toBe("/apply/areas");
    expect(previousStep("/apply/areas", "SERVICES")?.href).toBe("/apply/work");
  });

  it("gives the previous step on the short path", () => {
    expect(previousStep("/apply/documents", "STAY_HOST")?.href).toBe("/apply/about");
  });

  it("tolerates a trailing slash", () => {
    expect(previousStep("/apply/documents/", "STAY_HOST")?.href).toBe("/apply/about");
  });

  it("has nowhere to go back to from the first step", () => {
    expect(previousStep("/apply/about")).toBeNull();
  });

  it("returns null for a path that is not a step", () => {
    expect(previousStep("/apply/insurance")).toBeNull();
  });
});
