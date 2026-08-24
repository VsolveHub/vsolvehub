export interface AppChromeLayout {
  contentMinHeightClass: string;
  hideMobileFooter: boolean;
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
  // Header (4rem) + mobile tab bar (3.5rem) are both fixed chrome. Subtract
  // them once so a short cart fills the viewport without manufacturing a
  // second screen of blank space. The desktop has no tab bar.
  contentMinHeightClass:
    "min-h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:min-h-[calc(100dvh-4rem)]",
  hideMobileFooter: true,
};

export function appChromeLayout(pathname: string): AppChromeLayout {
  return pathname === "/cart" ? CART_CHROME_LAYOUT : DEFAULT_CHROME_LAYOUT;
}
