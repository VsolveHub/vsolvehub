import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  availableActions,
  canSubmitDecision,
  hasUnreviewedDocuments,
  isActionAvailable,
  pendingDocuments,
} from "./decisions";

type Application = Schemas["PartnerApplication"];
type Document = Schemas["PartnerDocument"];

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    kind: "GOVERNMENT_ID",
    version: 1,
    content_type: "image/jpeg",
    size_bytes: 120_000,
    sha256: "a".repeat(64),
    status: "PENDING",
    review_reason: "",
    uploaded_at: "2026-07-30T09:00:00Z",
    reviewed_at: null,
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    partner_id: "partner-1",
    status: "SUBMITTED",
    version: 3,
    display_name: "Ramesh K.",
    biography: "",
    experience_years: 4,
    skill_codes: ["electrical"],
    service_variant_ids: ["variant-1"],
    service_area_ids: ["area-1"],
    change_request_message: "",
    submitted_at: "2026-07-30T09:00:00Z",
    reviewed_at: null,
    consents: [],
    documents: [],
    transitions: [],
    created_at: "2026-07-30T09:00:00Z",
    updated_at: "2026-07-30T09:00:00Z",
    ...overrides,
  } as Application;
}

describe("available actions", () => {
  it("offers nothing on a draft the Partner has not submitted", () => {
    // Reaching into an unsubmitted application is the database-edit habit the
    // plan forbids.
    expect(availableActions("DRAFT")).toHaveLength(0);
  });

  it("offers nothing on a closed account", () => {
    expect(availableActions("OFFBOARDED")).toHaveLength(0);
  });

  it("lets a submitted application be reviewed, returned or approved", () => {
    const targets = availableActions("SUBMITTED").map((action) => action.target);
    expect(targets).toEqual(["UNDER_REVIEW", "CHANGES_REQUIRED", "APPROVED"]);
  });

  it("does not offer approving an already-approved application", () => {
    expect(isActionAvailable("APPROVED", "APPROVED")).toBe(false);
  });

  it("does not offer suspending an application that was never approved", () => {
    expect(isActionAvailable("SUBMITTED", "SUSPENDED")).toBe(false);
  });

  it("lets a suspended Partner be reinstated", () => {
    expect(isActionAvailable("SUSPENDED", "APPROVED")).toBe(true);
  });

  it("states the consequence of every action", () => {
    // The reviewer is deciding someone's income. Each button says what happens.
    for (const status of ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "SUSPENDED"] as const) {
      for (const action of availableActions(status)) {
        expect(action.consequence.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("reasons", () => {
  it("requires a reason to request changes", () => {
    // A CHANGES_REQUIRED with no note is how onboarding stalls: the Partner is
    // told to fix something and not told what.
    const action = availableActions("SUBMITTED").find(
      (candidate) => candidate.target === "CHANGES_REQUIRED",
    )!;
    expect(action.requiresReason).toBe(true);
    expect(canSubmitDecision(action, "   ")).toBe(false);
    expect(canSubmitDecision(action, "ID photo is cut off at the edge")).toBe(true);
  });

  it("requires a reason to suspend or offboard", () => {
    for (const action of availableActions("APPROVED")) {
      expect(action.requiresReason).toBe(true);
    }
  });

  it("does not require a reason to approve", () => {
    const approve = availableActions("SUBMITTED").find(
      (candidate) => candidate.target === "APPROVED",
    )!;
    expect(canSubmitDecision(approve, "")).toBe(true);
  });
});

describe("document review state", () => {
  it("lists documents still awaiting a decision", () => {
    const withMixed = application({
      documents: [
        document({ id: "a", status: "PENDING" }),
        document({ id: "b", status: "APPROVED" }),
        document({ id: "c", status: "PENDING" }),
      ],
    });
    expect(pendingDocuments(withMixed).map((doc) => doc.id)).toEqual(["a", "c"]);
  });

  it("warns when approving would leave documents unreviewed", () => {
    expect(hasUnreviewedDocuments(application({ documents: [document()] }))).toBe(true);
  });

  it("does not warn when every document has been decided", () => {
    const decided = application({
      documents: [
        document({ id: "a", status: "APPROVED" }),
        document({ id: "b", status: "REJECTED", review_reason: "Blurred" }),
      ],
    });
    expect(hasUnreviewedDocuments(decided)).toBe(false);
  });
});
