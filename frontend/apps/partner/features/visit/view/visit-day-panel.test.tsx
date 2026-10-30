import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { enquiryDetail, planVisit } from "@/features/enquiry/fixtures";
import { readEnquiryRecord } from "@/features/enquiry/model/wire";
import { withI18n } from "@/i18n/test-utils";

import { VisitDayPanel } from "./visit-day-panel";

vi.mock("@/lib/api/browser", () => ({ getApiClient: vi.fn() }));

function renderVisit(
  status: Schemas["SiteVisitStatusEnum"],
  overrides: Partial<Schemas["SiteVisit"]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const visit = planVisit({
    status,
    arrival_confirmed_at: status === "IN_PROGRESS" ? "2026-08-22T03:35:00Z" : null,
    completed_at: status === "COMPLETED" ? "2026-08-22T04:10:00Z" : null,
    estimate_due_at: null,
    ...overrides,
  });
  const enquiry = readEnquiryRecord(
    enquiryDetail({
      archetype: "A5_CUSTOM_PROJECT",
      status: "ACCEPTED",
      site_visits: [visit],
    }),
  );

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return withI18n(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
  }

  return render(
    <VisitDayPanel
      enquiry={enquiry}
      estimateHref="/work/enquiries/enquiry-1/estimate"
      arrivalHref="/work/enquiries/enquiry-1/arrival"
    />,
    { wrapper: Wrapper },
  );
}

/** Far enough ahead that no test run can drift into the visit's own day. */
function farFuture(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString();
}

describe("project visit progress", () => {
  it("says not to travel while the slot is held, and keeps the address locked", () => {
    renderVisit("REQUESTED");

    expect(screen.getByText("This visit is yours")).toBeInTheDocument();
    expect(screen.getByText("Do not travel yet")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for customer payment/)).toBeInTheDocument();
    expect(screen.getByText("Exact address")).toBeInTheDocument();
    expect(screen.getByText("Customer phone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /release/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I’ve arrived" })).not.toBeInTheDocument();
  });

  it("reveals arrival once the visit's own day has come", () => {
    // The fixture's slot is in the past, so its day has certainly arrived.
    renderVisit("SCHEDULED");

    expect(screen.getByRole("button", { name: "I’ve arrived" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /without a code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish the visit" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Visit progress" })).toBeInTheDocument();
  });

  /**
   * Two taps, then a route. "I've arrived" is a claim about the vendor;
   * "Start OTP" is the step into proving it, and the proving happens on a
   * screen that does nothing else — never in a box wedged into this card.
   */
  it("sends arrival to its own screen rather than opening a code box here", () => {
    renderVisit("SCHEDULED");

    fireEvent.click(screen.getByRole("button", { name: "I’ve arrived" }));

    expect(screen.getByRole("link", { name: "Start OTP" })).toHaveAttribute(
      "href",
      "/work/enquiries/enquiry-1/arrival",
    );
    expect(screen.queryByLabelText(/Arrival code/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I’ve arrived" })).not.toBeInTheDocument();
  });

  /**
   * The defect this fixes: `canConfirmArrival` was `status === "SCHEDULED"` and
   * nothing else, so a visit a month away offered "I've arrived" as the largest
   * control on the screen. A button that lies about what it is for teaches a
   * vendor to distrust the one that does not.
   */
  it("withholds arrival before the visit day, and says when it opens", () => {
    renderVisit("SCHEDULED", { scheduled_for: farFuture() });

    expect(screen.queryByRole("button", { name: "I’ve arrived" })).not.toBeInTheDocument();
    expect(screen.getByText(/opens on the day of the visit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to my calendar/i })).toBeInTheDocument();
  });

  /**
   * The dev escape hatch (owner request, 2026-09-01). The arrival path is five
   * screens deep behind a gate that only opens on one calendar day, so a
   * non-production build offers a labelled way through it. The label is the
   * point: the gate is still there and still says so.
   */
  it("offers a labelled dev override, and honours it", () => {
    renderVisit("SCHEDULED", { scheduled_for: farFuture() });

    fireEvent.click(screen.getByRole("button", { name: /Open anyway/i }));

    expect(screen.getByRole("button", { name: "I’ve arrived" })).toBeInTheDocument();
    expect(screen.queryByText(/opens on the day of the visit/i)).not.toBeInTheDocument();
  });

  it("keeps the no-show report out of the way behind one step", () => {
    renderVisit("SCHEDULED");

    // Not a bare button beside the primary action any more.
    expect(screen.queryByRole("button", { name: "Nobody was there" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Something’s wrong with this visit/i }),
    ).toBeInTheDocument();
  });

  it("reveals completion after arrival", () => {
    renderVisit("IN_PROGRESS");

    expect(screen.getByRole("button", { name: "Finish the visit" })).toBeInTheDocument();
  });

  it("reveals the estimate after completion", () => {
    renderVisit("COMPLETED");

    expect(screen.getByRole("link", { name: "Write the estimate" })).toHaveAttribute(
      "href",
      "/work/enquiries/enquiry-1/estimate",
    );
  });
});
