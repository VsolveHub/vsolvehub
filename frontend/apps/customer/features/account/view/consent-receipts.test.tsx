import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConsentReceiptCard, ConsentReceipts } from "./consent-receipts";

/**
 * Consent receipts — a test about a screen that deliberately shows no list.
 *
 * `POST /api/v1/auth/privacy/consents/` is the only published consent operation.
 * `ConsentReceiptView` defines `post` and nothing else, so a customer's consent
 * history is not readable by any client.
 *
 * That rules out two things which would both look like features, and this file
 * is what keeps them ruled out:
 *
 *  - **A history table** filled from what this browser happens to have posted.
 *    A consent log assembled by the client, shown to someone who would
 *    reasonably read it as *the* record, is the worst possible place in the
 *    product for something we did not get from the server.
 *  - **An "I accept the current policy" button.** Recording a receipt means
 *    choosing a `policy_version`, and nothing publishes one — so the version
 *    would be minted by a React component and stored against a real person's
 *    account as a legal artifact.
 *
 * `ConsentReceiptCard` is kept and tested because it is what the real list's
 * rows will be made of the moment a `GET` is published.
 */

describe("the screen shows no consent history", () => {
  it("renders no list of receipts, because none can be read", () => {
    render(<ConsentReceipts />);

    // Anything resembling a receipt row here would have been assembled locally.
    expect(screen.queryByText(/policy /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agreed /i)).not.toBeInTheDocument();
  });

  it("offers no way to accept a policy version this client would have invented", () => {
    render(<ConsentReceipts />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says where consent is actually recorded", () => {
    render(<ConsentReceipts />);

    expect(screen.getByText(/agree to the terms at checkout/i)).toBeInTheDocument();
    expect(screen.getByText(/when an agent books for you/i)).toBeInTheDocument();
  });

  it("points at the one route that does reach the record", () => {
    // An access request is published, works, and is one section down the page.
    render(<ConsentReceipts />);

    expect(screen.getByText(/not shown here yet/i)).toBeInTheDocument();
    expect(screen.getByText(/ask for a copy of your data/i)).toBeInTheDocument();
  });
});

describe("the row the real list will be made of", () => {
  const receipt = {
    id: "cr-1",
    purpose: "assisted-booking",
    policy_version: "2026-07",
    accepted_at: "2026-07-20T09:00:00Z",
    withdrawn_at: null,
  };

  it("shows an active receipt with its policy version", () => {
    render(
      <ul>
        <ConsentReceiptCard receipt={receipt} />
      </ul>,
    );

    expect(screen.getByText("assisted-booking")).toBeInTheDocument();
    expect(screen.getByText(/Policy 2026-07/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("marks a withdrawn one as withdrawn, and keeps the date it was agreed", () => {
    // A withdrawal does not erase that consent was once given; the receipt is
    // evidence of both.
    render(
      <ul>
        <ConsentReceiptCard
          receipt={{ ...receipt, withdrawn_at: "2026-08-01T09:00:00Z" }}
        />
      </ul>,
    );

    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.getAllByRole("time")).toHaveLength(2);
  });
});
