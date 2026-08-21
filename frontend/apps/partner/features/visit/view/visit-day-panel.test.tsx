import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { enquiryDetail, planVisit } from "@/features/enquiry/fixtures";
import { readEnquiryRecord } from "@/features/enquiry/model/wire";

import { VisitDayPanel } from "./visit-day-panel";

vi.mock("@/lib/api/browser", () => ({ getApiClient: vi.fn() }));

function renderVisit(status: Schemas["SiteVisitStatusEnum"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const visit = planVisit({
    status,
    arrival_confirmed_at: status === "IN_PROGRESS" ? "2026-08-22T03:35:00Z" : null,
    completed_at: status === "COMPLETED" ? "2026-08-22T04:10:00Z" : null,
    estimate_due_at: null,
  });
  const enquiry = readEnquiryRecord(
    enquiryDetail({
      archetype: "A5_CUSTOM_PROJECT",
      status: "ACCEPTED",
      site_visits: [visit],
    }),
  );

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(
    <VisitDayPanel enquiry={enquiry} estimateHref="/work/enquiries/enquiry-1/estimate" />,
    { wrapper: Wrapper },
  );
}

describe("project visit progress", () => {
  it("shows the payment wait while the slot is held", () => {
    renderVisit("REQUESTED");

    expect(screen.getByText("Waiting for customer payment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I’ve arrived" })).not.toBeInTheDocument();
  });

  it("reveals arrival after the visit is scheduled", () => {
    renderVisit("SCHEDULED");

    expect(screen.getByRole("button", { name: "I’ve arrived" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /without a code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish the visit" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Visit progress" })).toBeInTheDocument();
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
