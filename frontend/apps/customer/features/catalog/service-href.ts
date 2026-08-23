import type { ServiceCard } from "./queries";

/**
 * Where tapping a service goes.
 *
 * ## Why this is not in `service-card.tsx`
 *
 * It used to be, and that stopped working the moment the card became a Client
 * Component to own its add-to-basket controls: `"use client"` marks *every*
 * export of a module as a client reference, so a Server Component importing
 * this function got
 *
 * > Attempted to call serviceHref() from the server but serviceHref is on the
 * > client.
 *
 * — a runtime failure, not a build one, so it surfaced as the catalogue's error
 * screen rather than as a compile error. `ServiceRow` renders on the server and
 * needs the same answer the card needs.
 *
 * This is the same lesson `lib/routes.ts` was written for: a route builder is
 * pure string arithmetic, it belongs in a module both sides can import, and
 * neither side pays anything to import it.
 *
 * ## Why the guided lifecycles skip the service page
 *
 * An A1 service genuinely needs its own page: there are tasks to pick, a price
 * that depends on which, and availability to check. A guided requirement has
 * none of that. Its service page carried a paragraph and a single button whose
 * only job was to say "continue" — an interstitial between the customer choosing
 * a service and the screen that asks about it, which on a phone is a whole
 * screen spent on a tap.
 *
 * So A3 goes straight to the crew form and A5 straight to the brief. The service
 * page still exists and still works for anyone who deep-links to it; it simply
 * stops being on the path.
 *
 * `request_archetypes` is the server's own list, which is what makes this a
 * routing decision rather than a guess: `bookable_variant_id` marks the A1 path
 * and nothing marked the others until this field was published.
 */
const A3_TIME_BLOCK = "A3_TIME_BLOCK";

export function serviceHref(service: ServiceCard, categorySlug: string): string {
  if (service.request_archetypes.includes(A3_TIME_BLOCK)) {
    return `/requests/book/${service.slug}`;
  }
  if (service.request_archetypes.length > 0) return `/requests/new/${service.slug}`;
  return `/catalog/${categorySlug}/${service.slug}`;
}
