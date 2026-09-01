import { describe, expect, it } from "vitest";

import {
  scopeDifferenceRows,
  scopeGaps,
  unansweredVendorQuestions,
  validityDaysLeft,
  type QuoteCardView,
} from "./index";

function card(overrides: Partial<QuoteCardView> = {}): QuoteCardView {
  return {
    proposalId: "p1",
    vendorName: "Ravi Interiors",
    vendorType: null,
    isVerified: true,
    trust: { ratingAverage: null, ratingCount: 0, jobsCompleted: 0, experienceYears: 0, activeSinceLabel: null },
    status: "SUBMITTED",
    isSelectable: true,
    isExpired: false,
    isOutOfBudget: false,
    hasAskedForRevalidation: false,
    revision: 1,
    totalLabel: "₹1,84,000",
    taxLabel: "₹28,000",
    taxBasis: "INCLUSIVE",
    payableLabel: "₹1,84,000",
    payablePaise: 18_400_000,
    rateLabel: null,
    minimumDays: null,
    workerCount: null,
    estimateType: "ITEM_WISE",
    itemLines: [],
    labourLines: [],
    otherCharges: [],
    stages: [],
    materials: [],
    materialList: [],
    includedSupplyList: [],
    materialFulfilmentMode: "CUSTOMER_PROCURES",
    brandTierLabel: null,
    inclusions: [],
    exclusions: [],
    scopeSummary: null,
    warrantyTerms: null,
    validUntil: null,
    validityDaysLeft: null,
    submittedAt: "2026-08-20T10:00:00.000Z",
    siteVisitId: "v1",
    visitCompletedAt: null,
    questions: [],
    revisionRequest: null,
    ...overrides,
  };
}

describe("scope differences", () => {
  const ravi = card({ proposalId: "ravi", inclusions: ["Demolition", "Waterproofing", "Plumbing rework", "False ceiling"] });
  const sai = card({ proposalId: "sai", inclusions: ["demolition ", "Waterproofing"] });

  it("names only what the others include and this one does not — a comparison, never a judgement", () => {
    expect(scopeGaps(sai, [ravi, sai])).toEqual(["Plumbing rework", "False ceiling"]);
    expect(scopeGaps(ravi, [ravi, sai])).toEqual([]);
  });

  it("matches on the words, ignoring case and spacing, so a false gap is not invented", () => {
    // "demolition " and "Demolition" are one line.
    expect(scopeGaps(sai, [ravi, sai])).not.toContain("Demolition");
  });

  it("builds a row only for lines the estimates disagree on", () => {
    const rows = scopeDifferenceRows([ravi, sai]);
    expect(rows.map((row) => row.line)).toEqual(["Plumbing rework", "False ceiling"]);
    expect(rows[0]?.included).toEqual([true, false]);
    expect(scopeDifferenceRows([ravi])).toEqual([]);
  });
});

describe("validity", () => {
  it("counts whole days on the server's clock and floors at zero", () => {
    expect(validityDaysLeft("2026-09-20T18:29:59.000Z", "2026-09-14T10:00:00.000Z")).toBe(6);
    expect(validityDaysLeft("2026-09-14T18:00:00.000Z", "2026-09-14T10:00:00.000Z")).toBe(0);
    expect(validityDaysLeft("2026-09-10T00:00:00.000Z", "2026-09-14T10:00:00.000Z")).toBe(0);
    expect(validityDaysLeft(null, "2026-09-14T10:00:00.000Z")).toBeNull();
  });
});

describe("the professional's questions", () => {
  it("surfaces only the vendor's unanswered ones", () => {
    const waiting = unansweredVendorQuestions([
      card({
        questions: [
          { id: "a", askedByRole: "VENDOR", question: "Old tiling off?", answer: null, askedAt: "2026-08-22T08:00:00Z", answeredAt: null },
          { id: "b", askedByRole: "VENDOR", question: "Which floor?", answer: "Third", askedAt: "2026-08-22T08:00:00Z", answeredAt: "2026-08-22T09:00:00Z" },
          { id: "c", askedByRole: "CUSTOMER", question: "Do you do weekends?", answer: null, askedAt: "2026-08-22T08:00:00Z", answeredAt: null },
        ],
      }),
    ]);
    expect(waiting.map((entry) => entry.question.id)).toEqual(["a"]);
  });
});
