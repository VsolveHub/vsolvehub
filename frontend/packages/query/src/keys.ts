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
  },

  /** Operations' view of other people's records. */
  operations: {
    all: ["operations"] as const,
    /**
     * One Partner application under review.
     *
     * Keyed by id, unlike `partner.application()` which is always the caller's
     * own. A reviewer holds several open at once and they must not share a cache
     * entry.
     */
    partnerApplication: (applicationId: string) =>
      [...queryKeys.operations.all, "partner-application", applicationId] as const,
  },
} as const;

/** Every key this factory can produce. */
export type QueryKeys = typeof queryKeys;
