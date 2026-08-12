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
    answers: { worker_count: 6, duration_days: 4, site_access: "Service lift after 8am" },
    additional_details: "Two floors, deep clean before a handover.",
    budget_min_paise: null,
    budget_max_paise: 4_000_000,
    decline_reason_code: "",
    questions: [],
    site_visits: [],
    ...overrides,
  };
}

export function question(
  overrides: Partial<Schemas["RequirementQuestion"]> = {},
): Schemas["RequirementQuestion"] {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    invitation: "11111111-1111-4111-8111-111111111111",
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
    fee_paise: 50_000,
    adjusts_against_final_price: true,
    scheduled_for: null,
    completed_at: null,
    ...overrides,
  };
}

export function proposal(overrides: Partial<Schemas["Proposal"]> = {}): Schemas["Proposal"] {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    requirement: "22222222-2222-4222-8222-222222222222",
    invitation: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    status: "SUBMITTED",
    usability: "USABLE",
    rate_paise_per_worker_day: 90_000,
    minimum_days: 4,
    worker_count: 6,
    total_paise: 2_160_000,
    tax_paise: 0,
    tax_basis: "INCLUSIVE",
    commission_treatment: "",
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
