// Ported from frontend/apps/partner/features/proposal/model/tap-estimate.test.ts

import { toOnsiteRequest } from "./onsite-draft";
import {
  EMPTY_TAP_ESTIMATE,
  setMaterialAmount,
  setWorkAmount,
  setWorkDays,
  tapBlockedReason,
  tapSubtotal,
  tapTotal,
  toOnsiteDraft,
  toggleExclusion,
  toggleMaterial,
  toggleWork,
  type TapEstimate,
} from "./tap-estimate";

/**
 * The tap flow's only real risk is the conversion.
 *
 * Everything a vendor sees is taps and steppers, and everything the server sees
 * is the request the typed composer already produced. What sits between them is
 * this module, so this is where a wrong stage title, a lost amount or a dropped
 * unit would be introduced — and none of those would fail a typecheck.
 */

const priced = (): TapEstimate => {
  // Annotated, so `let` widens to the interface rather than narrowing to the
  // literal — otherwise `startsOn: string` cannot take the nullable field back.
  let estimate: TapEstimate = { ...EMPTY_TAP_ESTIMATE, startsOn: "2026-09-01" };
  estimate = toggleWork(estimate, "strip_out");
  estimate = setWorkAmount(estimate, "strip_out", 1_500_000);
  estimate = setWorkDays(estimate, "strip_out", 4);
  estimate = toggleMaterial(estimate, "cement");
  estimate = setMaterialAmount(estimate, "cement", 1_200_000);
  return { ...estimate, taxBasis: "EXCLUSIVE" as const, taxPaise: 486_000 };
};

describe("what a tapped estimate becomes", () => {
  it("puts the preset's own words on the wire", () => {
    const draft = toOnsiteDraft(priced());

    // The vendor typed neither of these. Both must still be there, because
    // `deliverable` is what a dispute reads and what the customer was shown.
    expect(draft.stages[0]?.title).toBe("Strip out");
    expect(draft.stages[0]?.deliverable).not.toBe("");
  });

  it("carries the material's unit, which nobody typed either", () => {
    const draft = toOnsiteDraft(priced());

    expect(draft.materials[0]?.description).toBe("Cement");
    expect(draft.materials[0]?.unit).toBe("bags");
  });

  it("turns a tapped warranty into the sentence the customer reads", () => {
    const draft = toOnsiteDraft({ ...priced(), warrantyCode: "12m" });

    expect(draft.warrantyTerms).toMatch(/twelve months/i);
  });

  it("turns tapped exclusions into whole sentences", () => {
    const draft = toOnsiteDraft(toggleExclusion(priced(), "permits"));

    expect(draft.exclusions).toHaveLength(1);
    // A keyword would reach the customer as "Permits" with no verb. The list
    // stores sentences precisely so it reads as a statement.
    expect(draft.exclusions[0]).toMatch(/not included/i);
  });

  it("produces a request the existing builder accepts unchanged", () => {
    // The whole design rests on this: one wire path, and the tap flow feeds it.
    const body = toOnsiteRequest({
      invitationId: "11111111-1111-4111-8111-111111111111",
      siteVisitId: "22222222-2222-4222-8222-222222222222",
      draft: toOnsiteDraft(priced()),
    });

    // `total_paise` came off this request at 1.44.0 — Django computes it from
    // the lines. What the vendor sends is the work itself.
    expect("total_paise" in body).toBe(false);
    expect(body.stages).toHaveLength(1);
    expect(body.material_lines).toHaveLength(1);
  });

  it("never sends a validity date, because it never asks for one", () => {
    expect(toOnsiteDraft(priced()).validUntil).toBeNull();
  });

  it("drops tax when the price already includes it", () => {
    const draft = toOnsiteDraft({ ...priced(), taxBasis: "INCLUSIVE" });

    expect(draft.taxPaise).toBe(0);
  });
});

describe("the running total", () => {
  it("is null while anything tapped is unpriced", () => {
    // Not zero. A zero is a number a vendor might send; the absence of one is
    // the truth, and the screen renders it as a dash.
    const estimate = toggleWork(EMPTY_TAP_ESTIMATE, "strip_out");

    expect(tapSubtotal(estimate)).toBeNull();
    expect(tapTotal(estimate)).toBeNull();
  });

  it("adds tax only when tax is on top", () => {
    expect(tapTotal(priced())).toBe(3_186_000);
    expect(tapTotal({ ...priced(), taxBasis: "INCLUSIVE" })).toBe(2_700_000);
  });
});

describe("what stops a send", () => {
  it("refuses an estimate with no work at all", () => {
    expect(tapBlockedReason(EMPTY_TAP_ESTIMATE)).toMatch(/at least one/i);
  });

  it("refuses one where something tapped has no price", () => {
    const estimate = toggleWork(priced(), "paint");

    expect(tapBlockedReason(estimate)).toMatch(/price/i);
  });

  it("refuses one with no answer on tax", () => {
    expect(tapBlockedReason({ ...priced(), taxBasis: null })).toMatch(/tax/i);
  });

  it("allows a complete one", () => {
    expect(tapBlockedReason(priced())).toBeNull();
  });
});

describe("un-tapping", () => {
  it("keeps the price, so re-tapping does not lose it", () => {
    // On a phone on a site, losing an amount somebody entered once is losing it
    // for good — they will not notice it went.
    const off = toggleWork(priced(), "strip_out");
    const on = toggleWork(off, "strip_out");

    expect(on.workEntries.strip_out?.amountPaise).toBe(1_500_000);
    expect(on.workEntries.strip_out?.days).toBe(4);
  });

  it("takes the row out of the estimate while it is off", () => {
    const off = toggleWork(priced(), "strip_out");

    expect(toOnsiteDraft(off).stages).toHaveLength(0);
  });
});
