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

/** The Customer's list of requests. Where a failed record read falls back to. */
export const REQUESTS_HREF = "/requests";

/** The catalog, for a Customer who wants to describe something else. */
export const BROWSE_HREF = "/catalog";

/** One agreement, keyed by the engagement so a months-old notification resolves. */
export function engagementHref(engagementId: string): string {
  return `/engagements/${engagementId}`;
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
