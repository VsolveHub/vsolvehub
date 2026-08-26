import { describe, expect, it } from "vitest";

import {
  firstStageOf,
  savingsAgainstDearest,
  toComparisonRows,
  type QuoteCardView,
} from "./index";

/**
 * The comparison table's derived rows.
 *
 * The delta is the only arithmetic on this screen besides the tax
 * normalisation, so it gets the most attention: what it must not claim matters
 * more than what it does.
 */

function card(overrides: Partial<QuoteCardView> = {}): QuoteCardView {
  return {
    proposalId: "p1",
    vendorName: "Vaastu Interiors",
    vendorType: null,
    isVerified: true,
    status: "DELIVERED",
    isSelectable: true,
    isExpired: false,
    isOutOfBudget: false,
    hasAskedForRevalidation: false,
    revision: 1,
    totalLabel: "₹8,40,000",
    taxLabel: "18%",
    taxBasis: "INCLUSIVE",
    payableLabel: "₹8,40,000",
    payablePaise: 84_000_000,
    rateLabel: null,
    minimumDays: null,
    workerCount: null,
    estimateType: "LABOUR_WISE",
    itemLines: [],
    labourLines: [],
    otherCharges: [],
    stages: [],
    materials: [],
    inclusions: [],
    exclusions: [],
    warrantyTerms: null,
    validUntil: null,
    submittedAt: "2026-08-20T10:00:00.000Z",
    siteVisitId: "v1",
    visitCompletedAt: null,
    ...overrides,
  };
}

describe("savingsAgainstDearest", () => {
  it("prices the gap against the dearest estimate", () => {
    const savings = savingsAgainstDearest(
      [card({ payablePaise: 84_000_000 }), card({ payablePaise: 91_000_000 })],
      true,
    );

    expect(savings[0]).toBe("₹70,000");
    // The dearest is the baseline, so it has no gap of its own to state.
    expect(savings[1]).toBeNull();
  });

  it("claims nothing when the totals are not comparable", () => {
    // Two tax bases means the payable figures are not the same kind of number,
    // and a delta between them would be arithmetic on incomparable amounts.
    const savings = savingsAgainstDearest(
      [card({ payablePaise: 84_000_000 }), card({ payablePaise: 91_000_000 })],
      false,
    );

    expect(savings).toEqual([null, null]);
  });

  it("claims nothing on a tie", () => {
    const savings = savingsAgainstDearest(
      [card({ payablePaise: 84_000_000 }), card({ payablePaise: 84_000_000 })],
      true,
    );

    // "₹0 lower" is not a fact anybody needs, and marking one of two identical
    // prices as cheaper would be the screen picking a winner arbitrarily.
    expect(savings).toEqual([null, null]);
  });

  it("claims nothing against a single estimate", () => {
    expect(savingsAgainstDearest([card()], true)).toEqual([null]);
  });
});

describe("firstStageOf", () => {
  it("reads the first stage's own amount and title", () => {
    const view = firstStageOf(
      card({
        stages: [
          { title: "Design and demolition", deliverable: null, amountLabel: "₹1,40,000", endsOn: "2026-09-30" },
          { title: "Civil", deliverable: null, amountLabel: "₹2,00,000", endsOn: "2026-10-30" },
        ],
      }),
    );

    expect(view).toEqual({ amountLabel: "₹1,40,000", title: "Design and demolition" });
  });

  it("is absent on a quote with no stages", () => {
    // Every A3 quote, and any estimate whose vendor published none.
    expect(firstStageOf(card({ stages: [] }))).toBeNull();
  });
});

describe("toComparisonRows", () => {
  it("drops a row no estimate answered", () => {
    // A row of "Not stated" across every column is noise, not information.
    const labels = toComparisonRows([card({ stages: [] })]).map((row) => row.label);
    expect(labels).not.toContain("First stage to fund");
    expect(labels).not.toContain("Timeline");
  });

  it("dates the timeline from the last stage rather than computing a duration", () => {
    const rows = toComparisonRows([
      card({
        stages: [
          { title: "One", deliverable: null, amountLabel: "₹1", endsOn: "2026-09-30" },
          { title: "Two", deliverable: null, amountLabel: "₹2", endsOn: "2026-11-12" },
        ],
      }),
    ]);

    // A week count needs a start date, and nothing published says when the work
    // would begin. The vendor dated their stages; this reads the last of them.
    const timeline = rows.find((row) => row.label === "Timeline");
    expect(timeline?.values[0]).toBe("Ends 2026-11-12");
  });

  it("names the pricing style from the arrays, never the flag", () => {
    // `estimateType` defaults to LABOUR_WISE on quotes that priced neither way
    // (every A3 quote, and tap estimates that only staged the work). The row
    // must stay silent for those rather than claim a style nobody used.
    const rows = toComparisonRows([
      card({
        itemLines: [
          { category: "Work", title: "Wall tiling", quantityLabel: "40 Sq ft × ₹80", amountLabel: "₹3,200" },
        ],
      }),
      card({
        labourLines: [
          { role: "Mason", team: null, crewLabel: "2 people × 3 days × ₹900/day", amountLabel: "₹5,400" },
        ],
      }),
      card({ estimateType: "LABOUR_WISE" }),
    ]);

    const priced = rows.find((row) => row.label === "How it is priced");
    expect(priced?.values).toEqual(["Item-wise (1 item)", "Labour-wise (1 role)", null]);
    expect(priced?.equivalent).toBe(true);
  });

  it("keeps assumptions out of the ranked rows", () => {
    const rows = toComparisonRows([
      card({ inclusions: ["Design drawings"], exclusions: ["Furniture"] }),
    ]);

    for (const label of ["What is included", "What is not included"]) {
      expect(rows.find((row) => row.label === label)?.equivalent).toBe(false);
    }
    expect(rows.find((row) => row.label === "What you pay")?.equivalent).toBe(true);
  });
});
