import { beforeEach, describe, expect, it, vi } from "vitest";

const GET = vi.fn();
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({ GET }) }));

const { fetchMyRentalsPage, fetchRentals } = await import("./queries");

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

describe("my rentals", () => {
  beforeEach(() => GET.mockReset());

  it("asks the server for the tab's statuses and the cursor's page", async () => {
    GET.mockResolvedValue(
      ok({ results: [{ id: "a" }], next: "https://api.test/api/v1/me/rentals?cursor=def" }),
    );

    const page = await fetchMyRentalsPage("CONFIRMED,HANDOVER", "abc");

    expect(page.results.map((booking) => booking.id)).toEqual(["a"]);
    expect(page.next).toContain("cursor=def");
    expect(GET).toHaveBeenCalledWith("/api/v1/me/rentals", {
      params: { query: { status: "CONFIRMED,HANDOVER", cursor: "abc" } },
    });
  });

  it("surfaces a failed request instead of an empty list", async () => {
    GET.mockResolvedValue({
      data: undefined,
      error: { error: { code: "server_error", message: "Something broke." } },
      response: new Response(null, { status: 500 }),
    });

    await expect(fetchMyRentalsPage()).rejects.toThrow();
  });
});

describe("rental browse", () => {
  beforeEach(() => GET.mockReset());

  it("asks for one window of results, never the whole catalogue", async () => {
    GET.mockResolvedValue(ok([]));

    await fetchRentals({ q: "drill", limit: 24, offset: 48 });

    expect(GET).toHaveBeenCalledWith("/api/v1/rentals", {
      params: { query: expect.objectContaining({ q: "drill", limit: 24, offset: 48 }) },
    });
  });
});
