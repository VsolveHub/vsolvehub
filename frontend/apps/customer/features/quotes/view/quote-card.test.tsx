import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { QuoteCardView } from "../adapters";
import { QuoteCard } from "./quote-card";

function estimate(): QuoteCardView {
  return {
    proposalId: "proposal-chosen",
    vendorName: "M2 Demo Vendor",
    vendorType: "Company",
    isVerified: true,
    status: "ACCEPTED",
    isSelectable: false,
    isExpired: false,
    isOutOfBudget: false,
    hasAskedForRevalidation: false,
    revision: 1,
    totalLabel: "₹10,000",
    taxLabel: "₹0",
    taxBasis: "INCLUSIVE",
    payableLabel: "₹10,000",
    payablePaise: 1_000_000,
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
    submittedAt: "2026-08-21T08:00:00Z",
    siteVisitId: "visit-1",
    visitCompletedAt: "2026-08-21T07:30:00Z",
  };
}

describe("the priced lines behind the number", () => {
  /**
   * The item-wise / labour-wise breakdown reached the wire at 1.44.0 and the
   * vendor's read-back rendered it, but this card dropped all three arrays —
   * the same gap the materials regression below closed for `material_lines`.
   */
  it("renders item-wise lines with their quantity arithmetic", () => {
    render(
      <QuoteCard
        card={{
          ...estimate(),
          estimateType: "ITEM_WISE",
          itemLines: [
            {
              category: "Work",
              title: "Wall tiling",
              quantityLabel: "40 Sq ft × ₹80",
              amountLabel: "₹3,200",
            },
            { category: "Work", title: "Grouting", quantityLabel: null, amountLabel: "₹1,000" },
          ],
        }}
        index={0}
        isPicked={false}
        isChosen={false}
        isRevalidating={false}
      />,
    );

    expect(screen.getByText("How the price is built — item-wise")).toBeInTheDocument();
    expect(screen.getByText("Wall tiling")).toBeInTheDocument();
    expect(screen.getByText("40 Sq ft × ₹80")).toBeInTheDocument();
    // A whole-job line has no quantity story; its rate IS its amount.
    expect(screen.getByText("Grouting")).toBeInTheDocument();
    expect(screen.getByText("₹1,000")).toBeInTheDocument();
  });

  it("renders labour-wise lines with the crew arithmetic spelt out", () => {
    render(
      <QuoteCard
        card={{
          ...estimate(),
          labourLines: [
            {
              role: "Mason",
              team: "Ravi's team",
              crewLabel: "2 people × 3 days × ₹900/day",
              amountLabel: "₹5,400",
            },
          ],
          otherCharges: [{ label: "Transportation", amountLabel: "₹800" }],
        }}
        index={0}
        isPicked={false}
        isChosen={false}
        isRevalidating={false}
      />,
    );

    expect(screen.getByText("How the price is built — labour-wise")).toBeInTheDocument();
    expect(screen.getByText("Mason — Ravi's team")).toBeInTheDocument();
    expect(screen.getByText("2 people × 3 days × ₹900/day")).toBeInTheDocument();
    // Named charges are inside the total, like materials, and say so.
    expect(screen.getByText("Named charges")).toBeInTheDocument();
    expect(screen.getByText("Transportation")).toBeInTheDocument();
  });
});

describe("materials the vendor priced in", () => {
  /**
   * Regression. `CustomerProposal.material_lines` was on the wire, the vendor sent
   * it, the vendor's own read-back rendered it — and this card dropped it, while
   * the amounts stayed inside `total_paise`. A Customer was being charged for
   * goods the app never named.
   */
  it("names every material, because their cost is already inside the total", () => {
    render(
      <QuoteCard
        card={{
          ...estimate(),
          materials: [
            { title: "Cement", quantityLabel: "8 bags", amountLabel: "₹3,200" },
            { title: "Waterproofing membrane", quantityLabel: null, amountLabel: "₹1,800" },
          ],
        }}
        index={0}
        isPicked={false}
        isChosen={false}
        isRevalidating={false}
      />,
    );

    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("8 bags")).toBeInTheDocument();
    expect(screen.getByText("₹3,200")).toBeInTheDocument();
    expect(screen.getByText("Waterproofing membrane")).toBeInTheDocument();
    expect(screen.getByText("₹1,800")).toBeInTheDocument();

    // The reader has to be told these are not an extra on top of the headline.
    expect(screen.getByText("Already counted in the total above.")).toBeInTheDocument();
  });

  it("says nothing at all when the vendor priced no materials", () => {
    render(
      <QuoteCard
        card={estimate()}
        index={0}
        isPicked={false}
        isChosen={false}
        isRevalidating={false}
      />,
    );

    expect(screen.queryByText("Materials they will supply")).not.toBeInTheDocument();
  });
});

describe("chosen estimate", () => {
  it("keeps the persisted choice highlighted when comparison is revisited", () => {
    const { container } = render(
      <QuoteCard
        card={estimate()}
        index={0}
        isPicked={false}
        isChosen
        isRevalidating={false}
      />,
    );

    expect(screen.getByText("Chosen")).toBeInTheDocument();
    expect(container.querySelector("article")).toHaveClass("ring-selected");
  });
});
