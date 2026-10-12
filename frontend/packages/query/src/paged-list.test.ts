import { describe, expect, it } from "vitest";

import { flattenPages } from "./paged-list";

describe("paged lists", () => {
  it("flattens pages in order", () => {
    expect(
      flattenPages([
        { next: "x?cursor=a", results: [1, 2] },
        { next: null, results: [3] },
      ]),
    ).toEqual([1, 2, 3]);
  });

  it("is empty before the first page", () => {
    expect(flattenPages(undefined)).toEqual([]);
  });
});

describe("browse lists", () => {
  it("asks for the next window after a full page", async () => {
    const { nextBrowseOffset } = await import("./paged-list");
    expect(nextBrowseOffset([1, 2], [[1, 2]], 2)).toBe(2);
    expect(nextBrowseOffset([3, 4], [[1, 2], [3, 4]], 2)).toBe(4);
  });

  it("stops after a short page", async () => {
    const { nextBrowseOffset } = await import("./paged-list");
    expect(nextBrowseOffset([5], [[1, 2], [5]], 2)).toBeUndefined();
    expect(nextBrowseOffset([], [[]], 2)).toBeUndefined();
  });
});

describe("fetchAllPages", () => {
  it("follows next until the end", async () => {
    const { fetchAllPages } = await import("./paged-list");
    const pages: Record<string, { next: string | null; results: number[] }> = {
      first: { next: "/x?cursor=b", results: [1, 2] },
      b: { next: null, results: [3] },
    };
    const seen: (string | undefined)[] = [];
    const rows = await fetchAllPages(async (cursor) => {
      seen.push(cursor);
      return pages[cursor ?? "first"]!;
    });
    expect(rows).toEqual([1, 2, 3]);
    expect(seen).toEqual([undefined, "b"]);
  });

  it("stops at the guard", async () => {
    const { fetchAllPages } = await import("./paged-list");
    const rows = await fetchAllPages(async () => ({ next: "/x?cursor=again", results: [1] }), 3);
    expect(rows).toEqual([1, 1, 1]);
  });
});
