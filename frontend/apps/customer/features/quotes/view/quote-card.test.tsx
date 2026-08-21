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
    stages: [],
    inclusions: [],
    exclusions: [],
    warrantyTerms: null,
    commissionTreatment: null,
    validUntil: null,
    submittedAt: "2026-08-21T08:00:00Z",
    siteVisitId: "visit-1",
    visitCompletedAt: "2026-08-21T07:30:00Z",
  };
}

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
