import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import type { PartnerVisit } from "@/features/work/queries";
import { VisitJobView } from "./visit-job-view";

/**
 * C3 — a Partner who cannot get to a job has a way to hand it back.
 *
 * The queries below match on a REGEX rather than an exact string. That is not
 * looseness: since the readable-UI pass, a `SecondaryAction` renders its verb
 * *and* the consequence of pressing it ("You give up the job. No penalty."),
 * both inside the button, so the computed accessible name is deliberately
 * longer than the verb. Two of these controls render together at `ARRIVED` and
 * the consequence is the only thing that tells them apart — for a screen-reader
 * user most of all, which is why it belongs in the name rather than behind
 * `aria-hidden`.
 */
function confirmedVisit(overrides: Partial<PartnerVisit> = {}): PartnerVisit {
  return {
    id: "b1",
    fulfilment_unit_id: null,
    display_title: "Bathroom deep clean",
    approximate_area: "Madhapur",
    service_lines: [
      {
        line_id: "l1",
        service_label: "Bathroom deep clean",
        quantity: 1,
        scope: { rooms: 1 },
      },
    ],
    requirements: ["Mop", "Cleaning solution"],
    status: "CONFIRMED",
    version: 1,
    scheduled_start: "2026-08-20T09:00:00Z",
    estimated_duration_minutes: 60,
    en_route_at: null,
    arrived_at: null,
    customer_unavailable_wait_started_at: null,
    late_declared_at: null,
    work_tasks: [],
    evidence: [],
    active_amendment: null,
    estimated_earning: {
      gross_paise: 300_000,
      commission_paise: 45_000,
      net_paise: 255_000,
      currency: "INR",
    },
    earning: null,
    server_now: "2026-08-20T08:00:00Z",
    ...overrides,
  };
}

function renderVisit(visit: PartnerVisit) {
  vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as never);
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <VisitJobView visit={visit} />
    </QueryClientProvider>,
  );
}

describe("handing a job back", () => {
  it("shows the accepted service, visit facts, tools and earning before its action", () => {
    renderVisit(confirmedVisit());

    expect(screen.getAllByText("Bathroom deep clean")).toHaveLength(2);
    expect(screen.queryByText("Your job")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Service details" })).toBeInTheDocument();
    expect(screen.getByText("Madhapur")).toBeInTheDocument();
    expect(screen.getByText("1 hr")).toBeInTheDocument();
    expect(screen.getByText("Mop")).toBeInTheDocument();
    expect(screen.getByText("Cleaning solution")).toBeInTheDocument();
    expect(screen.getByText("₹2,550")).toBeInTheDocument();

    const details = screen.getByRole("heading", { name: "Service details" });
    const action = screen.getByRole("button", { name: "I am on my way" });
    expect(details.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers the control while the job is still confirmed", () => {
    renderVisit(confirmedVisit());

    expect(screen.getByRole("button", { name: /^Hand this job back/ })).toBeInTheDocument();
  });

  it("requires a reason before the submit button enables", () => {
    renderVisit(confirmedVisit());

    // fireEvent rather than a bare DOM .click(): outside act(), React never
    // flushes the state update that expands the form.
    fireEvent.click(screen.getByRole("button", { name: /^Hand this job back/ }));

    // The expanded form's submit is the exact verb — no consequence line there,
    // because the panel above it already carries the explanation.
    expect(screen.getByRole("button", { name: "Hand this job back" })).toBeDisabled();
  });

  it("offers 'Stop this job' instead once work is in progress", () => {
    renderVisit(confirmedVisit({ status: "IN_PROGRESS" }));

    expect(screen.getByRole("button", { name: /^Stop this job/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Hand this job back/ })).not.toBeInTheDocument();
  });
});

describe("a partial completion", () => {
  it("shows a reason box once a non-COMPLETED outcome is picked, and none for COMPLETED", () => {
    const visit = confirmedVisit({
      status: "IN_PROGRESS",
      work_tasks: [
        {
          id: "t1",
          kind: "ORIGINAL",
          position: 0,
          code: "deep-clean",
          label: "Deep clean",
          quantity: 1,
          amount_paise: 50000,
          currency: "INR",
        },
      ],
    });

    renderVisit(visit);

    fireEvent.click(screen.getByRole("button", { name: "Part done" }));

    expect(screen.getByRole("textbox", { name: "What happened — Deep clean" })).toBeInTheDocument();
  });
});
