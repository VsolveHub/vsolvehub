"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, safely across server rendering.
 *
 * ## Why this exists rather than a CSS-only branch
 *
 * Most responsive differences belong in CSS, and this hook is not for those. It
 * exists for the case CSS genuinely cannot express: two layouts that need
 * **different DOM**, not different styling on the same DOM.
 *
 * The crew booking form is that case. On a phone it is a two-step wizard; on a
 * wide screen it is one page with a price rail. Rendering both and hiding one
 * with `display:none` would put two radio groups named `work_type` in the same
 * document, where the browser treats them as one group and the two views fight
 * over which option is checked. Duplicated form controls are not a styling
 * problem.
 *
 * ## Why `useSyncExternalStore`
 *
 * The naive version — `useState` plus an effect — renders `false` on the server,
 * renders `false` on the first client pass, then flips. That is correct but it
 * is easy to get subtly wrong, and it re-renders every subscriber on every
 * resize rather than only when the answer changes.
 *
 * `useSyncExternalStore` takes an explicit **server snapshot**, which is the
 * honest statement of what the server can know: nothing. It returns `false`
 * there and on the first client render, so hydration always matches, and then
 * settles to the real answer. Mobile-first is what that default means — the
 * narrow layout is what renders when the width is unknown, which is the right
 * way round for this product.
 *
 * A component using this must therefore tolerate one frame of the mobile layout
 * on a desktop load. That is a real cost and it is why this is not the default
 * tool: reach for `lg:` first, and come here only when the DOM has to differ.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // The server knows no viewport. Saying so explicitly is what keeps hydration
  // identical rather than merely usually identical.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The `lg` breakpoint, as a hook.
 *
 * 1024px, matching Tailwind's own `lg` — the same line the `lg:` utilities
 * break at, written once so a JS branch and a CSS branch can never disagree
 * about where "wide" starts.
 */
export function useIsWideScreen(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
