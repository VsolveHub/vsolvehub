import "server-only";

import { isApiRequestError, request } from "@vsolve/api-client";

import { createPublicApi } from "./api/public";

/**
 * Names and summaries for the browser tab and search result of a job, rental
 * or stay page.
 *
 * Those three pages are client components, so they cannot export metadata;
 * their `[slug]/layout.tsx` calls these instead. A public, briefly cached read
 * of the same detail endpoint the page uses — no session, so the cached answer
 * is the same for everyone. A 404 yields `"missing"` so the layout can keep the
 * empty page out of search; any other failure yields `null` and the layout falls
 * back to its generic copy, still indexable, so a brief outage never de-lists a
 * live page. The page itself still owns not-found and error states.
 */
const api = () => createPublicApi({ revalidate: 300 });

export type DetailMeta = { title: string; description: string | null };
export type DetailLookup = DetailMeta | "missing" | null;

function lookupFailed(error: unknown): DetailLookup {
  return isApiRequestError(error) && error.status === 404 ? "missing" : null;
}

/** The section's own copy for every job, rental and stay page, and the fallback below. */
export const LISTINGS_DESCRIPTION =
  "Browse current job openings from V Solve Hub hiring partners and apply online.";
export const RENTALS_DESCRIPTION =
  "Rent tools and equipment from local owners on V Solve Hub. Check availability, pickup and the deposit before you book.";
export const STAYS_DESCRIPTION =
  "Find rooms, PGs, hostels and hotels on V Solve Hub. Compare rooms and prices, then enquire or book.";

/** Search snippets are cut near 160 characters; end on a word rather than mid-word. */
const DESCRIPTION_LIMIT = 160;

export function summariseDetail(
  item: { title?: string | null; description?: string | null; location_text?: string | null },
): DetailMeta | null {
  const title = item.title?.trim();
  if (!title) return null;
  const parts = [item.location_text?.trim(), item.description?.trim().replace(/\s+/g, " ")]
    .filter(Boolean)
    .join(" · ");
  if (!parts) return { title, description: null };
  if (parts.length <= DESCRIPTION_LIMIT) return { title, description: parts };
  const cut = parts.slice(0, DESCRIPTION_LIMIT - 1);
  return { title, description: `${cut.slice(0, cut.lastIndexOf(" ")) || cut}…` };
}

export async function listingMeta(key: string): Promise<DetailLookup> {
  try {
    const listing = await request(() =>
      api().GET("/api/v1/listings/{key}", { params: { path: { key } } }),
    );
    return summariseDetail(listing);
  } catch (error) {
    return lookupFailed(error);
  }
}

export async function rentalMeta(key: string): Promise<DetailLookup> {
  try {
    const rental = await request(() =>
      api().GET("/api/v1/rentals/{key}", { params: { path: { key } } }),
    );
    return summariseDetail(rental);
  } catch (error) {
    return lookupFailed(error);
  }
}

export async function stayMeta(key: string): Promise<DetailLookup> {
  try {
    const stay = await request(() =>
      api().GET("/api/v1/stays/{key}", { params: { path: { key } } }),
    );
    return summariseDetail(stay);
  } catch (error) {
    return lookupFailed(error);
  }
}
