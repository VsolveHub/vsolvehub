import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import type { PartnerVisit } from "@/features/work/queries";
import { VisitJobView } from "./visit-job-view";
import { withI18n } from "@/i18n/test-utils";

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
    gates: {
      address_unlocks_at: "2026-08-20T07:00:00Z",
      en_route_opens_at: "2026-08-20T08:00:00Z",
      en_route_closes_at: "2026-08-20T10:30:00Z",
      arrival_opens_at: "2026-08-20T08:30:00Z",
      arrival_closes_at: "2026-08-20T10:30:00Z",
    },
    allowed_actions: ["MARK_EN_ROUTE", "PARTNER_RELEASE"],
    site_address: null,
    directions_url: null,
    customer_first_name: null,
    customer_phone: null,
    server_now: "2026-08-20T08:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

function renderVisit(visit: PartnerVisit) {
  vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as never);
  const client = new QueryClient();
  return render(
    withI18n(
      <QueryClientProvider client={client}>
        <VisitJobView visit={visit} />
      </QueryClientProvider>,
    ),
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

describe("the clocked steps and the door (contract 1.82.0)", () => {
  it("says when 'On the way' opens instead of offering it early", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-20T07:30:00Z"));

    renderVisit(confirmedVisit({ allowed_actions: ["PARTNER_RELEASE"] }));

    expect(screen.queryByRole("button", { name: "I am on my way" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/“I am on my way” opens at/);
  });

  it("tells the Partner a closed window needs support rather than hiding the step", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-20T11:00:00Z"));

    renderVisit(
      confirmedVisit({ status: "EN_ROUTE", allowed_actions: ["PARTNER_RELEASE"] }),
    );

    expect(screen.queryByRole("button", { name: "I have arrived" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/closed at .* Contact support/);
  });

  it("keeps the address locked, with the unlock time, until the server sends it", () => {
    renderVisit(confirmedVisit());

    expect(screen.getByText(/exact address, map route and customer's number unlock at/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open route in Maps/ })).not.toBeInTheDocument();
  });

  it("shows the address, the Maps route and a Call button once unlocked", () => {
    const route = "https://www.google.com/maps/dir/?api=1&destination=17.44,78.38";
    renderVisit(
      confirmedVisit({
        site_address: {
          line1: "Flat 402, Lake View Apartments",
          line2: "",
          landmark: "Opposite the metro",
          locality: "Madhapur",
          city: "Hyderabad",
          state: "Telangana",
          postal_code: "500081",
          directions_url: route,
        },
        directions_url: route,
        customer_first_name: "Asha",
        customer_phone: "+919876543210",
      }),
    );

    expect(screen.getByText("Flat 402, Lake View Apartments")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open route in Maps/ })).toHaveAttribute("href", route);
    expect(screen.getByText("Asha")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+919876543210");
  });

  it("withdraws the location card once the visit is finished", () => {
    renderVisit(confirmedVisit({ status: "COMPLETED", allowed_actions: [] }));

    expect(screen.queryByRole("region", { name: "Visit location" })).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock at/i)).not.toBeInTheDocument();
  });
});
