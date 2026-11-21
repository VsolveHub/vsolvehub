// Ported from frontend/apps/partner/features/application/model/employer-form.test.ts
import type { Schemas } from "@vsolve/api-client";

import {
  businessDraft,
  businessPatch,
  businessProblems,
  canContinue,
  contactDraft,
  contactPatch,
  contactProblems,
  gstinProblem,
  hasEnteredDetails,
  individualDraft,
  individualPatch,
  individualProblems,
  isEmail,
  isPinCode,
  type BusinessDraft,
} from "./employer-form";

type Application = Schemas["PartnerApplication"];
type Employer = NonNullable<Application["employer"]>;
type Business = NonNullable<Employer["business"]>;

const VALID_GSTIN = "27AAPFU0939F1ZV";

function employer(overrides: Partial<Employer> = {}): Employer {
  return {
    hiring_as: "INDIVIDUAL",
    poster_role: "",
    id_document_type: "",
    email: "",
    area: "",
    city: "",
    pin_code: "",
    business: null,
    missing_fields: [],
    ...overrides,
  } as Employer;
}

function business(overrides: Partial<Business> = {}): Business {
  return {
    trade_name: "",
    legal_name: "",
    legal_structure: "",
    business_category: "",
    company_size: "",
    gst_registered: false,
    gstin: "",
    business_proof_type: "",
    address: "",
    area: "",
    city: "",
    state: "Telangana",
    pin_code: "",
    latitude: null,
    longitude: null,
    logo_url: "",
    website_url: "",
    ...overrides,
  } as Business;
}

/** A business draft with every required answer given. */
function completeDraft(overrides: Partial<BusinessDraft> = {}): BusinessDraft {
  return {
    tradeName: "",
    legalName: "Sri Sai Mobiles Pvt Ltd",
    structure: "COMPANY",
    category: "SHOP",
    size: "SIZE_1_10",
    gst: "no",
    gstin: "",
    proof: "SHOP_ESTABLISHMENT",
    address: "12 Main Road",
    area: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    pinCode: "500084",
    latitude: "17.469000",
    longitude: "78.358000",
    websiteUrl: "",
    ...overrides,
  };
}

describe("pin codes and emails", () => {
  it.each(["500084", "110001", "999999"])("accepts %s", (pin) => {
    expect(isPinCode(pin)).toBe(true);
  });

  it.each(["012345", "50008", "5000845", "50008a", ""])("refuses %j", (pin) => {
    expect(isPinCode(pin)).toBe(false);
  });

  it("checks the shape of an email", () => {
    expect(isEmail("priya@example.com")).toBe(true);
    expect(isEmail("priya@example")).toBe(false);
    expect(isEmail("priya example.com")).toBe(false);
  });
});

describe("an individual's details", () => {
  const complete = individualDraft(
    employer({ area: "Kondapur", city: "Hyderabad", pin_code: "500084", id_document_type: "PAN" }),
    "Priya Sharma",
  );

  it("can continue once everything required is given", () => {
    expect(canContinue(individualProblems(complete))).toBe(true);
  });

  it("is missing what is left blank, and the email is optional", () => {
    const empty = individualProblems(individualDraft(employer(), ""));

    expect([...empty.missing].sort()).toEqual(["area", "city", "displayName", "idType", "pinCode"]);
    expect(empty.missing.has("email" as never)).toBe(false);
  });

  it("refuses a bad pin code, a one-letter name and a bad email, but only once typed", () => {
    const problems = individualProblems({
      ...complete,
      pinCode: "12345",
      displayName: "P",
      email: "nope",
    });

    expect([...problems.invalid].sort()).toEqual(["displayName", "email", "pinCode"]);
    expect(canContinue(problems)).toBe(false);
  });

  it("sends trimmed values", () => {
    expect(individualPatch({ ...complete, displayName: "  Priya Sharma ", area: " Kondapur " })).toEqual({
      display_name: "Priya Sharma",
      email: "",
      pin_code: "500084",
      area: "Kondapur",
      city: "Hyderabad",
      id_document_type: "PAN",
    });
  });
});

describe("the person hiring for a business", () => {
  const complete = contactDraft(employer({ poster_role: "HR", id_document_type: "PAN" }), "Asha Rao");

  it("needs a name, a role and an ID type", () => {
    expect(canContinue(contactProblems(complete))).toBe(true);
    expect([...contactProblems(contactDraft(employer(), "")).missing].sort()).toEqual([
      "displayName",
      "idType",
      "role",
    ]);
  });

  it("sends the role and ID", () => {
    expect(contactPatch(complete)).toEqual({
      display_name: "Asha Rao",
      poster_role: "HR",
      email: "",
      id_document_type: "PAN",
    });
  });
});

describe("the business", () => {
  it("can continue when everything required is given", () => {
    expect(canContinue(businessProblems(completeDraft()))).toBe(true);
  });

  it("asks for everything, including whether they have GST, from a new business", () => {
    const problems = businessProblems(businessDraft(business()));

    expect([...problems.missing].sort()).toEqual([
      "address",
      "area",
      "category",
      "city",
      "gst",
      "latitude",
      "legalName",
      "pinCode",
      "proof",
      "size",
      "structure",
    ]);
  });

  it("needs the map pin", () => {
    const problems = businessProblems(completeDraft({ latitude: "", longitude: "" }));

    expect(problems.missing.has("latitude")).toBe(true);
    expect(canContinue(problems)).toBe(false);
  });

  it("treats a new business as having answered neither yes nor no", () => {
    expect(businessDraft(business()).gst).toBe("");
    expect(businessDraft(null).gst).toBe("");
  });

  it("shows yes for a saved GST registration, and no only once a proof is saved", () => {
    expect(businessDraft(business({ gst_registered: true, gstin: VALID_GSTIN })).gst).toBe("yes");
    expect(businessDraft(business({ business_proof_type: "UDYAM" })).gst).toBe("no");
    expect(businessDraft(business({ gst_registered: false })).gst).toBe("");
  });

  it("fixes the proof to the GST certificate when they have GST", () => {
    const draft = businessDraft(business({ gst_registered: true, gstin: VALID_GSTIN }));

    expect(draft.proof).toBe("GST_CERTIFICATE");
  });

  describe("with GST", () => {
    const withGst = completeDraft({ gst: "yes", gstin: VALID_GSTIN, proof: "" });

    it("needs a valid GSTIN and no separate proof choice", () => {
      expect(canContinue(businessProblems(withGst))).toBe(true);
      expect(businessProblems({ ...withGst, gstin: "" }).missing.has("gstin")).toBe(true);
    });

    it.each([
      ["27AAPFU0939F1ZW", "checksum"],
      ["27AAPFU0939F1", "format"],
      ["00AAPFU0939F1ZV", "state"],
      ["2711111111111ZV", "pan"],
    ] as const)("names what is wrong with %s", (gstin, problem) => {
      const draft = { ...withGst, gstin };

      expect(gstinProblem(draft)).toBe(problem);
      expect(businessProblems(draft).invalid.has("gstin")).toBe(true);
    });

    it("sends the normalised GSTIN and the GST certificate as the proof", () => {
      const patch = businessPatch({ ...withGst, gstin: " 27aapfu0939f1zv " }).business;

      expect(patch).toMatchObject({
        gst_registered: true,
        gstin: VALID_GSTIN,
        business_proof_type: "GST_CERTIFICATE",
      });
    });
  });

  describe("without GST", () => {
    it("needs a proof, and sends no GSTIN even if one was typed before", () => {
      expect(businessProblems(completeDraft({ proof: "" })).missing.has("proof")).toBe(true);

      const patch = businessPatch(completeDraft({ gstin: VALID_GSTIN })).business;
      expect(patch).toMatchObject({
        gst_registered: false,
        gstin: "",
        business_proof_type: "SHOP_ESTABLISHMENT",
      });
    });

    it("does not check a GSTIN that is not being sent", () => {
      expect(gstinProblem(completeDraft({ gstin: "garbage" }))).toBeNull();
    });
  });

  it("refuses a website that is not a web address, but the website is optional", () => {
    expect(businessProblems(completeDraft({ websiteUrl: "not a url" })).invalid.has("websiteUrl")).toBe(true);
    expect(canContinue(businessProblems(completeDraft({ websiteUrl: "https://sai.example" })))).toBe(true);
    expect(canContinue(businessProblems(completeDraft({ websiteUrl: "" })))).toBe(true);
  });

  it("sends both coordinates together, or neither", () => {
    expect(businessPatch(completeDraft()).business).toMatchObject({
      latitude: "17.469000",
      longitude: "78.358000",
    });
    expect(businessPatch(completeDraft({ latitude: "", longitude: "" })).business).toMatchObject({
      latitude: null,
      longitude: null,
    });
  });

  it("sends the trade name only as typed, so blank means use the legal name", () => {
    expect(businessPatch(completeDraft({ tradeName: "  Sai Mobiles " })).business?.trade_name).toBe(
      "Sai Mobiles",
    );
    expect(businessPatch(completeDraft()).business?.trade_name).toBe("");
  });
});

describe("whether switching type would clear something", () => {
  const app = (employerValue: Employer | null) => ({ employer: employerValue }) as Application;

  it("is no for an employer who has not chosen, or has typed nothing", () => {
    expect(hasEnteredDetails(app(null))).toBe(false);
    expect(hasEnteredDetails(app(employer({ hiring_as: "" as never })))).toBe(false);
    expect(hasEnteredDetails(app(employer()))).toBe(false);
  });

  it("is no for a business row that only exists because they chose business", () => {
    expect(hasEnteredDetails(app(employer({ hiring_as: "BUSINESS", business: business() })))).toBe(false);
  });

  it("is yes once an individual has typed their location", () => {
    expect(hasEnteredDetails(app(employer({ area: "Kondapur" })))).toBe(true);
  });

  it("is yes once a business has a name, an address or a logo", () => {
    for (const filled of [{ legal_name: "Sai" }, { address: "12 Main Road" }, { logo_url: "https://x/y.png" }]) {
      expect(
        hasEnteredDetails(app(employer({ hiring_as: "BUSINESS", business: business(filled) }))),
      ).toBe(true);
    }
  });
});
