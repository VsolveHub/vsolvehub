import { fetchListingApplications } from "./queries";

const mockGet = jest.fn();
jest.mock("@vsolve/mobile-core", () => ({ getApiClient: () => ({ GET: mockGet }) }));

function page(results: { id: string }[], next: string | null) {
  return { data: { results, next, previous: null }, response: new Response(null, { status: 200 }) };
}

beforeEach(() => mockGet.mockReset());

describe("fetchListingApplications", () => {
  // Regression: the server answers one page ({ results, next }); the app checked for a plain list
  // and showed every job with no applicants.
  it("reads the applicants from every page of the server's answer", async () => {
    mockGet
      .mockResolvedValueOnce(page([{ id: "a-1" }, { id: "a-2" }], "/api/v1/partner/listings/l-1/applications?cursor=c2"))
      .mockResolvedValueOnce(page([{ id: "a-3" }], null));

    const rows = await fetchListingApplications("l-1");

    expect(rows.map((row) => row.id)).toEqual(["a-1", "a-2", "a-3"]);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet.mock.calls[1][1].params.query).toEqual({ cursor: "c2" });
  });

  it("returns an empty list for a job with no applicants", async () => {
    mockGet.mockResolvedValueOnce(page([], null));
    await expect(fetchListingApplications("l-1")).resolves.toEqual([]);
  });
});
