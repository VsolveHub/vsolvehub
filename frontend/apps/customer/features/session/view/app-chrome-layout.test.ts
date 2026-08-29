import { describe, expect, it } from "vitest";

import { appChromeLayout, CUSTOMER_VIEWPORT_WIDTH_CLASS } from "./app-chrome-layout";

describe("appChromeLayout", () => {
  it("binds static chrome to the same visual viewport as fixed navigation", () => {
    const classes = CUSTOMER_VIEWPORT_WIDTH_CLASS.split(" ");

    expect(classes).toEqual(expect.arrayContaining(["w-dvw", "max-w-none", "overflow-x-clip"]));
    expect(classes).not.toContain("w-fit");
    expect(classes).not.toContain("max-w-lg");
  });

  it("gives the cart one viewport calculation and no mobile marketing footer", () => {
    const layout = appChromeLayout("/cart");

    expect(layout.hideMobileFooter).toBe(true);
    expect(layout.contentMinHeightClass).toContain("100dvh-7.5rem");
    expect(layout.contentMinHeightClass).toContain("safe-area-inset-bottom");
    expect(layout.contentMinHeightClass).toContain("md:min-h-[calc(100dvh-4rem)]");
    expect(layout.contentMinHeightClass).not.toBe("min-h-screen");
  });

  it("gives checkout the same focused mobile frame as the cart", () => {
    const layout = appChromeLayout("/checkout");

    expect(layout.hideMobileFooter).toBe(true);
    expect(layout.hideMobileChrome).toBe(true);
    expect(layout.mobileBackHref).toBe("/cart");
    expect(layout.contentMinHeightClass).toContain("100dvh-7.5rem");
    expect(layout.contentMinHeightClass).toContain("safe-area-inset-bottom");
  });

  it("hides mobile chrome on the cart with a catalog back target", () => {
    const layout = appChromeLayout("/cart");

    expect(layout.hideMobileChrome).toBe(true);
    expect(layout.mobileBackHref).toBe("/catalog");
  });

  it("keeps the existing site footer and page height on non-cart routes", () => {
    expect(appChromeLayout("/catalog")).toEqual({
      contentMinHeightClass: "min-h-screen",
      hideMobileFooter: false,
    });
  });
});
