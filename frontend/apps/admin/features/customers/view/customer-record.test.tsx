import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bookingHref, type CustomerRecord as Record_ } from "../queries";

/**
 * The customer record: there was no customer page, so a calling customer could not be found,
 * their bookings across services could not be seen in one place, and an account could not be
 * blocked from the console.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
// The wallet panel and step-up gate load their own data and are tested on their own.
vi.mock("@/features/loyalty/view/customer-ledger-panel", () => ({ CustomerLedgerPanel: () => null }));
vi.mock("@/features/finance/view/step-up-gate", () => ({ StepUpGate: () => null }));

const { CustomerRecord } = await import("./customer-record");

const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });

function record(overrides: Partial<Record_> = {}): Record_ {
  return {
    id: "c1",
    full_name: "Asha Reddy",
    phone_number: "+919812345601",
    email: "",
    date_joined: "2026-01-10T10:00:00Z",
    is_blocked: false,
    block: null,
    partner_id: null,
    wallet_balance_paise: 25_000,
    coins_spendable: 120,
    bookings: [
      { kind: "HOME_VISIT", id: "b1", title: "AC service", status: "COMPLETED", status_label: "Completed", when: "2026-11-01T09:00:00Z", total_paise: 99_900 },
      { kind: "RENTAL", id: "r1", title: "Cocktail tables", status: "CONFIRMED", status_label: "Confirmed", when: "2026-11-04T00:00:00Z", total_paise: null },
    ],
    open_quotes: [
      { id: "q1", title: "Tap repair", total_paise: 49_900, created_at: "2026-11-05T10:00:00Z", expires_at: "2026-11-07T10:00:00Z" },
    ],
    open_cases: [{ id: "case-1", summary: "Late arrival", kind: "LATE_NO_SHOW", status: "OPEN", created_at: "2026-11-02T10:00:00Z" }],
    ...overrides,
  } as Record_;
}

function renderRecord() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CustomerRecord customerId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset();
});

describe("customer record", () => {
  it("shows contact, money, every booking and open cases, each linked to where it is handled", async () => {
    client.GET.mockResolvedValue(ok(record()));
    renderRecord();

    expect(await screen.findByRole("heading", { name: "Asha Reddy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call \+919812345601/ })).toHaveAttribute("href", "tel:+919812345601");
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("AC service")).toBeInTheDocument();
    expect(screen.getByText("Cocktail tables")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open case/ })).toHaveAttribute("href", "/operations/cases?case=case-1");
    // Book for a customer starts here, with the customer and the quote already chosen.
    expect(screen.getByRole("link", { name: /Check out for them/ })).toHaveAttribute(
      "href",
      "/operations/home-services?tab=book&customer=c1&quote=q1",
    );
  });

  it("links to the partner record when the customer is also a partner", async () => {
    client.GET.mockResolvedValue(ok(record({ partner_id: "p9" })));
    renderRecord();

    expect(await screen.findByRole("link", { name: "Open their partner record" })).toHaveAttribute(
      "href",
      "/operations/partners?partner=p9",
    );
  });

  it("blocks only with a reason, and shows why once blocked", async () => {
    client.GET.mockResolvedValue(ok(record()));
    client.POST.mockResolvedValue(
      ok(record({ is_blocked: true, block: { reason: "Abusive to partners", at: "2026-11-06T10:00:00Z", by: "Ops Person" } })),
    );
    renderRecord();

    fireEvent.click(await screen.findByRole("button", { name: "Block account" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Block" });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Abusive to partners" } });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(client.POST).toHaveBeenCalledWith("/api/v1/operations/customers/{customer_id}/block/", {
        params: { path: { customer_id: "c1" } },
        body: { blocked: true, reason: "Abusive to partners" },
      }),
    );
    expect(await screen.findByText(/by Ops Person: Abusive to partners/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unblock account" })).toBeInTheDocument();
  });
});

describe("booking links", () => {
  it("opens each kind of booking where it is handled, on that booking", () => {
    expect(bookingHref({ kind: "HOME_VISIT", id: "b1" })).toBe("/operations/visits?id=b1");
    expect(bookingHref({ kind: "RENTAL", id: "r1" })).toBe("/operations/rentals?tab=bookings&q=r1");
    expect(bookingHref({ kind: "STAY", id: "s1" })).toBe("/operations/stays?tab=reservations&q=s1");
    expect(bookingHref({ kind: "REQUEST", id: "q1" })).toBe("/operations/requests/q1");
  });
});
