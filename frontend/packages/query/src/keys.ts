/**
 * Hierarchical query-key factories.
 *
 * Conventions:
 *  - Keys are built here and nowhere else. An inline array literal at a call
 *    site is how invalidation silently stops working.
 *  - Keys nest from broad to narrow, so `invalidateQueries({ queryKey:
 *    queryKeys.catalog.all })` clears every catalog query while
 *    `queryKeys.catalog.service(slug)` targets one.
 *  - Every input that changes the server's answer belongs in the key. For
 *    availability, serviceability and quotes that means address, variant,
 *    duration, fulfilment type and scope — omitting one serves another
 *    request's answer, which is a fabricated result (plan 09 §15).
 *  - TanStack Query hashes keys with sorted object keys, so plain objects are
 *    stable regardless of property order.
 *
 * Keys exist only for endpoints published in `contracts/openapi/v1.yaml`.
 * Adding a domain means the contract gained it — not that the client guessed.
 */

export const queryKeys = {
  /** Identity, sessions and devices. */
  session: {
    all: ["session"] as const,
    /** The authenticated user and session expiry. */
    current: () => [...queryKeys.session.all, "current"] as const,
    /** Active sessions for device management and revocation. */
    devices: () => [...queryKeys.session.all, "devices"] as const,
  },

  /** Customer-owned service addresses. */
  addresses: {
    all: ["addresses"] as const,
    list: () => [...queryKeys.addresses.all, "list"] as const,
    detail: (addressId: string) => [...queryKeys.addresses.all, "detail", addressId] as const,
  },

  /**
   * The customer's own privacy record: communication preferences and DSR
   * requests (contract 1.14.0).
   *
   * A sibling of `session` rather than a child. Revoking a device must not
   * discard the preference list, and switching the active role does not change
   * what the person has consented to — nesting these under `session.all` would
   * make both of those invalidations reach data they have no claim on.
   *
   * There is deliberately **no consent-receipt key**. `POST
   * /api/v1/auth/privacy/consents/` is the only published consent operation:
   * Django exposes no list, so there is no server answer to cache. A key here
   * would advertise a read that does not exist, and the first thing written
   * against it would be a client-side history — which is to say, a fabrication.
   */
  privacy: {
    all: ["privacy"] as const,
    /** Per-channel, per-purpose messaging switches. */
    preferences: () => [...queryKeys.privacy.all, "preferences"] as const,
    /** Access and erasure requests, with the status Django is working to. */
    requests: () => [...queryKeys.privacy.all, "requests"] as const,
  },

  /** Public catalog: categories, services, variant configuration. */
  catalog: {
    all: ["catalog"] as const,
    categories: () => [...queryKeys.catalog.all, "categories"] as const,
    categoryServices: (categorySlug: string) =>
      [...queryKeys.catalog.all, "category", categorySlug, "services"] as const,
    service: (serviceSlug: string) => [...queryKeys.catalog.all, "service", serviceSlug] as const,
    serviceConfiguration: (serviceSlug: string) =>
      [...queryKeys.catalog.all, "service", serviceSlug, "configuration"] as const,
  },

  /**
   * The multi-item cart, fulfilment plans and the selected-plan group quote
   * (published contract 1.10.0).
   *
   * ## Why the cart still has no id in its key
   *
   * There is one active cart per customer or session, and the server decides
   * which one that is from the credentialed request. An id in the key would be a
   * second source of truth for something the client cannot choose. The cart's
   * *version*, by contrast, appears in every key derived from it, because the
   * version is exactly what makes a plan or a price still true.
   *
   * ## Why plan sets and quotes are keyed by id alone
   *
   * Both are created by a server command and read back by opaque id. The server
   * minted that id *for* one cart version, one address and one requested start,
   * so the id already carries every answer-changing input. Repeating those
   * inputs in the key would let two keys disagree about one immutable record.
   */
  booking: {
    all: ["booking"] as const,

    /** The customer's or session's one active cart, with its version. */
    cart: () => [...queryKeys.booking.all, "cart"] as const,

    /**
     * Candidate start times for one cart and one address.
     *
     * Both belong in the key. The address decides the service area and its
     * operating hours; the cart version decides what work has to fit inside
     * them. Serving one cart's times for another is a fabricated availability
     * claim, which is the same failure as serving one address's.
     */
    windows: (input: { cartVersion: number; addressId: string }) =>
      [...queryKeys.booking.all, "windows", input] as const,

    /** Every plan set, for invalidation when the cart changes underneath them. */
    planSets: () => [...queryKeys.booking.all, "plan-sets"] as const,

    /** One immutable, expiring set of server-authored plan alternatives. */
    planSet: (planSetId: string) => [...queryKeys.booking.planSets(), planSetId] as const,

    /** Every group quote, for invalidation when the cart changes underneath them. */
    planQuotes: () => [...queryKeys.booking.all, "plan-quotes"] as const,

    /** One immutable selected-plan quote, including its historical states. */
    planQuote: (quoteId: string) => [...queryKeys.booking.planQuotes(), quoteId] as const,

    /**
     * The customer's materialized Booking Groups (contract 1.9.0).
     *
     * Under `booking` rather than beside it, because a cart command that
     * invalidates plans and quotes must *not* touch these: a Booking Group has
     * left the cart behind. `groups()` is the list; `group(id)` is one live
     * record being observed. Both are nested so a future "everything about
     * bookings" invalidation can reach them, and neither is reachable from
     * `planSets()` or `planQuotes()`.
     */
    groups: () => [...queryKeys.booking.all, "groups"] as const,
    group: (groupId: string) => [...queryKeys.booking.groups(), groupId] as const,
  },

  /**
   * Money: payment attempts, orders, refunds and tax documents (contract 1.10.0,
   * reachable from a Booking Group since 1.14.0).
   *
   * A sibling of `booking` rather than a child of it. A payment outlives the
   * group state that triggered it — the attempt is still the authoritative record
   * of what was charged after the group has moved to `BOOKED`, and the order and
   * its invoice outlive the group entirely. Nesting them under `booking.group(id)`
   * would put a financial record inside a cache entry that group invalidation is
   * entitled to discard.
   *
   * Everything is keyed by the server's own identifier. There is deliberately no
   * "current payment" key: which attempt is current is a server fact, read through
   * `forCheckout`, not something the client decides by remembering the last one it
   * created.
   */
  payment: {
    all: ["payment"] as const,

    /** One payment attempt, observed until the provider outcome settles. */
    attempt: (attemptId: string) => [...queryKeys.payment.all, "attempt", attemptId] as const,

    /**
     * The latest attempt for a checkout, as Django orders them.
     *
     * The recovery read. After a lost provider redirect the client may hold no
     * attempt id at all — it has only the checkout — and this is how it finds out
     * whether the attempt it started actually exists and where it got to.
     */
    forCheckout: (checkoutId: string) =>
      [...queryKeys.payment.all, "checkout", checkoutId] as const,

    /** The Order created at capture: per-unit allocations and tax documents. */
    order: (orderId: string) => [...queryKeys.payment.all, "order", orderId] as const,

    /** One immutable invoice or credit note. */
    taxDocument: (documentId: string) =>
      [...queryKeys.payment.all, "tax-document", documentId] as const,

    /** One refund and its per-unit allocations. */
    refund: (refundId: string) => [...queryKeys.payment.all, "refund", refundId] as const,
  },

  /** Geocoding and serviceability lookups. */
  locations: {
    all: ["locations"] as const,
    /**
     * Reverse geocode for a coordinate pair.
     *
     * Rounded by the caller before it reaches the key: raw GPS jitter would
     * otherwise produce a new cache entry on every reading.
     */
    reverseGeocode: (input: { latitude: string; longitude: string }) =>
      [...queryKeys.locations.all, "reverse-geocode", input] as const,
    /**
     * Serviceability for a location and service variant.
     *
     * The variant is part of the key because serviceability is per-service: an
     * area may support one trade and not another.
     */
    serviceability: (input: { postalCode: string; serviceVariantId?: string }) =>
      [...queryKeys.locations.all, "serviceability", input] as const,
  },

  /**
   * Applicant-visible reference data published in contract 1.4.0.
   *
   * Separate from `partner` because it is not the caller's own record: the same
   * areas, skills and consent documents are served to every applicant, so they
   * carry `STATIC_CONTENT` freshness and must not be invalidated when one
   * Partner saves their application.
   */
  reference: {
    all: ["reference"] as const,
    serviceAreas: () => [...queryKeys.reference.all, "service-areas"] as const,
    partnerSkills: () => [...queryKeys.reference.all, "partner-skills"] as const,
    requiredConsents: () => [...queryKeys.reference.all, "required-consents"] as const,
  },

  /** The signed-in Partner's own application, eligibility and schedule. */
  partner: {
    all: ["partner"] as const,
    /** Profile, approval state and current eligibility. */
    me: () => [...queryKeys.partner.all, "me"] as const,
    /**
     * The application, including its documents and transition history.
     *
     * One key rather than one per section: the application is versioned as a
     * whole and every mutation returns the whole thing, so splitting it would
     * mean caching pieces at different versions of the same record.
     */
    application: () => [...queryKeys.partner.all, "application"] as const,
    /** Weekly availability rules and dated exceptions. */
    availability: () => [...queryKeys.partner.all, "availability"] as const,

    /**
     * The Partner's live offer inbox (contract 1.9.0).
     *
     * One key for the whole inbox, with no per-offer entry. Every command
     * returns the affected offer, but an offer is only ever read *as part of*
     * the inbox — there is no published `GET /partner/offers/{id}/` — so a
     * per-offer cache entry would be a second home for data with one source.
     * Commands write the returned offer back into this list instead.
     */
    offers: () => [...queryKeys.partner.all, "offers"] as const,
  },

  /** Operations' view of other people's records. */
  operations: {
    all: ["operations"] as const,

    /**
     * The Partner-application review queue.
     *
     * Filters are part of the key because they change the server's answer:
     * "assigned to me" and "unassigned" are different queues, and sharing one
     * cache entry would show a reviewer someone else's work. The cursor is not
     * in the key — pages accumulate under one infinite-query entry.
     */
    partnerApplicationQueue: (filters: {
      status?: string;
      assignedToMe?: boolean;
      unassigned?: boolean;
    }) => [...queryKeys.operations.all, "partner-application-queue", filters] as const,
    /**
     * One Partner application under review.
     *
     * Keyed by id, unlike `partner.application()` which is always the caller's
     * own. A reviewer holds several open at once and they must not share a cache
     * entry.
     */
    partnerApplication: (applicationId: string) =>
      [...queryKeys.operations.all, "partner-application", applicationId] as const,

    /**
     * Proposed and reviewed service-compatibility rules (contract 1.15.0).
     *
     * Filters are in the key for the same reason the application queue's are:
     * "drafts awaiting review" and "active rules" are different questions, and a
     * shared cache entry would answer one with the other.
     */
    compatibilityRules: (filters: { lifecycleStatus?: string; variantId?: string }) =>
      [...queryKeys.operations.all, "compatibility-rules", filters] as const,

    /**
     * One rule, at one version.
     *
     * Keyed by id and read separately from the queue row it was opened from.
     * Every command on a rule carries the version the reviewer was looking at,
     * so the detail has to be able to refetch on its own after a conflict
     * without disturbing the queue underneath it.
     */
    compatibilityRule: (ruleId: string) =>
      [...queryKeys.operations.all, "compatibility-rule", ruleId] as const,
  },
} as const;

/** Every key this factory can produce. */
export type QueryKeys = typeof queryKeys;
