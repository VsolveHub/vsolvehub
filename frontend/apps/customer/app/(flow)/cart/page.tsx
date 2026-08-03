import type { Metadata } from "next";

import { GroupBookingWorkspace } from "@/features/booking/group/view/workspace";

/**
 * The booking route.
 *
 * ## Why this is not `force-dynamic`
 *
 * `force-dynamic` is the right tool when a *server* render would bake one
 * caller's data into output another caller could receive. Nothing here does
 * that: this module reads no cookies, no headers and no search params, calls no
 * API, and returns the same element tree for every visitor. The cart, the saved
 * addresses, the plans and the price are all fetched by the client workspace
 * from the browser, under the caller's own credentials.
 *
 * So the privacy property is structural rather than configured — there is no
 * per-caller data at this layer to leak — and forcing a server render per request
 * would buy nothing while adding latency to every navigation. The shell is
 * prerendered and the workspace fills it in.
 *
 * That reasoning is load-bearing. If this route ever awaits `cookies()`,
 * `headers()` or an authenticated read, it must become dynamic again in the same
 * change.
 *
 * Not indexed either way: a half-configured booking is not a useful search
 * result, and indexing it would compete with the catalog page that is.
 */
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return <GroupBookingWorkspace />;
}
