import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequirementSent } from "./requirement-sent";

/**
 * `M2-FE-212` — "nothing is charged until quotes arrive", said by the server.
 *
 * Two properties, and both are about what the screen refuses to say:
 *
 * 1. the free promise is made only when `is_free` says so, never from a literal;
 * 2. a requirement with no delivery deadline does not get one invented for it.
 */

const IN_TWELVE_HOURS = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

function renderSent(overrides: Partial<Parameters<typeof RequirementSent>[0]> = {}) {
  return render(
    <RequirementSent
      requirementId="7f3a91c2-0000-0000-0000-000000000000"
      isFree
      quoteDeadlineAt={IN_TWELVE_HOURS}
      requestHref="/requests/req-1"
      browseHref="/catalog"
      {...overrides}
    />,
  );
}

describe("the free promise", () => {
  it("is made when the server says the requirement is free", () => {
    renderSent();

    expect(screen.getByText(/nothing is charged until professionals/i)).toBeInTheDocument();
  });

  it("is not made when the server did not say so", () => {
    // A hardcoded "this is free" is a promise that outlives the policy it
    // describes, and this flow will one day sit beside one that is not free.
    renderSent({ isFree: false });

    expect(screen.queryByText(/was free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing is charged/i)).not.toBeInTheDocument();
  });
});

describe("the delivery promise", () => {
  it("states the remaining time when there is a deadline", () => {
    renderSent();

    expect(screen.getByText(/we aim to have quotes for you in/i)).toBeInTheDocument();
  });

  it("invents no window when the server carries no deadline", () => {
    // An area with no open hours carries no delivery promise. "Within 24 hours"
    // here is precisely the fabricated progress `M2-FE-215` forbids.
    renderSent({ quoteDeadlineAt: null });

    expect(screen.queryByText(/we aim to have quotes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/have not put a time on this one/i)).toBeInTheDocument();
  });
});

describe("where the Customer goes next", () => {
  it("offers the request itself and a way back to browsing", () => {
    renderSent();

    expect(screen.getByRole("link", { name: /follow this request/i })).toHaveAttribute(
      "href",
      "/requests/req-1",
    );
    expect(screen.getByRole("link", { name: /back to services/i })).toHaveAttribute(
      "href",
      "/catalog",
    );
  });
});
