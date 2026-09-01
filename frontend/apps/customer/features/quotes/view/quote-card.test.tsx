import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { QuoteCardView } from "../adapters";
import { QuoteCard } from "./quote-card";

function estimate(overrides: Partial<QuoteCardView> = {}): QuoteCardView {
  return {
    proposalId: "proposal-1",
    vendorName: "Ravi Interiors",
    vendorType: "Company",
    isVerified: true,
    trust: {
      ratingAverage: 4.8,
      ratingCount: 120,
      jobsCompleted: 120,
      experienceYears: 9,
      activeSinceLabel: "since 2017",
    },
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
    stages: [
      { title: "Start", deliverable: "Demolition done", amountLabel: "₹46,000", endsOn: null },
      { title: "Handover", deliverable: null, amountLabel: "₹1,38,000", endsOn: "2026-10-14" },
    ],
    materials: [],
    materialList: [],
    includedSupplyList: [],
    materialFulfilmentMode: "CUSTOMER_PROCURES",
    brandTierLabel: null,
    inclusions: ["Demolition & debris", "Waterproofing", "Plumbing rework"],
    exclusions: ["Sanitaryware"],
    scopeSummary: "Full strip-out and retile.",
    warrantyTerms: "1 year on workmanship",
    validUntil: "2026-09-20T18:29:59.000Z",
    validityDaysLeft: 6,
    submittedAt: "2026-08-21T08:00:00Z",
    siteVisitId: "visit-1",
    visitCompletedAt: "2026-08-21T07:30:00Z",
    questions: [],
    revisionRequest: null,
    ...overrides,
  };
}

const hrefs = { detailHref: "/estimate", questionsHref: "/estimate/questions" };

describe("the estimate card", () => {
  it("leads with who, how trusted, what it costs and what it costs to start", () => {
    render(<QuoteCard card={estimate()} index={0} isPicked={false} isRevalidating={false} {...hrefs} />);

    expect(screen.getByRole("heading", { name: "Ravi Interiors" })).toBeInTheDocument();
    expect(screen.getByText("★ 4.8 (120) · 120 jobs · 9 yrs · since 2017")).toBeInTheDocument();
    expect(screen.getByText("₹1,84,000")).toBeInTheDocument();
    // The first stage's own amount — `stages[0].amount_paise`, never a share computed here.
    expect(screen.getByText("₹46,000")).toBeInTheDocument();
    expect(screen.getByText("Ends 14 Oct")).toBeInTheDocument();
    expect(screen.getByText("Valid 6 more days")).toBeInTheDocument();
  });

  it("names what the other estimates include and this one does not, as a comparison", () => {
    render(
      <QuoteCard
        card={estimate()}
        index={0}
        isPicked={false}
        isRevalidating={false}
        scopeGaps={["False ceiling", "Debris disposal"]}
        {...hrefs}
      />,
    );

    expect(screen.getByText(/Leaves out:/)).toBeInTheDocument();
    expect(screen.getByText(/False ceiling, Debris disposal/)).toBeInTheDocument();
  });

  it("offers a free fresh price on an expired estimate, and says when it has been asked for", () => {
    const { rerender } = render(
      <QuoteCard card={estimate({ isExpired: true })} index={0} isPicked={false} isRevalidating={false} onRevalidate={() => undefined} {...hrefs} />,
    );
    expect(screen.getByRole("button", { name: "Ask for a fresh price — free" })).toBeInTheDocument();

    rerender(
      <QuoteCard card={estimate({ isExpired: true, hasAskedForRevalidation: true })} index={0} isPicked={false} isRevalidating={false} onRevalidate={() => undefined} {...hrefs} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Fresh price asked for");
  });

  it("withholds the revision control while a request is already open", () => {
    render(
      <QuoteCard
        card={estimate({ revisionRequest: { id: "r1", status: "OPEN", reasonLabel: "Leave something out", excludedItems: [], note: null, declineNote: null, createdAt: "2026-08-22T08:00:00Z" } })}
        index={0}
        isPicked={false}
        isRevalidating={false}
        onRequestRevision={() => undefined}
        {...hrefs}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ask for a revision" })).not.toBeInTheDocument();
    expect(screen.getByText("Revision asked for")).toBeInTheDocument();
  });

  it("says what to buy as one line that opens into the list, with no prices", () => {
    render(
      <QuoteCard
        card={estimate({
          materialList: [
            { title: "Modular switch", spec: "16 A, white", quantityLabel: "5 Nos", note: null },
            { title: "PVC conduit", spec: null, quantityLabel: "20 metre", note: "any brand" },
          ],
        })}
        index={0}
        isPicked={false}
        isRevalidating={false}
        {...hrefs}
      />,
    );

    expect(screen.getByText("What you need to buy · 2 items")).toBeInTheDocument();
    expect(screen.getByText("Modular switch")).toBeInTheDocument();
    expect(screen.getByText("16 A, white")).toBeInTheDocument();
    expect(screen.getByText("5 Nos")).toBeInTheDocument();
    expect(screen.getByText("any brand")).toBeInTheDocument();
  });

  it("shows no buy line when the list is empty", () => {
    render(<QuoteCard card={estimate({ materialList: [] })} index={0} isPicked={false} isRevalidating={false} {...hrefs} />);

    expect(screen.queryByText(/What you need to buy/)).not.toBeInTheDocument();
  });

  it("makes a turnkey decoration estimate clear without showing a shopping list", () => {
    render(
      <QuoteCard
        card={estimate({
          materialFulfilmentMode: "PARTNER_TURNKEY",
          includedSupplyList: [
            { title: "Floral entrance arch", spec: "Fresh flowers", quantityLabel: "1 set", note: null },
          ],
        })}
        index={0}
        isPicked={false}
        isRevalidating={false}
        {...hrefs}
      />,
    );

    expect(screen.getByText("Materials, setup & removal included")).toBeInTheDocument();
    expect(screen.queryByText(/What you need to buy/)).not.toBeInTheDocument();
  });

  it("counts the professional's questions waiting on the customer", () => {
    render(
      <QuoteCard
        card={estimate({
          questions: [
            { id: "q1", askedByRole: "VENDOR", question: "Old tiling off?", answer: null, askedAt: "2026-08-22T08:00:00Z", answeredAt: null },
          ],
        })}
        index={0}
        isPicked={false}
        isRevalidating={false}
        {...hrefs}
      />,
    );
    expect(screen.getByText("1 question for you")).toBeInTheDocument();
  });
});
