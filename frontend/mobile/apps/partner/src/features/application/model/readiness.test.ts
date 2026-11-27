// Ported from frontend/apps/partner/features/application/model/readiness.test.ts
import type { Schemas } from "@vsolve/api-client";
import {
  canSubmit,
  isEditable,
  offeredDocumentKinds,
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
    can_edit: true,
    consents_complete: false,
    required_document_kinds: ["GOVERNMENT_ID", "ADDRESS_PROOF"],
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
    consents_complete: true,
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
          document({ status: "REJECTED", review_reason: "Photo is cut off", can_replace: true }),
        ],
      }),
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.review_reason).toBe("Photo is cut off");
  });

  it("does not offer to replace what the server refuses, as on a declined application", () => {
    const rejected = rejectedDocuments(
      completeApplication({ documents: [document({ status: "REJECTED", can_replace: false })] }),
    );
    expect(rejected).toHaveLength(0);
  });

  it("asks only for the documents the server requires", () => {
    const codes = requirements(application({ required_document_kinds: ["GOVERNMENT_ID"] })).map((item) => item.code);
    expect(codes).toContain("GOVERNMENT_ID");
    expect(codes).not.toContain("ADDRESS_PROOF");
  });

  it("offers the slots the server lists, a ride captain's driving documents included", () => {
    expect(offeredDocumentKinds(application())).toEqual(["GOVERNMENT_ID", "ADDRESS_PROOF"]);
    const rides = application({
      offered_document_kinds: ["GOVERNMENT_ID", "ADDRESS_PROOF", "DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE"],
    });
    expect(offeredDocumentKinds(rides)).toEqual([
      "GOVERNMENT_ID",
      "ADDRESS_PROOF",
      "DRIVING_LICENCE",
      "VEHICLE_RC",
      "VEHICLE_INSURANCE",
    ]);
  });

  it("gives every outstanding requirement somewhere to go", () => {
    for (const item of outstandingRequirements(application())) {
      expect(item.href).toMatch(/^\/apply\//);
    }
  });
});

describe("a services application", () => {
  const services = (overrides: Partial<Application> = {}) => completeApplication({ track: "SERVICES", ...overrides });

  it("also needs experience, trades, jobs and areas", () => {
    expect(outstandingRequirements(services()).map((item) => item.code)).toEqual([
      "EXPERIENCE_YEARS",
      "SKILLS",
      "SERVICES",
      "SERVICE_AREAS",
    ]);
  });

  it("can be sent once those are filled in", () => {
    const filled = services({
      experience_years: 3,
      skill_codes: ["ELECTRICIAN"],
      service_variant_ids: ["variant-1"],
      service_area_ids: ["area-1"],
    });
    expect(canSubmit(filled)).toBe(true);
  });

  it("does not ask a rental owner for any of it", () => {
    expect(outstandingRequirements(completeApplication({ track: "RENTAL_OWNER" }))).toHaveLength(0);
  });
});

describe("editability", () => {
  it("is the server's own answer", () => {
    expect(isEditable(application({ can_edit: true }))).toBe(true);
    expect(isEditable(application({ can_edit: false }))).toBe(false);
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
    expect(canSubmit(completeApplication({ status: "UNDER_REVIEW", can_edit: false }))).toBe(false);
  });

  it("permits resubmitting after changes were requested", () => {
    expect(canSubmit(completeApplication({ status: "CHANGES_REQUIRED" }))).toBe(true);
  });
});

function employer(
  hiringAs: "" | "INDIVIDUAL" | "BUSINESS",
  missingFields: string[],
): Application["employer"] {
  return {
    hiring_as: hiringAs,
    poster_role: "",
    id_document_type: "",
    email: "",
    area: "",
    city: "",
    pin_code: "",
    business: null,
    missing_fields: missingFields,
  } as unknown as Application["employer"];
}

const byCode = (items: ReturnType<typeof requirements>) =>
  Object.fromEntries(items.map((item) => [item.code, item]));

describe("an employer's details", () => {
  it("asks only who is hiring until they choose", () => {
    const items = requirements(
      application({ track: "EMPLOYER", employer: employer("", ["hiring_as"]) }),
    );

    expect(items.map((item) => item.code).slice(0, 2)).toEqual(["HIRING_AS", "CONSENTS"]);
    expect(byCode(items).HIRING_AS).toMatchObject({ href: "/apply/hiring-as", isMet: false });
  });

  it("asks the same of an employer with no employer record yet", () => {
    const items = requirements(application({ track: "EMPLOYER", employer: undefined }));

    expect(byCode(items).HIRING_AS).toMatchObject({ isMet: false });
  });

  it("puts everything an individual gives on one screen, read from the server's missing fields", () => {
    const missing = requirements(
      application({
        track: "EMPLOYER",
        employer: employer("INDIVIDUAL", ["area", "pin_code", "display_name", "id_document_type"]),
      }),
    );
    expect(byCode(missing).HIRING_AS?.isMet).toBe(true);
    expect(byCode(missing).EMPLOYER_ABOUT).toMatchObject({ href: "/apply/employer/about", isMet: false });
    expect(byCode(missing)).not.toHaveProperty("EMPLOYER_BUSINESS");
    expect(byCode(missing)).not.toHaveProperty("DISPLAY_NAME");

    const done = requirements(
      application({ track: "EMPLOYER", employer: employer("INDIVIDUAL", []) }),
    );
    expect(byCode(done).EMPLOYER_ABOUT?.isMet).toBe(true);
  });

  it("splits a business's fields between its two screens", () => {
    const items = requirements(
      application({
        track: "EMPLOYER",
        employer: employer("BUSINESS", ["legal_name", "pin_code", "poster_role"]),
      }),
    );

    expect(byCode(items).EMPLOYER_BUSINESS).toMatchObject({
      href: "/apply/employer/business",
      isMet: false,
    });
    expect(byCode(items).EMPLOYER_CONTACT).toMatchObject({
      href: "/apply/employer/contact",
      isMet: false,
    });
  });

  it("marks only the screen that still has something missing", () => {
    const items = requirements(
      application({
        track: "EMPLOYER",
        employer: employer("BUSINESS", ["display_name", "id_document_type"]),
      }),
    );

    expect(byCode(items).EMPLOYER_BUSINESS?.isMet).toBe(true);
    expect(byCode(items).EMPLOYER_CONTACT?.isMet).toBe(false);
  });

  it("is never asked of other tracks", () => {
    for (const track of ["SERVICES", "STAY_HOST", "RENTAL_OWNER"] as const) {
      const codes = requirements(application({ track })).map((item) => item.code);
      expect(codes).not.toContain("HIRING_AS");
      expect(codes).not.toContain("EMPLOYER_ABOUT");
      expect(codes).not.toContain("EMPLOYER_BUSINESS");
      expect(codes).not.toContain("EMPLOYER_CONTACT");
    }
  });
});
