import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
  it("offers the control while the job is still confirmed", () => {
    renderVisit(confirmedVisit());

    expect(screen.getByRole("button", { name: /^Hand this job back/ })).toBeInTheDocument();
  });

  it("requires a reason before the submit button enables", () => {
    renderVisit(confirmedVisit());

    screen.getByRole("button", { name: /^Hand this job back/ }).click();

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

    screen.getByRole("button", { name: "Part done" }).click();

    expect(screen.getByRole("textbox", { name: "What happened — Deep clean" })).toBeInTheDocument();
  });
});
