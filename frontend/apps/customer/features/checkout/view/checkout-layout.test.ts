import { describe, expect, it } from "vitest";

import {
  CHECKOUT_GRID_CLASS,
  CHECKOUT_PAGE_FRAME,
  CHECKOUT_SIDEBAR_ALIGN_SPACER_CLASS,
  CHECKOUT_SIDEBAR_STICKY_CLASS,
} from "./checkout-layout";

describe("checkout layout frame", () => {
  it("matches the site header and footer width", () => {
    expect(CHECKOUT_PAGE_FRAME).toContain("max-w-[1216px]");
    expect(CHECKOUT_PAGE_FRAME).toContain("lg:px-8");
  });

  it("uses a two-column grid with a proportional summary rail", () => {
    expect(CHECKOUT_GRID_CLASS).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
  });

  it("aligns the sticky sidebar with the first booking card", () => {
    expect(CHECKOUT_SIDEBAR_ALIGN_SPACER_CLASS).toContain("lg:h-12");
  });

  it("keeps the summary rail below the header while scrolling", () => {
    expect(CHECKOUT_SIDEBAR_STICKY_CLASS).toContain("lg:sticky");
    expect(CHECKOUT_SIDEBAR_STICKY_CLASS).toContain("lg:top-24");
  });
});
