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
