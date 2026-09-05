import { describe, expect, it } from "vitest";

import { categoryHeadline, earliestSlotLabel } from "./tile-desktop-rating";

describe("categoryHeadline", () => {
  it("drops a trailing Services suffix so AC Services is not doubled", () => {
    expect(categoryHeadline("AC Services")).toBe("AC");
  });

  it("leaves names that are not a services suffix unchanged", () => {
    expect(categoryHeadline("Technician")).toBe("Technician");
  });
});

describe("earliestSlotLabel", () => {
  it("uses today at 8:00 AM IST when that slot is still ahead", () => {
    const beforeEight = new Date("2026-08-28T01:30:00.000Z"); // 07:00 IST
    expect(earliestSlotLabel(beforeEight)).toBe("Fri, 8:00 AM");
  });

  it("rolls to the next morning once 8:00 AM IST has passed", () => {
    const afterEight = new Date("2026-08-28T03:00:00.000Z"); // 08:30 IST
    expect(earliestSlotLabel(afterEight)).toBe("Sat, 8:00 AM");
  });
});
