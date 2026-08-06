import type { Metadata } from "next";

import { CheckoutWorkspace } from "@/features/checkout/view/checkout-workspace";

/**
 * Checkout: address, one start time per visit, review, confirm.
 *
 * ## Why this is not `force-dynamic`
 *
 * The same reasoning as `/cart`. This module reads no cookies, no headers and no
 * search params, calls no API, and returns the same element tree for every
 * visitor. The cart, addresses, visits, plans and price are fetched by the client
 * workspace under the caller's own credentials, so the privacy property is
 * structural rather than configured.
 *
 * If this route ever awaits `cookies()`, `headers()` or an authenticated read, it
 * must become dynamic again in the same change.
 *
 * Not indexed, and not followed either: every link from here leads deeper into a
 * half-configured booking that belongs to one person.
 */
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutWorkspace />;
}
