export interface AppChromeLayout {
  contentMinHeightClass: string;
  hideMobileFooter: boolean;
  /** Hide the site header and bottom tab bar on mobile; use a fixed back control instead. */
  hideMobileChrome?: boolean;
  mobileBackHref?: string;
  mobileBackLabel?: string;
}

// Some embedded/device-preview browsers expose a visual viewport wider than
// the document's shrink-to-fit containing block. Static page chrome then stays
// phone-width while fixed elements span the screen. Bind both to the dynamic
// viewport and clip only accidental horizontal paint.
export const CUSTOMER_VIEWPORT_WIDTH_CLASS = "w-dvw max-w-none overflow-x-clip";

const DEFAULT_CHROME_LAYOUT: AppChromeLayout = {
  contentMinHeightClass: "min-h-screen",
  hideMobileFooter: false,
};

const CART_CHROME_LAYOUT: AppChromeLayout = {
  contentMinHeightClass:
    "min-h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:min-h-[calc(100dvh-4rem)]",
  hideMobileFooter: true,
  hideMobileChrome: true,
  mobileBackHref: "/catalog",
  mobileBackLabel: "Back to services",
};

const CHECKOUT_CHROME_LAYOUT: AppChromeLayout = {
  contentMinHeightClass:
    "min-h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:min-h-[calc(100dvh-4rem)]",
  hideMobileFooter: true,
  hideMobileChrome: true,
  mobileBackHref: "/cart",
  mobileBackLabel: "Back to cart",
};

export function appChromeLayout(pathname: string): AppChromeLayout {
  if (pathname === "/cart") return CART_CHROME_LAYOUT;
  if (pathname === "/checkout") return CHECKOUT_CHROME_LAYOUT;
  return DEFAULT_CHROME_LAYOUT;
}

/**
 * Whether the floating circular back control should render.
 *
 * Design-gallery artboards are server pages with no `MobileScreen`, so they
 * still need it. A claimed viewport already has a header back control — stacking
 * the circle on `/requests/book/*` is what covered "Book event staff".
 */
export function showFixedBackButton(pathname: string, claimed: boolean): boolean {
  if (pathname.startsWith("/design/")) return true;
  return !claimed;
}
