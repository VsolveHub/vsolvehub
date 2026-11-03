// Ported from frontend/apps/partner/features/application/model/readiness.test.ts
import type { Schemas } from "@vsolve/api-client";
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
    file_name: "government_id_v1.jpg",
    can_replace: false,
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

/** An application with everything the 4-step mobile onboarding requires. */
function completeApplication(overrides: Partial<Application> = {}): Application {
  return application({
    display_name: "webaura",
    documents: [
      document({ id: "doc-id", kind: "GOVERNMENT_ID" }),
      document({ id: "doc-addr", kind: "ADDRESS_PROOF" }),
    ],
    consents: [{ purpose: "PARTNER_TERMS", document_version: "2026-07", withdrawn_at: null }] as never,
    ...overrides,
  });
}

describe("requirements in 4-step flow", () => {
  it("lists core requirements as outstanding for an empty draft", () => {
    const outstanding = outstandingRequirements(application());
    expect(outstanding.map((item) => item.code)).toEqual([
      "DISPLAY_NAME",
      "CONSENTS",
      "GOVERNMENT_ID",
      "ADDRESS_PROOF",
    ]);
  });

  it("reports nothing outstanding once complete", () => {
    expect(outstandingRequirements(completeApplication())).toHaveLength(0);
  });

  it("does not require bank or tax documents to apply", () => {
    const codes = requirements(application()).map((item) => item.code);
    expect(codes).not.toContain("BANK");
    expect(codes).not.toContain("TAX");
  });

  it("counts a pending document as done", () => {
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
