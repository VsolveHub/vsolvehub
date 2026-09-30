import { describe, expect, it } from "vitest";

import { reviewPhotoUrls, roomOccupancyLabel } from "./model";

describe("roomOccupancyLabel", () => {
  it("describes a hotel room by the guests it fits, never as shared", () => {
    // Older hotel rooms may still carry a sharing count; guests must not see "2 sharing".
    expect(roomOccupancyLabel({ sharing_count: 2, max_guests: 3 }, "PRIVATE")).toBe(
      "Up to 3 guests",
    );
    expect(roomOccupancyLabel({ sharing_count: 1, max_guests: 1 }, "PRIVATE")).toBe(
      "Up to 1 guest",
    );
  });

  it("describes a PG room by how many people share it", () => {
    expect(roomOccupancyLabel({ sharing_count: 2, max_guests: 2 }, "SHARED")).toBe("2 sharing");
    expect(roomOccupancyLabel({ sharing_count: 1, max_guests: 1 }, "SHARED")).toBe(
      "Private room",
    );
  });

  it("falls back to the sharing count for an unclassified stay type", () => {
    expect(roomOccupancyLabel({ sharing_count: 3, max_guests: 3 }, "MIXED")).toBe("3 sharing");
    expect(roomOccupancyLabel({}, undefined)).toBe("Private room");
  });
});

describe("reviewPhotoUrls", () => {
  it("keeps only text links", () => {
    expect(reviewPhotoUrls(["https://a/1.jpg", 3, null])).toEqual(["https://a/1.jpg"]);
    expect(reviewPhotoUrls({})).toEqual([]);
  });
});
