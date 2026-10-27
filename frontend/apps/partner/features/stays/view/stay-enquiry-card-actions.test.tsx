import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirm = vi.fn(async () => ({}));
const respond = vi.fn(async () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/stays/enquiries",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/features/stays/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/stays/queries")>();
  const enquiry = {
    id: "enq-1",
    status: "SUBMITTED",
    customer_name: "Priya",
    customer_phone: "+919900000001",
    property: "prop-1",
    property_title: "Beyond Apartments",
    unit: "unit-1",
    unit_name: "Normal room",
    check_in: "2026-10-13",
    guest_count: 2,
  };
  return {
    ...actual,
    fetchPartnerStayEnquiriesPage: vi.fn(async () => ({ next: null, previous: null, results: [enquiry] })),
    fetchPartnerStayProperties: vi.fn(async () => [
      {
        id: "prop-1",
        units: [{ id: "unit-1", name: "Normal room", rooms: [{ id: "room-101", number: "101", status: "AVAILABLE" }] }],
      },
    ]),
    confirmPartnerStayEnquiry: (...args: unknown[]) => confirm(...(args as [])),
    respondPartnerStayEnquiry: (...args: unknown[]) => respond(...(args as [])),
  };
});

import { withI18n } from "@/i18n/test-utils";

import { PartnerStayEnquiriesWorkspace } from "./stay-enquiries-workspace";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  confirm.mockClear();
  respond.mockClear();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("enquiry card actions", () => {
  it("marks Booked from the card, with the enquired room pre-selected", async () => {
    render(withI18n(<PartnerStayEnquiriesWorkspace />), { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /^Booked$/ }));
    expect(await screen.findByText("Booking confirmed?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("room-101"));
    fireEvent.click(screen.getByRole("button", { name: "Yes – Mark Room Booked" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("enq-1", "room-101"));
  });

  it("marks Not available from the card with an optional note", async () => {
    render(withI18n(<PartnerStayEnquiriesWorkspace />), { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /Not available/ }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Full till the 20th" } });
    fireEvent.click(screen.getByRole("button", { name: "Tell the guest" }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("enq-1", "Full till the 20th", true));
  });
});
