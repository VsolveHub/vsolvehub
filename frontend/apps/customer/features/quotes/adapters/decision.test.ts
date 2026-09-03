import { describe, expect, it } from "vitest";

import {
  canAskAboutPrice,
  discountPreview,
  priceSpread,
  sharedScopeLines,
  stageTotalMismatchPaise,
  superlativeFor,
  type QuoteCardView,
  type QuoteStageView,
} from ".";

/**
 * The derivations that turn a document into a decision.
 *
 * The mismatch case is drawn from a real estimate: a ₹2,20,651.31 total whose
 * two stages came to ₹2,15,564, rendered side by side without comment.
 */

function stage(totalDuePaise: number): QuoteStageView {
  return { title: "Stage", deliverable: null, amountLabel: "—", totalDuePaise, endsOn: null };
}

function card(overrides: Partial<QuoteCardView> = {}): QuoteCardView {
  return {
    proposalId: "p1",
    vendorName: "A Vendor",
    vendorType: null,
    isVerified: false,
    trust: {
      ratingAverage: null,
      ratingCount: 0,
      jobsCompleted: 0,
      experienceYears: 0,
      activeSinceLabel: null,
    },
    status: "SUBMITTED",
    isSelectable: true,
    isExpired: false,
    isOutOfBudget: false,
    hasAskedForRevalidation: false,
    revision: 1,
    totalLabel: "₹1,00,000",
    taxLabel: "₹0",
    taxBasis: "INCLUSIVE",
    payableLabel: "₹1,00,000",
    payablePaise: 10_000_000,
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
    submittedAt: "2026-09-01T00:00:00Z",
    siteVisitId: null,
    visitCompletedAt: null,
    questions: [],
    revisionRequest: null,
    ...overrides,
  } as QuoteCardView;
}

describe("stageTotalMismatchPaise", () => {
  // The figure to compare is `total_due_paise` — what the Customer actually owes for
  // that stage — not `amount_paise`, which is the vendor's work amount before the
  // platform fee. Comparing the second against the estimate total subtracts the fee on
  // every estimate ever written and reports it as a vendor arithmetic error.
  it("says nothing about a real estimate, whose stages carry the fee", () => {
    // Live data: a ₹1,22,883.18 estimate, two stages, ₹2,401 platform fee + ₹432.18 GST.
    expect(
      stageTotalMismatchPaise(
        card({
          payablePaise: 12_288_318,
          stages: [stage(6_144_159), stage(6_144_159)],
        }),
      ),
    ).toBeNull();
  });

  it("still catches a schedule that genuinely does not add up", () => {
    const drift = stageTotalMismatchPaise(
      card({
        payablePaise: 12_288_318,
        stages: [stage(6_144_159), stage(5_000_000)],
      }),
    );

    expect(drift).toBe(-1_144_159);
  });

  it("says nothing when the schedule adds up", () => {
    expect(
      stageTotalMismatchPaise(
        card({ payablePaise: 10_000_000, stages: [stage(5_000_000), stage(5_000_000)] }),
      ),
    ).toBeNull();
  });

  it("tolerates a rupee of rounding rather than crying wolf", () => {
    expect(
      stageTotalMismatchPaise(
        card({ payablePaise: 10_000_000, stages: [stage(5_000_000), stage(4_999_950)] }),
      ),
    ).toBeNull();
  });

  it("has nothing to check when the estimate carries no schedule", () => {
    expect(stageTotalMismatchPaise(card({ stages: [] }))).toBeNull();
  });
});

describe("superlativeFor", () => {
  const cheap = card({ proposalId: "cheap", payablePaise: 9_000_000 });
  const dear = card({ proposalId: "dear", payablePaise: 12_000_000 });

  it("awards cheapest on an outright win", () => {
    expect(superlativeFor(cheap, [cheap, dear])?.kind).toBe("CHEAPEST");
  });

  it("awards nothing on a tie", () => {
    const twin = card({ proposalId: "twin", payablePaise: 9_000_000 });
    expect(superlativeFor(cheap, [cheap, twin])).toBeNull();
  });

  it("awards nothing when there is nothing to compare against", () => {
    expect(superlativeFor(cheap, [cheap])).toBeNull();
  });

  it("reads months out of free-text warranty terms", () => {
    const long = card({ proposalId: "long", payablePaise: 12_000_000, warrantyTerms: "2 years on workmanship" });
    const short = card({ proposalId: "short", payablePaise: 9_000_000, warrantyTerms: "12 months" });
    expect(superlativeFor(long, [long, short])?.kind).toBe("LONGEST_WARRANTY");
  });
});

describe("priceSpread", () => {
  it("states the range and the gap as a percent of the cheapest", () => {
    const spread = priceSpread(
      [card({ proposalId: "a", payablePaise: 19_840_000 }), card({ proposalId: "b", payablePaise: 26_100_000 })],
      true,
    );
    expect(spread?.spreadPercent).toBe(32);
  });

  it("refuses to rank totals stated on different tax bases", () => {
    expect(
      priceSpread(
        [card({ proposalId: "a", payablePaise: 100 }), card({ proposalId: "b", payablePaise: 200 })],
        false,
      ),
    ).toBeNull();
  });

  it("has no range to state on a single estimate", () => {
    expect(priceSpread([card()], true)).toBeNull();
  });
});

describe("discountPreview", () => {
  it("turns basis points into the rupees a person decides on", () => {
    const preview = discountPreview(22_065_131, 500);
    expect(preview.savingPaise).toBe(1_103_257);
  });

  it("stays on integer paise", () => {
    expect(Number.isInteger(discountPreview(33_333_333, 333).savingPaise)).toBe(true);
  });
});

describe("canAskAboutPrice", () => {
  it("offers the ask on a live vendor-priced estimate", () => {
    expect(canAskAboutPrice(card())).toBe(true);
  });

  it("withholds it on a rate-card quote, whose price is not the vendor's to move", () => {
    expect(canAskAboutPrice(card({ rateLabel: "₹900" }))).toBe(false);
  });

  it("withholds it while an ask is already open", () => {
    expect(
      canAskAboutPrice(
        card({
          revisionRequest: {
            id: "r1",
            status: "OPEN",
            isPriceAsk: true,
            reasonLabel: "Asked about the price",
            excludedItems: [],
            note: null,
            declineNote: null,
            requestedDiscountPercent: 5,
            counteredDiscountPercent: null,
            createdAt: "2026-09-01T00:00:00Z",
          },
        }),
      ),
    ).toBe(false);
  });

  it("withholds it on an expired estimate", () => {
    expect(canAskAboutPrice(card({ isExpired: true }))).toBe(false);
  });
});

describe("sharedScopeLines", () => {
  it("names only what every estimate includes", () => {
    const a = card({ proposalId: "a", inclusions: ["Primer coat", "Ceiling"] });
    const b = card({ proposalId: "b", inclusions: ["primer coat", "Enamel"] });
    expect(sharedScopeLines([a, b])).toEqual(["Primer coat"]);
  });

  it("has nothing to share on a single estimate", () => {
    expect(sharedScopeLines([card({ inclusions: ["Primer"] })])).toEqual([]);
  });
});
