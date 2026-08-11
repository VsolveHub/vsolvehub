import { describe, expect, it } from "vitest";

import type { BusinessProfileInput } from "../contract-pending/types";
import {
  certainRefusals,
  expectedFor,
  fieldsFor,
  missingExpected,
  normalizeForType,
} from "./business-type";

/**
 * Business type: which fields each carries, and what the database will refuse.
 *
 * Verifies `M2-FE-103`.
 */

function profile(overrides: Partial<BusinessProfileInput> = {}): BusinessProfileInput {
  return {
    business_type: "INDIVIDUAL",
    legal_name: "",
    registration_number: "",
    gst_registered: false,
    gstin: "",
    years_in_operation: 0,
    ...overrides,
  };
}

describe("field shapes", () => {
  it("does not offer a registration number to an individual", () => {
    // `partners_individual_has_no_registration_number` refuses it outright, so
    // the field is never rendered — a box you can fill in and then be told off
    // for is worse than one that was never offered.
    expect(fieldsFor("INDIVIDUAL")).not.toContain("registration_number");
  });

  it("offers one to both business types", () => {
    expect(fieldsFor("WORKFORCE_AGENCY")).toContain("registration_number");
    expect(fieldsFor("PROJECT_VENDOR")).toContain("registration_number");
  });

  it("expects nothing extra from an individual", () => {
    // Someone working alone should not be pushed through a company form.
    expect(expectedFor("INDIVIDUAL")).toEqual([]);
  });
});

describe("refusals the database is certain to make", () => {
  it("catches a registration number on an individual", () => {
    const problems = certainRefusals(profile({ registration_number: "AP/2019/0042" }));
    expect(problems[0]?.field).toBe("registration_number");
  });

  it("catches a GSTIN without the flag", () => {
    const problems = certainRefusals(profile({ gstin: "37ABCDE1234F1Z5" }));
    expect(problems[0]?.field).toBe("gstin");
  });

  it("allows a GSTIN once the flag is set", () => {
    expect(
      certainRefusals(profile({ gst_registered: true, gstin: "37ABCDE1234F1Z5" })),
    ).toEqual([]);
  });

  it("does not refuse an agency with nothing filled in", () => {
    // Guidance, not a gate. A client rule stricter than the server's traps
    // people who have actually finished — and someone who cannot get past a
    // business-type screen has no account at all.
    expect(certainRefusals(profile({ business_type: "WORKFORCE_AGENCY" }))).toEqual([]);
  });
});

describe("guidance", () => {
  it("names the legal name an agency has not given", () => {
    expect(missingExpected(profile({ business_type: "WORKFORCE_AGENCY" }))).toEqual([
      "legal_name",
    ]);
  });

  it("stops asking once it is given", () => {
    expect(
      missingExpected(
        profile({ business_type: "WORKFORCE_AGENCY", legal_name: "Sri Sai Services" }),
      ),
    ).toEqual([]);
  });
});

describe("switching type", () => {
  it("drops a registration number when switching to individual", () => {
    // The exact bug this prevents: fill in an agency number, change your mind,
    // pick "just me", save — and the database refuses a change the Partner
    // believes they made correctly.
    const switched = normalizeForType(
      profile({
        business_type: "INDIVIDUAL",
        legal_name: "Sri Sai Services",
        registration_number: "AP/2019/0042",
      }),
    );

    expect(switched.registration_number).toBe("");
    expect(switched.legal_name).toBe("");
    expect(certainRefusals(switched)).toEqual([]);
  });

  it("clears a GSTIN when the flag is turned off", () => {
    const cleared = normalizeForType(
      profile({ gst_registered: false, gstin: "37ABCDE1234F1Z5" }),
    );
    expect(cleared.gstin).toBe("");
  });

  it("keeps an agency's fields when staying an agency", () => {
    const kept = normalizeForType(
      profile({
        business_type: "WORKFORCE_AGENCY",
        legal_name: "Sri Sai Services",
        registration_number: "AP/2019/0042",
      }),
    );

    expect(kept.legal_name).toBe("Sri Sai Services");
    expect(kept.registration_number).toBe("AP/2019/0042");
  });
});
