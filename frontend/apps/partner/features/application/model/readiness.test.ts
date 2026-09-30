import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  canSubmit,
  isEditable,
  outstandingRequirements,
  rejectedDocuments,
  requirements,
} from "./readiness";

type Application = Schemas["PartnerApplication"];
type Document = Schemas["PartnerDocument"];

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    kind: "GOVERNMENT_ID",
    version: 1,
    content_type: "image/jpeg",
    size_bytes: 120_000,
    scan_status: "CLEAN",
  scanned_at: "2026-07-01T10:00:00Z",
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
    status: "DRAFT",
    version: 1,
    display_name: "",
    biography: "",
    experience_years: 0,
    skill_codes: [],
    service_variant_ids: [],
    service_area_ids: [],
    change_request_message: "",
    submitted_at: null,
    reviewed_at: null,
    consents: [],
    documents: [],
    transitions: [],
    created_at: "2026-07-30T09:00:00Z",
    updated_at: "2026-07-30T09:00:00Z",
    ...overrides,
  } as Application;
}

/** An application with everything M1 requires before review. */
function completeApplication(overrides: Partial<Application> = {}): Application {
  return application({
    display_name: "Ramesh K.",
    experience_years: 5,
    skill_codes: ["electrical"],
    service_variant_ids: ["variant-1"],
    service_area_ids: ["area-1"],
    documents: [
      document({ id: "doc-id", kind: "GOVERNMENT_ID" }),
      document({ id: "doc-addr", kind: "ADDRESS_PROOF" }),
    ],
    consents: [{ code: "terms", granted_at: "2026-07-30T09:00:00Z" }] as never,
    ...overrides,
  });
}

describe("requirements", () => {
  it("lists everything as outstanding for an empty draft", () => {
    const outstanding = outstandingRequirements(application());
    expect(outstanding.map((item) => item.code)).toEqual([
      "DISPLAY_NAME",
      "EXPERIENCE_YEARS",
      "SKILLS",
      "SERVICES",
      "SERVICE_AREAS",
      "GOVERNMENT_ID",
      "ADDRESS_PROOF",
      "CONSENTS",
    ]);
  });

  it("reports nothing outstanding once complete", () => {
    expect(outstandingRequirements(completeApplication())).toHaveLength(0);
  });

  it("does not require bank or tax documents to apply", () => {
    // Payout details are collected before the first payout, not before review.
    // Requiring them here turns a form into an errand.
    const codes = requirements(application()).map((item) => item.code);
    expect(codes).not.toContain("BANK");
    expect(codes).not.toContain("TAX");
  });

  it("counts a pending document as done", () => {
    // The Partner did their part; the document is in a queue they do not
    // control. Calling it missing tells them to re-upload it.
    const withPending = completeApplication({
      documents: [
        document({ kind: "GOVERNMENT_ID", status: "PENDING" }),
        document({ id: "d2", kind: "ADDRESS_PROOF", status: "APPROVED" }),
      ],
    });
    expect(outstandingRequirements(withPending)).toHaveLength(0);
  });

  it("counts a rejected document as missing", () => {
    const withRejected = completeApplication({
      documents: [
        document({ kind: "GOVERNMENT_ID", status: "REJECTED", review_reason: "Blurred" }),
        document({ id: "d2", kind: "ADDRESS_PROOF", status: "APPROVED" }),
      ],
    });
    expect(outstandingRequirements(withRejected).map((item) => item.code)).toEqual([
      "GOVERNMENT_ID",
    ]);
  });

  it("does not count a superseded document", () => {
    const superseded = completeApplication({
      documents: [
        document({ kind: "GOVERNMENT_ID", status: "SUPERSEDED" }),
        document({ id: "d2", kind: "ADDRESS_PROOF", status: "APPROVED" }),
      ],
    });
    expect(outstandingRequirements(superseded).map((item) => item.code)).toEqual([
      "GOVERNMENT_ID",
    ]);
  });

  it("surfaces rejected documents with their reason", () => {
    const rejected = rejectedDocuments(
      completeApplication({
        documents: [
          document({ status: "REJECTED", review_reason: "Photo is cut off" }),
        ],
      }),
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.review_reason).toBe("Photo is cut off");
  });

  it("gives every outstanding requirement somewhere to go", () => {
    for (const item of outstandingRequirements(application())) {
      expect(item.href).toMatch(/^\/apply\//);
    }
  });
});

describe("editability", () => {
  it("allows editing a draft", () => {
    expect(isEditable(application({ status: "DRAFT" }))).toBe(true);
  });

  it("reopens editing when changes are required", () => {
    expect(isEditable(application({ status: "CHANGES_REQUIRED" }))).toBe(true);
  });

  it("locks the application while it is being reviewed", () => {
    // Editing underneath a reviewer is how two people end up looking at
    // different versions of the same document set.
    expect(isEditable(application({ status: "SUBMITTED" }))).toBe(false);
    expect(isEditable(application({ status: "UNDER_REVIEW" }))).toBe(false);
  });

  it("locks a suspended account", () => {
    expect(isEditable(application({ status: "SUSPENDED" }))).toBe(false);
  });
});

describe("submission", () => {
  it("permits submitting a complete draft", () => {
    expect(canSubmit(completeApplication())).toBe(true);
  });

  it("refuses an incomplete draft", () => {
    expect(canSubmit(application())).toBe(false);
  });

  it("refuses to resubmit something already under review", () => {
    expect(canSubmit(completeApplication({ status: "UNDER_REVIEW" }))).toBe(false);
  });

  it("permits resubmitting after changes were requested", () => {
    expect(canSubmit(completeApplication({ status: "CHANGES_REQUIRED" }))).toBe(true);
  });
});

describe("a stay host", () => {
  it("is never asked for trades, areas or years of experience", () => {
    const codes = requirements(application({ track: "STAY_HOST" })).map((item) => item.code);

    expect(codes).not.toContain("SKILLS");
    expect(codes).not.toContain("SERVICES");
    expect(codes).not.toContain("SERVICE_AREAS");
    expect(codes).not.toContain("EXPERIENCE_YEARS");
    expect(codes).toContain("DISPLAY_NAME");
    expect(codes).toContain("CONSENTS");
    expect(codes).toContain("GOVERNMENT_ID");
  });
});
