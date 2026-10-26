import { describe, expect, it } from "vitest";

import * as tileDisplay from "./tile-desktop-rating";
import { categoryHeadline } from "./tile-desktop-rating";

describe("categoryHeadline", () => {
  it("drops a trailing Services suffix so AC Services is not doubled", () => {
    expect(categoryHeadline("AC Services")).toBe("AC");
  });

  it("leaves names that are not a services suffix unchanged", () => {
    expect(categoryHeadline("Technician")).toBe("Technician");
  });
});

describe("invented figures", () => {
  it("exports no rating, booking-count or slot generator", () => {
    expect(Object.keys(tileDisplay)).toEqual(["categoryHeadline"]);
  });
});
