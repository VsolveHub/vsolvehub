import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  canSubmit,
  isEditable,
  offeredDocumentKinds,
  outstandingRequirements,
  replaceableRejectedDocuments,
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
  const status = overrides.status ?? "DRAFT";
  return {
    can_edit: status === "DRAFT" || status === "CHANGES_REQUIRED",
    required_document_kinds: ["GOVERNMENT_ID"],
    offered_document_kinds: ["GOVERNMENT_ID", "ADDRESS_PROOF"],
    employer: null,
    consents_complete: false,
    business_details_complete: false,
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
    documents: [document({ id: "doc-id", kind: "GOVERNMENT_ID" })],
    consents_complete: true,
    ...overrides,
  });
}

const completeSchedule: Schemas["PartnerSchedule"] = {
  rules: [
    {
      id: "rule-1",
      service_area_id: "area-1",
      weekday: 0,
      starts_at: "09:00:00",
      ends_at: "18:00:00",
      ends_next_day: false,
      is_active: true,
    },
  ],
  exceptions: [],
};

describe("requirements", () => {
  it("lists everything as outstanding for an empty draft", () => {
    const outstanding = outstandingRequirements(application());
    expect(outstanding.map((item) => item.code)).toEqual([
      "DISPLAY_NAME",
      "EXPERIENCE_YEARS",
      "SKILLS",
      "SERVICES",
      "SERVICE_AREAS",
      "WORKING_HOURS",
      "GOVERNMENT_ID",
      "CONSENTS",
    ]);
  });

  it("requires exactly the documents the server lists", () => {
    // A copy of the list here once demanded proof of address Django does not require.
    const both = application({ required_document_kinds: ["GOVERNMENT_ID", "ADDRESS_PROOF"] });
    const codes = outstandingRequirements(both).map((item) => item.code);
    expect(codes).toContain("ADDRESS_PROOF");
    expect(outstandingRequirements(application()).map((item) => item.code)).not.toContain(
      "ADDRESS_PROOF",
    );
  });

  it("counts the agreements done only when the server says every current one is accepted", () => {
    const stale = completeApplication({ consents_complete: false });
    expect(outstandingRequirements(stale, completeSchedule).map((item) => item.code)).toEqual([
      "CONSENTS",
    ]);
  });

  it("reports nothing outstanding once complete", () => {
    expect(outstandingRequirements(completeApplication(), completeSchedule)).toHaveLength(0);
  });

  it("requires working hours for each active service area", () => {
    expect(outstandingRequirements(completeApplication(), null).map((item) => item.code)).toEqual([
      "WORKING_HOURS",
    ]);
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
      ],
    });
    expect(outstandingRequirements(withPending, completeSchedule)).toHaveLength(0);
  });

  it("counts a rejected document as missing", () => {
    const withRejected = completeApplication({
      documents: [
        document({ kind: "GOVERNMENT_ID", status: "REJECTED", review_reason: "Blurred" }),
      ],
    });
    expect(outstandingRequirements(withRejected, completeSchedule).map((item) => item.code)).toEqual([
      "GOVERNMENT_ID",
    ]);
  });

  it("does not count a superseded document", () => {
    const superseded = completeApplication({
      documents: [
        document({ kind: "GOVERNMENT_ID", status: "SUPERSEDED" }),
      ],
    });
    expect(outstandingRequirements(superseded, completeSchedule).map((item) => item.code)).toEqual([
      "GOVERNMENT_ID",
    ]);
  });

  it("offers only the rejected documents the server lets the Partner replace", () => {
    const replaceable = replaceableRejectedDocuments(
      completeApplication({
        status: "UNDER_REVIEW",
        documents: [document({ status: "REJECTED", review_reason: "Photo is cut off", can_replace: true })],
      }),
    );
    expect(replaceable.map((item) => item.review_reason)).toEqual(["Photo is cut off"]);

    const declined = replaceableRejectedDocuments(
      completeApplication({
        status: "DECLINED",
        documents: [document({ status: "REJECTED", review_reason: "Expired", can_replace: false })],
      }),
    );
    expect(declined).toEqual([]);
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
    expect(canSubmit(completeApplication(), completeSchedule)).toBe(true);
  });

  it("refuses a draft without working hours", () => {
    expect(canSubmit(completeApplication())).toBe(false);
  });

  it("refuses an incomplete draft", () => {
    expect(canSubmit(application())).toBe(false);
  });

  it("refuses to resubmit something already under review", () => {
    expect(canSubmit(completeApplication({ status: "UNDER_REVIEW" }), completeSchedule)).toBe(false);
  });

  it("permits resubmitting after changes were requested", () => {
    expect(canSubmit(completeApplication({ status: "CHANGES_REQUIRED" }), completeSchedule)).toBe(true);
  });
});

describe("a stay host", () => {
  it("is never asked for trades, areas or years of experience", () => {
    const codes = requirements(application({ track: "STAY_HOST" })).map((item) => item.code);

    expect(codes).not.toContain("SKILLS");
    expect(codes).not.toContain("SERVICES");
    expect(codes).not.toContain("SERVICE_AREAS");
    expect(codes).not.toContain("WORKING_HOURS");
    expect(codes).not.toContain("EXPERIENCE_YEARS");
    expect(codes).toContain("DISPLAY_NAME");
    expect(codes).toContain("CONSENTS");
    expect(codes).toContain("GOVERNMENT_ID");
  });

  it("asks a rental owner for the same short set", () => {
    const stay = requirements(application({ track: "STAY_HOST" })).map((item) => item.code);
    const rental = requirements(application({ track: "RENTAL_OWNER" })).map((item) => item.code);
    expect(rental).toEqual(stay);
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

    expect(items.map((item) => item.code).slice(0, 2)).toEqual(["HIRING_AS", "GOVERNMENT_ID"]);
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

describe("an employer's documents", () => {
  it("require exactly what the server lists for their type", () => {
    const individual = application({
      track: "EMPLOYER",
      employer: employer("INDIVIDUAL", []),
      required_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    });
    const codes = outstandingRequirements(individual).map((item) => item.code);

    expect(codes).toContain("GOVERNMENT_ID");
    expect(codes).toContain("SELFIE");
    expect(codes).not.toContain("BUSINESS_PROOF");
  });

  it("need the owner's letter only when the server asks for it", () => {
    const business = application({
      track: "EMPLOYER",
      employer: employer("BUSINESS", []),
      required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF", "AUTHORIZATION_LETTER"],
    });

    expect(outstandingRequirements(business).map((item) => item.code)).toEqual(
      expect.arrayContaining(["BUSINESS_PROOF", "AUTHORIZATION_LETTER"]),
    );
  });

  it("are met by an uploaded selfie", () => {
    const done = application({
      track: "EMPLOYER",
      employer: employer("INDIVIDUAL", []),
      required_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
      documents: [
        document({ id: "doc-id", kind: "GOVERNMENT_ID" }),
        document({ id: "doc-selfie", kind: "SELFIE" }),
      ],
    });

    expect(outstandingRequirements(done).map((item) => item.code)).toEqual(["CONSENTS"]);
  });
});

describe("the document slots offered", () => {
  it("are the server's list", () => {
    expect(
      offeredDocumentKinds(application({ offered_document_kinds: ["GOVERNMENT_ID", "SELFIE"] })),
    ).toEqual(["GOVERNMENT_ID", "SELFIE"]);
  });

  it("fall back to the two every other track has always offered before the first save", () => {
    expect(offeredDocumentKinds(null)).toEqual(["GOVERNMENT_ID", "ADDRESS_PROOF"]);
  });
});
