import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { summariseDetail } from "./detail-titles";

describe("summariseDetail", () => {
  it("leads with the place, then the item's own description", () => {
    expect(
      summariseDetail({
        title: "Bosch Drill",
        location_text: "Kukatpally, Hyderabad",
        description: "Heavy-duty\n drill.",
      }),
    ).toEqual({ title: "Bosch Drill", description: "Kukatpally, Hyderabad · Heavy-duty drill." });
  });

  it("cuts a long description on a word, inside the snippet limit", () => {
    const result = summariseDetail({ title: "Room", description: "word ".repeat(60) });
    expect(result).not.toBeNull();
    const description = (result as { description: string }).description;
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith("word…")).toBe(true);
  });

  it("leaves the description to the section fallback when there is no text", () => {
    expect(summariseDetail({ title: "Stay", description: "  " })).toEqual({
      title: "Stay",
      description: null,
    });
  });

  it("returns null without a title, so the layout uses its generic one", () => {
    expect(summariseDetail({ title: " ", description: "x" })).toBeNull();
  });
});
