import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  EMPTY_DRAFT,
  changedFields,
  draftFromApplication,
  isDirty,
  outstandingConsents,
  toggle,
  type ApplicationDraft,
} from "./draft";

/**
 * The rules here exist because `PATCH /partner/application/` became a genuinely
 * partial update in contract 1.4.0. Sending more than the step edited is now a
 * defect, not a workaround: it silently reverts whatever another step changed.
 */

const application = {
  id: "11111111-1111-4111-8111-111111111111",
  partner_id: "22222222-2222-4222-8222-222222222222",
  status: "DRAFT",
  version: 3,
  display_name: "Ravi K",
  biography: "Twelve years on ceiling fans.",
  experience_years: 12,
  skill_codes: ["electrical"],
  service_variant_ids: ["33333333-3333-4333-8333-333333333333"],
  service_area_ids: ["44444444-4444-4444-8444-444444444444"],
  change_request_message: "",
  submitted_at: null,
  reviewed_at: null,
  consents: [
    {
      id: "c1",
      purpose: "partner_terms",
      document_version: "2026-07-01",
      accepted_at: "2026-07-02T10:00:00Z",
      withdrawn_at: null,
    },
  ],
  documents: [],
  transitions: [],
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-02T10:00:00Z",
} as unknown as Schemas["PartnerApplication"];

const consentDocument = (
  overrides: Partial<Schemas["PartnerConsentDocument"]> = {},
): Schemas["PartnerConsentDocument"] =>
  ({
    purpose: "partner_terms",
    title: "Partner terms",
    document_version: "2026-07-01",
    document_url: "https://vsolvehub.com/legal/partner-terms/2026-07-01",
    is_required_for_submission: true,
    published_at: "2026-07-01T00:00:00Z",
    ...overrides,
  }) as Schemas["PartnerConsentDocument"];

describe("reading the server record", () => {
  it("carries every editable field", () => {
    const draft = draftFromApplication(application);

    expect(draft.displayName).toBe("Ravi K");
    expect(draft.experienceYears).toBe(12);
    expect(draft.skillCodes).toEqual(["electrical"]);
    expect(draft.consents).toEqual([
      { purpose: "partner_terms", documentVersion: "2026-07-01" },
    ]);
  });

  it("does not resend a consent the Partner withdrew", () => {
    const withdrawn = {
      ...application,
      consents: [{ ...application.consents[0], withdrawn_at: "2026-07-20T10:00:00Z" }],
    } as unknown as Schemas["PartnerApplication"];

    expect(draftFromApplication(withdrawn).consents).toEqual([]);
  });

  it("treats a Partner with no application as an empty draft, not an error", () => {
    expect(draftFromApplication(null)).toEqual(EMPTY_DRAFT);
  });
});

describe("what a step sends", () => {
  it("sends only the field that changed", () => {
    // The behaviour the whole model exists for. Sending the whole record would
    // overwrite another step's section with whatever this form is holding.
    const draft = { ...draftFromApplication(application), displayName: "Ravi Kumar" };

    expect(changedFields(draft, application)).toEqual({ display_name: "Ravi Kumar" });
  });

  it("sends nothing when nothing changed", () => {
    expect(changedFields(draftFromApplication(application), application)).toEqual({});
    expect(isDirty(draftFromApplication(application), application)).toBe(false);
  });

  it("ignores a reordered selection, because the server stores a set", () => {
    // Sending it would burn an optimistic-concurrency version for no change and
    // conflict with anyone editing another step at the same time.
    const draft = {
      ...draftFromApplication(application),
      skillCodes: ["electrical"],
      serviceVariantIds: ["33333333-3333-4333-8333-333333333333"],
    };

    expect(changedFields(draft, application)).toEqual({});
  });

  it("sends a genuinely changed selection in full", () => {
    const draft = { ...draftFromApplication(application), skillCodes: ["electrical", "plumbing"] };

    expect(changedFields(draft, application)).toEqual({
      skill_codes: ["electrical", "plumbing"],
    });
  });

  it("lets a first-time applicant save a name alone", () => {
    // Under the old full-replace contract this was impossible: Django demanded
    // skills, services and areas the applicant could not yet see.
    const draft: ApplicationDraft = { ...EMPTY_DRAFT, displayName: "Ravi K" };

    expect(changedFields(draft, null)).toEqual({ display_name: "Ravi K" });
    expect(isDirty(draft, null)).toBe(true);
  });

  it("trims free text and ignores a whitespace-only edit", () => {
    const draft = { ...draftFromApplication(application), displayName: "  Ravi K  " };
    expect(changedFields(draft, application)).toEqual({});
  });

  it("sends only consents not already on file", () => {
    // Receipts are append-only. Resending an acceptance would record a second
    // one for a decision the Partner made once.
    const draft: ApplicationDraft = {
      ...draftFromApplication(application),
      consents: [
        { purpose: "partner_terms", documentVersion: "2026-07-01" },
        { purpose: "privacy_notice", documentVersion: "2026-07-01" },
      ],
    };

    expect(changedFields(draft, application)).toEqual({
      consents: [{ purpose: "privacy_notice", document_version: "2026-07-01" }],
    });
  });

  it("treats a republished version as a new acceptance", () => {
    const draft: ApplicationDraft = {
      ...draftFromApplication(application),
      consents: [{ purpose: "partner_terms", documentVersion: "2026-08-01" }],
    };

    expect(changedFields(draft, application)).toEqual({
      consents: [{ purpose: "partner_terms", document_version: "2026-08-01" }],
    });
  });
});

describe("outstanding consents", () => {
  it("names a required document that has not been accepted", () => {
    const outstanding = outstandingConsents(draftFromApplication(application), [
      consentDocument(),
      consentDocument({ purpose: "privacy_notice", title: "Privacy notice" }),
    ]);

    expect(outstanding.map((document) => document.purpose)).toEqual(["privacy_notice"]);
  });

  it("re-prompts when the published version moves on", () => {
    // A version bump has to re-ask every Partner; that is the behaviour a
    // hardcoded version string could never provide.
    const outstanding = outstandingConsents(draftFromApplication(application), [
      consentDocument({ document_version: "2026-08-01" }),
    ]);

    expect(outstanding).toHaveLength(1);
  });

  it("ignores documents Django does not require for submission", () => {
    const outstanding = outstandingConsents(EMPTY_DRAFT, [
      consentDocument({ purpose: "marketing", is_required_for_submission: false }),
    ]);

    expect(outstanding).toEqual([]);
  });
});

describe("selection", () => {
  it("adds and removes without producing the duplicates Django rejects", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});
