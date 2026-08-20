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

/** The Customer's list of requests. Where a failed record read falls back to. */
export const REQUESTS_HREF = "/requests";

/** The catalog, for a Customer who wants to describe something else. */
export const BROWSE_HREF = "/catalog";

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
 * A route rather than a modal, for the reason `/requests/[id]/book-visits` is
 * one: a payment is a record that outlives the screen that started it, and a
 * Customer who closed the tab mid-UPI comes back to a URL.
 */
export function bookCrewFeeHref(requirementId: string): string {
  return `/requests/${requirementId}/book-crew`;
}

/** One agreement, keyed by the engagement so a months-old notification resolves. */
export function engagementHref(engagementId: string): string {
  return `/engagements/${engagementId}`;
}

/**
 * The receipt for the fee Vsolve collected on one engagement.
 *
 * Its own route rather than a modal, for the reason `book-visits` is one: a
 * receipt is a record somebody comes back to, forwards to whoever keeps their
 * books, and expects to find at a URL. A dialog cannot be any of those.
 */
export function receiptHref(engagementId: string): string {
  return `/engagements/${engagementId}/receipt`;
}

/** One stage's own review route — the money screen, reachable from a notification. */
export function stageHref(engagementId: string, stageId: string): string {
  return `/engagements/${engagementId}/stages/${stageId}`;
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
