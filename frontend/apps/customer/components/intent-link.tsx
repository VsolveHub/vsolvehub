"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * `next/link` that prefetches once someone reaches for it — a touch, a hover
 * or keyboard focus — instead of as soon as it scrolls into view.
 *
 * The catalogue draws dozens of category, tile and service links per screen.
 * Prefetched on sight, they were 145 requests in the first 40 s of a slow 4G
 * visit: 18% of every byte, queued while the first screen's images were still
 * arriving, and most of them Vercel function calls. Now only the link a person
 * goes for is fetched.
 *
 * The cost: a tap starts its prefetch only a moment before the navigation, so
 * the first open of a tile can take a little longer to show its loading screen.
 * Keep plain `Link` for the few single links (cart, home) worth having ready.
 */
export function IntentLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      // `null` is Next's default prefetch, switched on by intent (Next's documented hover pattern).
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
