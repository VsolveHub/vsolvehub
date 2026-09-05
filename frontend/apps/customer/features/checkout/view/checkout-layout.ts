/**
 * Checkout follows the same responsive frame as cart and footer so cards line up
 * with the site header and footer edges.
 */
export const CHECKOUT_PAGE_BG = "bg-[#F8F9FA]";

export const CHECKOUT_PAGE_FRAME =
  "mx-auto w-full max-w-[1216px] px-4 sm:px-6 lg:px-8";

/** Matches section heading (2rem) + card top margin (1rem) before the first card. */
export const CHECKOUT_SIDEBAR_ALIGN_SPACER_CLASS = "hidden lg:block lg:h-12";

/** Two-column checkout grid: ~2/3 main + ~1/3 sticky summary rail. */
export const CHECKOUT_GRID_CLASS =
  "grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-8";

/** Sticky summary rail sits below the site header (4rem) with breathing room. */
export const CHECKOUT_SIDEBAR_STICKY_CLASS = "lg:sticky lg:top-24 lg:z-10";
