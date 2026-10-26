import { beforeEach, describe, expect, it, vi } from "vitest";

const GET = vi.fn();
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({ GET }) }));

const { fetchOpsRentalsPage, fetchOpsStayEnquiriesPage, fetchOpsStaysPage } = await import(
  "./queries"
);

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

describe("operations rental listings", () => {
  beforeEach(() => GET.mockReset());

  it("pages on the server and filters pending ones there too", async () => {
    GET.mockResolvedValue(ok({ results: [], next: null, previous: null }));

    await fetchOpsRentalsPage("abc", "PENDING");

    expect(GET).toHaveBeenCalledWith("/api/v1/ops/rentals", {
      params: { query: { cursor: "abc", moderation_status: "PENDING" } },
    });
  });
});

describe("operations stay lists", () => {
  beforeEach(() => GET.mockReset());

  it("asks for the page the cursor names and returns the envelope as is", async () => {
    GET.mockResolvedValue(
      ok({ results: [{ id: "p2" }], next: null, previous: "https://api.test/api/v1/ops/stays" }),
    );

    const page = await fetchOpsStaysPage("abc");

    expect(page.results.map((row) => row.id)).toEqual(["p2"]);
    expect(GET).toHaveBeenCalledWith("/api/v1/ops/stays", {
      params: { query: { cursor: "abc", moderation_status: undefined } },
    });
  });

  it("filters properties with the parameter the API declares", async () => {
    GET.mockResolvedValue(ok({ results: [], next: null, previous: null }));

    await fetchOpsStaysPage(undefined, "PENDING");

    expect(GET).toHaveBeenCalledWith("/api/v1/ops/stays", {
      params: { query: { cursor: undefined, moderation_status: "PENDING" } },
    });
  });

  it("surfaces a failed request instead of an empty list", async () => {
    GET.mockResolvedValue(failed(500));

    await expect(fetchOpsStayEnquiriesPage()).rejects.toThrow();
  });
});
