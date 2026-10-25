import { beforeEach, describe, expect, it, vi } from "vitest";

const GET = vi.fn();
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({ GET }) }));

const { fetchMyRentalsPage } = await import("./queries");

function ok(data: unknown) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

describe("my rentals", () => {
  beforeEach(() => GET.mockReset());

  it("applies the tab's statuses itself, because the endpoint takes no filter", async () => {
    GET.mockResolvedValue(
      ok([
        { id: "a", status: "CONFIRMED" },
        { id: "b", status: "CANCELLED" },
        { id: "c", status: "HANDOVER" },
      ]),
    );

    expect((await fetchMyRentalsPage("CONFIRMED,HANDOVER")).results.map((booking) => booking.id)).toEqual([
      "a",
      "c",
    ]);
    expect((await fetchMyRentalsPage()).results).toHaveLength(3);
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
