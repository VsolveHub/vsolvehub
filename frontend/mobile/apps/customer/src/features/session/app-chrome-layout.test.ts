import { appChromeLayout, CUSTOMER_VIEWPORT_WIDTH_CLASS, showFixedBackButton } from "./app-chrome-layout";

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
    expect(layout.mobileBackHref).toBe("/catalog");
    expect(layout.hideMobileChrome).toBe(true);
  });

  it("gives checkout the same focused mobile frame as the cart", () => {
    const layout = appChromeLayout("/checkout");
    expect(layout.hideMobileChrome).toBe(true);
    expect(layout.mobileBackHref).toBe("/cart");
  });

  it("keeps the existing site footer and page height on non-cart routes", () => {
    expect(appChromeLayout("/catalog")).toEqual({
      contentMinHeightClass: "min-h-screen",
      hideMobileFooter: false,
    });
  });

  it("does not stack a circular back button on a claimed booking screen", () => {
    expect(showFixedBackButton("/requests/book/event-staff-by-the-day", true)).toBe(false);
    expect(showFixedBackButton("/book/crew", true)).toBe(false);
  });

  it("still shows the floating back on design artboards", () => {
    expect(showFixedBackButton("/design/m2/choose-visits", false)).toBe(true);
  });
});
