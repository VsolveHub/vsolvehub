import { beforeEach, describe, expect, it, vi } from "vitest";

const GET = vi.fn();
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({ GET }) }));

const { fetchOpsStayEnquiriesPage, fetchOpsStays, fetchOpsStaysPage } = await import("./queries");

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

describe("operations stay lists", () => {
  beforeEach(() => GET.mockReset());

  it("reads every page of properties instead of treating the page envelope as an empty array", async () => {
    GET.mockResolvedValueOnce(
      ok({ results: [{ id: "p1" }], next: "https://api.test/api/v1/ops/stays?cursor=abc", previous: null }),
    ).mockResolvedValueOnce(ok({ results: [{ id: "p2" }], next: null, previous: null }));

    const rows = await fetchOpsStays();

    expect(rows.map((row) => row.id)).toEqual(["p1", "p2"]);
    expect(GET).toHaveBeenLastCalledWith("/api/v1/ops/stays", {
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
