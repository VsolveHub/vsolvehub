import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AsyncState } from "@/components/async-section";
import { withI18n } from "@/i18n/test-utils";

import type { DemandView } from "../adapters/demand";
import type { GateExplanation } from "../adapters/gates";
import { DemandList } from "./demand-list";
import { GateNotice } from "./gate-notice";

/**
 * Browse before KYC, and be told why at the moment it bites.
 *
 * Closes the browse/blocked half of `M2-FE-114` at the layer where it is
 * actually visible. The adapter tests prove the decisions; these prove the
 * screens act on them — a correct `blockingGate` behind a component that renders
 * an accept button anyway is still a Partner pressing something that refuses.
 */

const KYC_BLOCK: GateExplanation = {
  gate: "KYC",
  reason: "We check identity before you accept your first job, so customers know who is coming.",
  actionHref: "/apply/review",
  actionLabel: "Finish your application",
};

function ready(view: Partial<DemandView> = {}): AsyncState<DemandView> {
  return {
    status: "ready",
    data: {
      cards: [],
      matchedServiceCount: 1,
      isEmpty: false,
      isAllIneligible: false,
      ...view,
    },
  };
}

describe("browsing before KYC", () => {
  const INELIGIBLE = ready({
    cards: [
      {
        id: "d-1",
        headline: "4 housekeeping staff, 12 days",
        areaLabel: "Gachibowli, Hyderabad",
        startsOn: "2026-08-24",
        workspaceLabel: "Workforce",
        isEligible: false,
        hint: "Needs an approved Housekeeping staff capability.",
      },
    ],
    isAllIneligible: true,
  });

  it("shows real demand to someone who has proved nothing", () => {
    render(withI18n(<DemandList state={INELIGIBLE} />));

    expect(screen.getByText("4 housekeeping staff, 12 days")).toBeInTheDocument();
    expect(screen.getByText("Gachibowli, Hyderabad")).toBeInTheDocument();
  });

  it("offers no action it cannot honour", () => {
    // The card is proof that work exists, not an invitation to accept it. The
    // accept lives behind the enquiry, behind the capability, behind KYC.
    render(withI18n(<DemandList state={INELIGIBLE} />));

    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /accept/i })).toBeNull();
  });

  it("says what stands in the way, in the server's words", () => {
    render(withI18n(<DemandList state={INELIGIBLE} />));
    expect(
      screen.getByText("Needs an approved Housekeeping staff capability."),
    ).toBeInTheDocument();
  });

  it("never prints a raw workspace key", () => {
    // An archetype code on a card is the leak `08-frontend-…` §2 forbids. An
    // unknown key costs a label, not the lead.
    const unknown = ready({
      cards: [
        {
          id: "d-2",
          headline: "Something new",
          areaLabel: "Madhapur",
          startsOn: "2026-08-24",
          workspaceLabel: null,
          isEligible: false,
          hint: "Not open to you yet.",
        },
      ],
    });

    const { container } = render(withI18n(<DemandList state={unknown} />));
    expect(container.textContent).not.toMatch(/A[0-9]_[A-Z_]+/);
  });
});

describe("the demand screen's exception states", () => {
  it("distinguishes a setup problem from a quiet day", () => {
    // Two empties with different causes and different next steps. Collapsing
    // them into one "no results" sends both people to the wrong place.
    const noMatches = ready({ cards: [], isEmpty: true, matchedServiceCount: 0 });
    const { unmount } = render(withI18n(<DemandList state={noMatches} />));
    expect(screen.getByText(/nothing matched your services/i)).toBeInTheDocument();
    unmount();

    render(withI18n(<DemandList state={ready({ cards: [], isEmpty: true, matchedServiceCount: 3 })} />));
    expect(screen.getByText(/nothing in your area right now/i)).toBeInTheDocument();
  });

  it("reports being offline as recoverable and says nothing is lost", () => {
    render(withI18n(<DemandList state={{ status: "failed", kind: "offline" }} onRetry={() => {}} />));

    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("offers no retry for an endpoint that does not exist yet", () => {
    // The honest state for this milestone. A retry button here would be an
    // invitation to keep pressing something that cannot start working.
    render(withI18n(<DemandList state={{ status: "failed", kind: "unavailable" }} onRetry={() => {}} />));

    expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("announces its loading state to a screen reader", () => {
    render(withI18n(<DemandList state={{ status: "loading" }} />));
    expect(screen.getByText(/loading work near you/i)).toBeInTheDocument();
  });
});

describe("the gate notice", () => {
  it("renders nothing when nothing is blocking", () => {
    // Browsing must never carry a gate banner. A component that rendered an
    // "all clear" would be one somebody puts at the top of a list.
    const { container } = render(
      withI18n(<GateNotice explanation={null} actionDescription="accept this job" />),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the server's sentence verbatim", () => {
    render(withI18n(<GateNotice explanation={KYC_BLOCK} actionDescription="accept this job" />));
    expect(screen.getByText(KYC_BLOCK.reason)).toBeInTheDocument();
  });

  it("names the action it is standing in front of", () => {
    // Placement is the design: the explanation belongs to the control, not to
    // the page. A generic "one thing first" would be ignorable.
    render(withI18n(<GateNotice explanation={KYC_BLOCK} actionDescription="accept this job" />));
    expect(screen.getByText(/before you can accept this job/i)).toBeInTheDocument();
  });

  it("gives one way forward", () => {
    render(withI18n(<GateNotice explanation={KYC_BLOCK} actionDescription="accept this job" />));

    const link = screen.getByRole("link", { name: "Finish your application" });
    expect(link).toHaveAttribute("href", "/apply/review");
  });

  it("interrupts rather than waiting to be noticed", () => {
    // It appears at the moment someone tried to act. A polite announcement is
    // read after they have already pressed again.
    const { container } = render(
      withI18n(<GateNotice explanation={KYC_BLOCK} actionDescription="accept this job" />),
    );
    expect(container.querySelector('[aria-live="assertive"]')).not.toBeNull();
  });

  it("renders without a route when the server named no next action", () => {
    render(
      withI18n(
        <GateNotice
          explanation={{ ...KYC_BLOCK, actionHref: null, actionLabel: null }}
          actionDescription="accept this job"
        />,
      ),
    );

    expect(screen.getByText(KYC_BLOCK.reason)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
