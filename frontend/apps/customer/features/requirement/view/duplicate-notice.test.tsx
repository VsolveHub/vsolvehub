import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DuplicateView } from "../adapters";
import { DuplicateNotice } from "./duplicate-notice";
import { RequirementProvider } from "./requirement-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `M2-FE-210` / `GAP-004`.
 *
 * The notice offers and never blocks, and — since contract 1.21.0 publishes no
 * merge endpoint — it offers only what the platform can actually do. A button
 * labelled "Add to this one" over an action nothing performs would be worse
 * than the honest link, because the Customer would believe the two requests had
 * been joined and stop watching one of them.
 */

function duplicate(overrides: Partial<DuplicateView> = {}): DuplicateView {
  return {
    id: "req-9",
    summary: "4 x Housekeeping staff, 5 days",
    createdLabel: "9 Aug",
    mergeable: true,
    ...overrides,
  };
}

function renderNotice(duplicates: DuplicateView[]) {
  return render(
    <RequirementProvider categorySlug="housekeeping-staff">
      <DuplicateNotice duplicates={duplicates} hrefFor={(id) => `/requests/${id}`} />
    </RequirementProvider>,
  );
}

describe("a probable duplicate", () => {
  it("shows the server's own summary, so the Customer recognises their request", () => {
    // Rebuilding a description from raw answers here would read differently
    // from the one on `My requests`, and the two would drift.
    renderNotice([duplicate()]);

    expect(screen.getByText("4 x Housekeeping staff, 5 days")).toBeInTheDocument();
    expect(screen.getByText("9 Aug")).toBeInTheDocument();
  });

  it("links to the request that already exists rather than claiming to merge", () => {
    renderNotice([duplicate()]);

    const link = screen.getByRole("link", { name: /open that request/i });
    expect(link).toHaveAttribute("href", "/requests/req-9");
    expect(screen.queryByText(/add to this one/i)).not.toBeInTheDocument();
  });

  it("offers no link to a request that is no longer live", () => {
    // `mergeable` is set from `LIVE_STATUSES`. A closed request is not
    // somewhere to send this work.
    renderNotice([duplicate({ mergeable: false })]);

    expect(screen.queryByRole("link", { name: /open that request/i })).not.toBeInTheDocument();
    expect(screen.getByText("4 x Housekeeping staff, 5 days")).toBeInTheDocument();
  });

  it("warns rather than blocks, and the override is explicit", () => {
    // Two crews at one address is a real requirement. Continuing separately is
    // a legitimate answer, and `duplicateOverridden` is what `allow_duplicate`
    // is later sent from.
    renderNotice([duplicate()]);

    fireEvent.click(screen.getByRole("button", { name: /these are different jobs/i }));

    expect(screen.queryByText("4 x Housekeeping staff, 5 days")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no duplicate", () => {
    const { container } = renderNotice([]);

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
