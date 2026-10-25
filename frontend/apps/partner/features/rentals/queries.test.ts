import { beforeEach, describe, expect, it, vi } from "vitest";

const GET = vi.fn();
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({ GET }) }));

const { fetchPartnerRentalBookingsPage } = await import("./queries");

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function failed(status: number) {
  return {
    data: undefined,
    error: { error: { code: "server_error", message: "Something broke." } },
    response: new Response(null, { status }),
  };
}

describe("partner rental bookings", () => {
  beforeEach(() => GET.mockReset());

  it("keeps every named status, which the endpoint's exact-match filter cannot do", async () => {
    GET.mockResolvedValue(
      ok([
        { id: "a", status: "CONFIRMED" },
        { id: "b", status: "COMPLETED" },
        { id: "c", status: "HANDOVER" },
      ]),
    );

    const page = await fetchPartnerRentalBookingsPage("CONFIRMED,HANDOVER");

    expect(page.results.map((booking) => booking.id)).toEqual(["a", "c"]);
    expect(page.next).toBeNull();
    // Sent to the server, the comma list would match no booking at all.
    expect(GET).toHaveBeenCalledWith("/api/v1/partner/rentals/bookings", { params: undefined });
  });

  it("surfaces a failed request instead of an empty list", async () => {
    GET.mockResolvedValue(failed(500));

    await expect(fetchPartnerRentalBookingsPage("CONFIRMED")).rejects.toThrow();
  });
});
