import { describe, expect, it } from "vitest";

import { listingFilterQuery } from "./queries";

describe("job listing filters run on the server", () => {
  it("maps each chip to its server filter", () => {
    expect(listingFilterQuery("ALL")).toEqual({});
    expect(listingFilterQuery("PENDING")).toEqual({ moderation_status: "PENDING" });
    expect(listingFilterQuery("ACTIVE")).toEqual({ status: "PUBLISHED" });
    expect(listingFilterQuery("CLOSED")).toEqual({ status: "CLOSED,EXPIRED" });
  });
});
