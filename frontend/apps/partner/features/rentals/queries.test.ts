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

  it("asks the server for the named statuses and the cursor's page", async () => {
    GET.mockResolvedValue(ok({ results: [{ id: "a" }], next: null, previous: null }));

    const page = await fetchPartnerRentalBookingsPage("CONFIRMED,HANDOVER", "abc");

    expect(page.results.map((booking) => booking.id)).toEqual(["a"]);
    // Filtered on the server, so a tab never misses rows on a page not yet loaded.
    expect(GET).toHaveBeenCalledWith("/api/v1/partner/rentals/bookings", {
      params: { query: { status: "CONFIRMED,HANDOVER", cursor: "abc" } },
    });
  });

  it("sends no status for the All tab", async () => {
    GET.mockResolvedValue(ok({ results: [], next: null, previous: null }));

    await fetchPartnerRentalBookingsPage(undefined);

    expect(GET).toHaveBeenCalledWith("/api/v1/partner/rentals/bookings", {
      params: { query: { status: undefined, cursor: undefined } },
    });
  });

  it("surfaces a failed request instead of an empty list", async () => {
    GET.mockResolvedValue(failed(500));

    await expect(fetchPartnerRentalBookingsPage("CONFIRMED")).rejects.toThrow();
  });
});
