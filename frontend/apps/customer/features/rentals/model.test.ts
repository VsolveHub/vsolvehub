import { describe, expect, it } from "vitest";

import { rentalMineBucket } from "./model";

describe("rental mine buckets", () => {
  it("maps handover to ongoing and returned to returned", () => {
    expect(rentalMineBucket("HANDOVER")).toBe("ONGOING");
    expect(rentalMineBucket("RETURNED")).toBe("RETURNED");
    expect(rentalMineBucket("CLOSED")).toBe("RETURNED");
    expect(rentalMineBucket("CONFIRMED")).toBe("UPCOMING");
    expect(rentalMineBucket("PENDING_PAYMENT")).toBe("UPCOMING");
  });

  it("keeps cancelled and disputed out of returned", () => {
    expect(rentalMineBucket("CANCELLED")).toBe("INACTIVE");
    expect(rentalMineBucket("DISPUTED")).toBe("INACTIVE");
  });
});

describe("rental tabs ask the server for the same buckets", () => {
  it("maps every tab status back to its own tab", async () => {
    const { RENTAL_TAB_STATUSES } = await import("./model");
    for (const [tab, statuses] of Object.entries(RENTAL_TAB_STATUSES)) {
      if (tab === "ALL") continue;
      for (const status of statuses.split(",")) {
        expect(rentalMineBucket(status)).toBe(tab);
      }
    }
  });
});
