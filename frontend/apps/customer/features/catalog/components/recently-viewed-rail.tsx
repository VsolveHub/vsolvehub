"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  clearViewed,
  readViewed,
  readViewedOnServer,
  subscribeViewed,
} from "../recently-viewed";

/**
 * "Pick up where you left off" — the services this browser opened before.
 *
 * ## Why it renders nothing on the server
 *
 * The list lives in `localStorage`, which the server cannot see. `localStorage`
 * *is* an external store, so this reads it through `useSyncExternalStore` rather
 * than copying it into state in an effect: the server snapshot is empty, the
 * client snapshot is the real list, and React reconciles the two without a
 * hydration mismatch and without the cascading render an effect would cause.
 *
 * Subscribing also buys the behaviour a `useState` copy would not have — the
 * strip updates when another tab views something, and when this tab's own Clear
 * button fires.
 *
 * ## Why the entries are links and nothing else
 *
 * No price, no thumbnail, no "you looked at this 2 days ago". A price held on
 * the device goes stale into a wrong number, and the rest is decoration on what
 * should be a one-tap shortcut back. The strip's whole job is to be smaller than
 * the thing it is a shortcut to.
 */
export function RecentlyViewedRail() {
  const viewed = useSyncExternalStore(subscribeViewed, readViewed, readViewedOnServer);

  if (viewed.length === 0) return null;

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="border-t border-line pt-5"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="recently-viewed-heading"
          className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-text-muted"
        >
          Pick up where you left off
        </h2>
        <button
          type="button"
          onClick={clearViewed}
          className="rounded text-xs font-bold text-text-link underline-offset-4 transition-colors hover:text-navy-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Clear
        </button>
      </div>

      {/* Scrolls sideways on a phone rather than wrapping to three rows. The
          strip is a shortcut; it must never be taller than a thumb's reach. */}
      <ul className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {viewed.map((service) => (
          <li key={service.slug} className="shrink-0">
            <Link
              href={service.href}
              className="inline-flex max-w-[15rem] items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-navy-900 transition-colors duration-fast hover:border-navy-300 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-action"
              />
              <span className="truncate">{service.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
