import { describe, expect, it } from "vitest";

import { CART_PAGE_FRAME } from "./cart-layout";

describe("the cart page frame", () => {
  it("fills small screens and uses the catalogue width with adaptive desktop gutters", () => {
    const classes = CART_PAGE_FRAME.split(" ");

    expect(classes).toEqual(
      expect.arrayContaining([
        "w-full",
        "max-w-[1216px]",
        "px-4",
        "sm:px-6",
        "lg:px-8",
      ]),
    );
    expect(classes).not.toContain("max-w-5xl");
    expect(classes).not.toContain("max-w-3xl");
  });
});
