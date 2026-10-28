import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
// The tax section loads its own data; it is not what this test is about.
vi.mock("./tax-profile", () => ({ TaxProfileSection: () => null }));

const { PartnerRecord } = await import("./partner-record");

afterEach(() => vi.restoreAllMocks());

describe("partner record", () => {
  it("shows every service variant, even when they share a code", async () => {
    // Seeded "Face Cleanup" variants share `beauty-face-cleanup`; keyed by code
    // alone React warned about duplicate keys and could drop a chip.
    client.GET.mockResolvedValue({
      data: {
        id: "p1",
        display_name: "Advanced Skin Care Pro",
        application_status: "APPROVED",
        experience_years: 5,
        biography: "",
        submitted_at: null,
        reviewed_at: null,
        change_request_message: "",
        business_profile: null,
        skills: [],
        services: [
          { code: "beauty-face-cleanup", name: "Face Cleanup - Face" },
          { code: "beauty-face-cleanup", name: "Face Cleanup - Face, neck and back" },
        ],
        service_areas: [],
        documents: [],
        transitions: [],
      },
      response: new Response(null, { status: 200 }),
    });
    const error = vi.spyOn(console, "error");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<PartnerRecord partnerId="p1" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    expect(await screen.findByText("Face Cleanup - Face")).toBeInTheDocument();
    expect(screen.getByText("Face Cleanup - Face, neck and back")).toBeInTheDocument();
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/same key/), expect.anything());
  });
});
