// Ported from frontend/apps/customer/features/session/view/app-chrome-layout.ts
export interface AppChromeLayout {
  contentMinHeightClass: string;
  hideMobileFooter: boolean;
  hideMobileChrome?: boolean;
  mobileBackHref?: string;
  mobileBackLabel?: string;
}

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

const REQUEST_CHROME_LAYOUT: AppChromeLayout = {
  contentMinHeightClass: "flex-1",
  hideMobileFooter: true,
  hideMobileChrome: true,
};

export function appChromeLayout(pathname: string): AppChromeLayout {
  const normalized = pathname.replace(/\/\([^)]+\)/g, "");
  if (normalized === "/cart") return CART_CHROME_LAYOUT;
  if (normalized === "/checkout") return CHECKOUT_CHROME_LAYOUT;
  if (
    normalized.startsWith("/requests") ||
    normalized.startsWith("/bookings/") ||
    normalized.startsWith("/book/")
  ) {
    return REQUEST_CHROME_LAYOUT;
  }
  return DEFAULT_CHROME_LAYOUT;
}

export function showFixedBackButton(pathname: string, claimed: boolean): boolean {
  if (pathname.startsWith("/design/")) return true;
  return !claimed;
}
