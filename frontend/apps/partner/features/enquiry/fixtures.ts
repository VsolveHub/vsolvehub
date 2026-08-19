import type { Schemas } from "@vsolve/api-client";

/**
 * Enquiry fixtures. **Imported by tests only.**
 *
 * The no-placeholder rule bans invented data in application code, not in the
 * tests that prove the application handles real data. `contact-boundary.test.ts`
 * asserts that no production module under `features/enquiry` imports this file,
 * so the rule is enforced rather than remembered.
 *
 * Shapes are the generated ones, so a contract change that moves a field breaks
 * these fixtures at compile time instead of leaving the suite green against a
 * payload the server no longer sends.
 */

export function enquirySummary(
  overrides: Partial<Schemas["EnquirySummary"]> = {},
): Schemas["EnquirySummary"] {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    requirement_id: "22222222-2222-4222-8222-222222222222",
    category_slug: "housekeeping-staff",
    // Required since 1.26.0. The inbox titled rows by de-slugging until the
    // server started sending the name it should always have sent.
    service_name: "Housekeeping staff",
    archetype: "A3_TIME_BLOCK",
    status: "INVITED",
    wave: 1,
    requested_start: "2026-08-20T03:30:00Z",
    service_by: "2026-08-25",
    language: "en-IN",
    responds_by: "2026-08-14T09:00:00Z",
    created_at: "2026-08-12T06:00:00Z",
    ...overrides,
  };
}

export function enquiryDetail(
  overrides: Partial<Schemas["EnquiryDetail"]> = {},
): Schemas["EnquiryDetail"] {
  return {
    ...enquirySummary(),
    service_name: "Housekeeping staff",
    answers: { worker_count: 6, duration_days: 4, site_access: "Service lift after 8am" },
    additional_details: "Two floors, deep clean before a handover.",
    budget_min_paise: null,
    budget_max_paise: 4_000_000,
    // Blank is the ordinary state: no vendor has quoted yet, so no basis is
    // forced. A value here means somebody else already fixed it.
    required_tax_basis: "",
    decline_reason_code: "",
    proposals: [],
    questions: [],
    site_visits: [],
    server_now: "2026-08-13T06:00:00Z",
    ...overrides,
  };
}

export function question(
  overrides: Partial<Schemas["RequirementQuestion"]> = {},
): Schemas["RequirementQuestion"] {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    invitation: "11111111-1111-4111-8111-111111111111",
    // Required since 1.26.0, when the Customer gained a question route of their
    // own. Who asked decides who may answer, so it is never inferable.
    asked_by_role: "VENDOR",
    question: "Is scaffolding already up?",
    answer: "",
    asked_at: "2026-08-12T07:00:00Z",
    answered_at: null,
    ...overrides,
  };
}

export function siteVisit(overrides: Partial<Schemas["SiteVisit"]> = {}): Schemas["SiteVisit"] {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    status: "REQUESTED",
    // The ad-hoc vendor-priced visit, not a plan slot. `planVisit` below is the
    // A5 shape; the two read differently enough that one fixture for both would
    // hide the field that decides which.
    is_plan_visit: false,
    // Required since 1.26.0. A visit time without its zone is a time nobody
    // can act on: the vendor travels in the area's zone, not the browser's.
    timezone: "Asia/Kolkata",
    // Required since 1.39.0, and null is the honest default for a fixture whose
    // base state is `REQUESTED`: the server discloses the vendor from `SCHEDULED`
    // onward, so a visit nobody has confirmed names nobody. A fixture that
    // carried an identity here would let a test assert a reveal the real read
    // would refuse.
    vendor: null,
    fee_paise: 50_000,
    adjusts_against_final_price: true,
    scheduled_for: null,
    duration_minutes: null,
    arrival_confirmed_at: null,
    arrival_method: "NON_OTP_FALLBACK",
    completed_at: null,
    estimate_due_at: null,
    cancellation_reason_code: "",
    ...overrides,
  };
}

/** A confirmed A5 plan visit: paid out of the visit plan, opens an estimate window. */
export function planVisit(overrides: Partial<Schemas["SiteVisit"]> = {}): Schemas["SiteVisit"] {
  return siteVisit({
    id: "66666666-6666-4666-8666-666666666666",
    status: "SCHEDULED",
    is_plan_visit: true,
    timezone: "Asia/Kolkata",
    adjusts_against_final_price: false,
    scheduled_for: "2026-08-18T04:30:00Z",
    duration_minutes: 45,
    ...overrides,
  });
}

export function proposal(overrides: Partial<Schemas["Proposal"]> = {}): Schemas["Proposal"] {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    requirement: "22222222-2222-4222-8222-222222222222",
    invitation: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    status: "SUBMITTED",
    usability: "USABLE",
    // `NOT_CHOSEN` is the enum's zero-information member; it is only meaningful
    // once `status` is REJECTED, which this fixture is not.
    rejection_reason: "NOT_CHOSEN",
    site_visit: null,
    revalidation_requested_at: null,
    rate_paise_per_worker_day: 90_000,
    minimum_days: 4,
    worker_count: 6,
    total_paise: 2_160_000,
    tax_paise: 0,
    tax_basis: "INCLUSIVE",
    commission_treatment: "",
    // Required since 1.26.0. Materials are their own row type, not a stage —
    // a stage carries an evidence cycle and a bag of cement does not.
    material_lines: [],
    inclusions: ["Own tools"],
    exclusions: [],
    stages: [],
    warranty_terms: "",
    valid_until: null,
    vendor_confirmed_at: "2026-08-12T08:00:00Z",
    submitted_at: "2026-08-12T08:00:00Z",
    ...overrides,
  };
}
