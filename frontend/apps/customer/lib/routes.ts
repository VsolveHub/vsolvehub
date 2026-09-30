/**
 * Every Customer route that is built from a record id, in one place.
 *
 * ## Why this exists rather than a prop
 *
 * The M2 feature folders were written to own no route — a view that hardcodes
 * `/requests/${id}` is a view that cannot be mounted anywhere else — so each
 * screen took its destinations as **functions** and the page supplied them:
 *
 * ```tsx
 * <RequirementFlow requestHrefFor={(id) => `/requests/${id}`} … />
 * ```
 *
 * The principle is right and the mechanism is not allowed. Those screens are
 * Client Components and the pages are Server Components, and **a function
 * cannot cross that boundary** — React refuses to serialize it:
 *
 * > Functions cannot be passed directly to Client Components unless you
 * > explicitly expose it by marking it with "use server".
 *
 * It never fired while the requirement flow was unreachable; the moment
 * contract 1.28.0 let the flow resolve a variant, the first render after it
 * threw. The engagement screen carried three more of the same prop.
 *
 * A module both sides can import keeps the property that mattered — one place
 * to change a route, and no route literal buried in a view — without putting a
 * function on the wire. Importing it into a Client Component is free: these are
 * pure string builders with no server dependency.
 *
 * ## Why not `use server`
 *
 * Marking them Server Actions would make each link construction a network round
 * trip to compute a string this app already knows. Server Actions are for
 * mutations, not for path arithmetic.
 */

/** One requirement's own page: matching state, teasers or visits, quotes. */
export function requestHref(requirementId: string): string {
  return `/requests/${requirementId}`;
}

/**
 * The quotes on one requirement — the screen that answers "what did they say".
 *
 * Separate from `requestHref` because a notice about a quote and a notice about
 * a request want different destinations. "Unlock to read the full quote" landing
 * on the request page is a link that is technically correct and practically a
 * dead end: the reader has to find the quotes themselves, on the one screen
 * whose whole purpose was to be found.
 */
export function requestQuotesHref(requirementId: string): string {
  return `/requests/${requirementId}/quotes`;
}

/** One professional's estimate, read in full on its own page. */
export function requestEstimateHref(requirementId: string, proposalId: string): string {
  return `${requestQuotesHref(requirementId)}/${proposalId}`;
}

/** The clarification thread with one professional, on that estimate. */
export function estimateQuestionsHref(requirementId: string, proposalId: string): string {
  return `${requestEstimateHref(requirementId, proposalId)}/questions`;
}

/**
 * The one step between "Choose" and the agreement: what is being agreed to,
 * read once, before the selection that opens the engagement.
 */
export function estimateConfirmHref(requirementId: string, proposalId: string): string {
  return `${requestEstimateHref(requirementId, proposalId)}/confirm`;
}

/**
 * One site visit's own page: who is coming, the arrival code, what happens next.
 *
 * Nested under the requirement rather than living at `/visits/{id}` because a
 * visit has no meaning without the request it belongs to — the breadcrumb, the
 * plan it is a share of, and the estimate it is owed are all read from there.
 */
export function visitHref(requirementId: string, siteVisitId: string): string {
  return `/requests/${requirementId}/visits/${siteVisitId}`;
}

/** One Booking Group — the customer's multi-visit checkout record. */
export function bookingGroupHref(groupId: string): string {
  return `/bookings/${groupId}`;
}

/**
 * One visit inside a Booking Group.
 *
 * Nested under the group because that is the customer's mental model — "my
 * booking, the second visit" — and because the back link has somewhere honest
 * to go. The booking id alone is enough for Django; the group id is for
 * navigation and for reading sibling-unit context on the detail screen.
 */
export function bookingVisitHref(groupId: string, bookingId: string): string {
  return `${bookingGroupHref(groupId)}/visits/${bookingId}`;
}

/** The Customer's list of requests. Where a failed record read falls back to. */
export const REQUESTS_HREF = "/requests";

/** The catalog, for a Customer who wants to describe something else. */
export const BROWSE_HREF = "/catalog";

/**
 * Career/Jobs (A10_LISTING) catalog slug — taxonomy only, not an area-priced
 * bookable category. Public discovery is the listing surface, never cart/book.
 */
export const CAREER_JOBS_CATEGORY_SLUG = "career-jobs";
export const RENTAL_SERVICES_CATEGORY_SLUG = "rental-services";
export const STAY_CATEGORY_SLUG = "rooms-pg-hostel-hotels";

/** Customer Career/Jobs browse (published listings, apply, applications). */
export const LISTINGS_HREF = "/listings";
export const RENTALS_HREF = "/rentals";
export const STAYS_HREF = "/stays";

/** Whether a catalog category slug is the A10 Career/Jobs entry. */
export function isCareerJobsCategory(categorySlug: string): boolean {
  return categorySlug === CAREER_JOBS_CATEGORY_SLUG;
}

export function isRentalCategory(categorySlug: string): boolean {
  return categorySlug === RENTAL_SERVICES_CATEGORY_SLUG;
}

export function isStayCategory(categorySlug: string): boolean {
  return categorySlug === STAY_CATEGORY_SLUG;
}

/**
 * Public listing browse. Optional `service` slug is a soft filter hint for the
 * listings UI when arriving from a catalog service deep-link.
 */
export function listingsBrowseHref(serviceSlug?: string): string {
  if (serviceSlug === undefined || serviceSlug === "") return LISTINGS_HREF;
  return `${LISTINGS_HREF}?service=${encodeURIComponent(serviceSlug)}`;
}

export function rentalsBrowseHref(serviceSlug?: string): string {
  if (serviceSlug === undefined || serviceSlug === "") return RENTALS_HREF;
  return `${RENTALS_HREF}?service=${encodeURIComponent(serviceSlug)}`;
}

export function staysBrowseHref(serviceSlug?: string): string {
  if (serviceSlug === undefined || serviceSlug === "") return STAYS_HREF;
  return `${STAYS_HREF}?service=${encodeURIComponent(serviceSlug)}`;
}

/**
 * Where opening a catalog category goes.
 *
 * Career/Jobs must land on `/listings` — the catalogue tile browser only shows
 * area-priced bookables and would otherwise empty-state A10 as "nothing on sale".
 * Rental and Stay land on their native surfaces — never cart / book / requests.
 */
export function catalogCategoryHref(categorySlug: string, tileSlug?: string): string {
  if (isCareerJobsCategory(categorySlug)) {
    return tileSlug ? `${LISTINGS_HREF}?service=${encodeURIComponent(tileSlug)}` : LISTINGS_HREF;
  }
  if (isRentalCategory(categorySlug)) {
    return tileSlug ? `${RENTALS_HREF}?category=${encodeURIComponent(tileSlug)}` : RENTALS_HREF;
  }
  if (isStayCategory(categorySlug)) {
    return tileSlug ? `${STAYS_HREF}?category=${encodeURIComponent(tileSlug)}` : STAYS_HREF;
  }
  if (tileSlug !== undefined && tileSlug !== "") {
    return `/catalog/${categorySlug}?tile=${encodeURIComponent(tileSlug)}`;
  }
  return `/catalog/${categorySlug}`;
}

/**
 * The A3 preset — `Book a crew` at the published day rate (revision 4).
 *
 * A **static** `book` segment beside the existing `new` one, deliberately: the
 * level already carries `/requests/[requirementId]`, and Next refuses two
 * different dynamic slug names at one path level. A static segment wins over the
 * dynamic sibling and leaves `[requirementId]` untouched, which is the same
 * lesson `/bookings/workforce` was built on after `/bookings/[groupId]` blocked
 * `/bookings/[engagementId]`.
 */
export function bookCrewHref(serviceSlug: string): string {
  return `/requests/book/${serviceSlug}`;
}

/**
 * The A3 booking-fee checkout, opened only while a lead's offer is held.
 *
 * This remains a route because the crew checkout has its own recovery screen.
 * The A5 visit checkout instead recovers on the request page that owns its
 * visit-plan tracker.
 */
export function bookCrewFeeHref(requirementId: string): string {
  return `/requests/${requirementId}/book-crew`;
}

/** One agreement, keyed by the engagement so a months-old notification resolves. */
export function engagementHref(engagementId: string): string {
  return `/jobs/${engagementId}`;
}

/**
 * The receipt for the fee Vsolve collected on one engagement.
 *
 * Its own route rather than a modal because a receipt is a record somebody
 * comes back to, forwards to whoever keeps their books, and expects to find at
 * a URL. A dialog cannot be any of those.
 */
export function receiptHref(engagementId: string): string {
  return `/jobs/${engagementId}/receipt`;
}

/** One stage's own review route — the money screen, reachable from a notification. */
export function stageHref(engagementId: string, stageId: string): string {
  return `/jobs/${engagementId}/stages/${stageId}`;
}

/**
 * The list an engagement belongs to, which depends on **how it is paid for**.
 *
 * Only known once the record has loaded, which is why this is a function of the
 * mode rather than a single href on the page. Sending an A3 Customer to
 * `Your projects` would be the wrong promise as well as the wrong page: a
 * `LEAD_ONLY` engagement is a connection the Customer pays for directly, and
 * filing it under projects implies a protection Vsolve is not providing.
 */
export function engagementListHref(mode: "lead_only" | "managed"): string {
  return mode === "lead_only" ? "/bookings/workforce" : "/projects";
}

/**
 * One engagement's receipt.
 *
 * Separate from `engagementHref` because a receipt is a document somebody
 * forwards to whoever keeps their books, and "the booking page, then find the
 * receipt on it" is not an address you can forward.
 */
export function engagementReceiptHref(engagementId: string): string {
  return `${engagementHref(engagementId)}/receipt`;
}
