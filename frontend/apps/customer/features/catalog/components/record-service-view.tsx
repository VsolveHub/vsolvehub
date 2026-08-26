"use client";

import { useEffect } from "react";

import { recordViewed } from "../recently-viewed";

/**
 * Records that this browser opened a service page.
 *
 * Renders nothing. It is a component rather than a call inside the page because
 * the pages are Server Components and `localStorage` only exists in the browser
 * — this is the smallest possible client boundary around that fact.
 *
 * In an effect, so it runs after paint and never blocks the page it is
 * describing. Storage failures are swallowed inside `recordViewed`: a browse
 * convenience must not be able to take down a page someone is reading.
 */
export function RecordServiceView({
  slug,
  name,
  href,
}: {
  slug: string;
  name: string;
  href: string;
}) {
  useEffect(() => {
    recordViewed({ slug, name, href });
  }, [slug, name, href]);

  return null;
}
