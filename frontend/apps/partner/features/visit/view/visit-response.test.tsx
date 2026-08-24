import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { enquiryDetail, planVisit } from "@/features/enquiry/fixtures";
import { readEnquiryRecord } from "@/features/enquiry/model/wire";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
const router = { replace: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { VisitResponse } = await import("./visit-response");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

const slotGrid: Schemas["VisitSlotGrid"] = {
  server_now: "2026-08-21T03:30:00Z",
  visit_duration_minutes: 45,
  availability_is_preliminary: true,
  timezone: "Asia/Kolkata",
  days: [
    {
      date: "2026-08-22",
      is_today: false,
      slots: [
        {
          id: "signed-slot-token",
          starts_at: "2026-08-22T03:30:00Z",
          ends_at: "2026-08-22T04:15:00Z",
          is_available: true,
          unavailable_reason: null,
        },
      ],
    },
  ],
};

const confirmation: Schemas["VisitSlotConfirmation"] = {
  visit: planVisit({ status: "REQUESTED" }),
  share: {
    id: "77777777-7777-4777-8777-777777777777",
    position: 1,
    status: "COMMITTED",
    amount_paise: 50_000,
    vendor_payout_paise: 40_000,
    platform_share_paise: 10_000,
    settlement_reason_code: "",
    committed_at: "2026-08-21T03:31:00Z",
    earned_at: null,
    refunded_at: null,
  },
  opens_plan_checkout: true,
  server_now: "2026-08-21T03:31:00Z",
};

beforeEach(() => {
  window.sessionStorage.clear();
  router.replace.mockReset();
  for (const method of Object.values(client)) method.mockReset();
  client.GET.mockResolvedValue(ok(slotGrid));
  client.POST.mockResolvedValue(ok(confirmation, 201));
});

describe("visit booking handoff", () => {
  it("opens the visit workspace after the slot is held", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const enquiry = readEnquiryRecord(
      enquiryDetail({ archetype: "A5_CUSTOM_PROJECT", status: "INVITED", site_visits: [] }),
    );

    function Wrapper({ children }: { readonly children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    render(<VisitResponse enquiry={enquiry} />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /Choose/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Accept & book /i }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept & book visit" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/work/enquiries/${enquiry.id}/visit`),
    );
  });
});
