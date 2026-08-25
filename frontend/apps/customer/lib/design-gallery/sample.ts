/**
 * The one customer journey the /design/m2 gallery renders.
 *
 * WHY THIS EXISTS: the customer half of M2 — slot picking, matching, visit
 * checkout, the estimate breakdown, the materials list — has no contract behind
 * it. Contract 1.43.0 lets a customer choose a `plan_size` of 1..3 and nothing
 * else; the slot grid, the signed token and the confirm all live under
 * `/api/v1/partner/…`. Rather than invent DTOs and let half-real screens pretend
 * to be wired, the screens are pure components rendered from these fixed values
 * at `/design/m2/*`, and the wired routes arrive with proposal 0015 and BE-2.
 *
 * NEVER import this from a real route. It is sample data, not a fallback. A
 * production screen rendering these numbers means something failed open, and a
 * customer would be reading somebody else's quote.
 *
 * WHY IT IS SHARED: five screen builds ran in parallel against it. Three rounds
 * of design QA on the artboards found the same defect class over and over —
 * a total that disagreed with its own rows, a count that disagreed with the list
 * beneath it. Numbers that must match live here exactly once so they cannot
 * drift apart again.
 *
 * The arithmetic, verified: work/materials/transport 1,28,000 + GST 18% 23,040
 * = Ravi's quote 1,51,040, + V Solve Hub fee and tax 1,770 = 1,52,810 payable.
 * The four payments 35,400 + 43,070 + 46,020 + 28,320 re-sum to 1,52,810, and
 * their shares 23 + 28 + 30 + 19 make 100.
 */

export const SAMPLE_SERVICE = "Full Bathroom Plumbing";

export const SAMPLE_SITE = {
  locality: "Kondapur",
  postalCode: "500084",
  /** Locality-level only. The exact address is withheld until payment. */
  approximate: "Kondapur — 500084",
  full: "Flat 402, Sai Sadan Apartments, Kondapur, Hyderabad — 500084",
  landmark: "Opposite Ratnadeep Supermarket",
} as const;

export const SAMPLE_PARTNER = {
  name: "Ravi Kumar",
  shortName: "Ravi K.",
  initials: "RK",
  trade: "Plumber",
  rating: "4.8",
  visitCount: 214,
} as const;

/**
 * Visit-plan tiers. Server-published in the real flow — the client never
 * invents a price, which is why the chooser component refuses to print one it
 * was not given.
 */
export const SAMPLE_VISIT_TIERS = [
  { planSize: 1, priceLabel: "₹199", note: null },
  { planSize: 2, priceLabel: "₹349", note: "Most people compare two" },
  { planSize: 3, priceLabel: "₹499", note: "Widest spread of prices" },
] as const;

export const SAMPLE_CHOSEN_PLAN = { planSize: 3, priceLabel: "₹499" } as const;

/**
 * One requested slot per estimate, each with its own independent state.
 *
 * All three states are represented deliberately: partial matching is the case
 * the screens exist to handle honestly, and a sample where everything succeeds
 * would let a build ship that cannot render a failure.
 */
export const SAMPLE_VISITS = [
  {
    index: 1,
    day: "Tue 2 Sep",
    window: "10:00 – 12:00",
    state: "HELD",
    holdRemaining: "9:41",
  },
  {
    index: 2,
    day: "Wed 3 Sep",
    window: "16:00 – 18:00",
    state: "SEARCHING",
    offeredTo: 5,
    availableCount: 9,
  },
  {
    index: 3,
    day: "Thu 4 Sep",
    window: "10:00 – 12:00",
    state: "NO_PROFESSIONAL_FOUND",
  },
] as const;

/** Fixed copy. Says plainly that nothing was charged — see FE-2. */
export const NO_PROFESSIONAL_COPY =
  "No professional is available for this slot. Nothing has been charged.";

export const SAMPLE_ARRIVAL_CODE = "4729";

/** The three estimates the customer compares. Deliberately unlike each other. */
export const SAMPLE_ESTIMATES = [
  {
    id: "est-ravi",
    partnerName: "Ravi Kumar",
    initials: "RK",
    rating: "4.8",
    visitCount: 214,
    mode: "Item-wise",
    total: "₹1,52,810",
    startsOn: "Mon 8 Sep",
    duration: "12 days",
    warranty: "1 year",
    installmentCount: 3,
  },
  {
    id: "est-nagaraju",
    partnerName: "Nagaraju M.",
    initials: "NM",
    rating: "4.6",
    visitCount: 88,
    mode: "Labour-wise",
    total: "₹1,06,082",
    startsOn: "Fri 5 Sep",
    duration: "9 days",
    warranty: "6 months",
    installmentCount: 2,
  },
  {
    id: "est-balaji",
    partnerName: "Sri Balaji Works",
    initials: "SB",
    rating: "4.9",
    visitCount: 341,
    mode: "Item-wise",
    total: "₹1,71,600",
    startsOn: "Fri 12 Sep",
    duration: "10 days",
    warranty: "2 years",
    installmentCount: 4,
  },
] as const;

/**
 * How Ravi's price is built. Every line is server-derived; the client displays
 * and never computes, which is why these are strings rather than paise.
 */
export const SAMPLE_MONEY = {
  worksAndMaterials: "₹1,28,000",
  taxLabel: "GST 18%",
  tax: "₹23,040",
  partnerQuote: "₹1,51,040",
  platformFee: "₹1,770",
  customerTotal: "₹1,52,810",
  validUntil: "15 Sep",
} as const;

/**
 * What the customer pays and when. The materials advance is separate from the
 * three installments because it funds goods rather than a stage of work — and
 * because this quote's materials are PARTNER-supplied, which is what makes it
 * different from the labour-only quote on the other gallery page.
 */
export const SAMPLE_MATERIALS_ADVANCE = {
  label: "Materials advance",
  amount: "₹35,400",
  sharePercent: 23,
} as const;

export const SAMPLE_INSTALLMENTS = [
  {
    position: 1,
    title: "Demolition, chasing & piping",
    deliverable:
      "Old fittings removed, walls chased and CPVC concealed lines laid and pressure-tested in both bathrooms.",
    amount: "₹43,070",
    sharePercent: 28,
    expectedCompletion: "Fri 12 Sep",
    /** The breakdown shown at checkout, per BE-6's disclosure rule. */
    partnerService: "₹35,000",
    tax: "₹6,300",
    platformFee: "₹1,770",
  },
  {
    position: 2,
    title: "Waterproofing & tiling",
    deliverable: "Both bathrooms tiled and cured.",
    amount: "₹46,020",
    sharePercent: 30,
    expectedCompletion: "Wed 17 Sep",
    partnerService: "₹39,000",
    tax: "₹7,020",
    platformFee: "₹0",
  },
  {
    position: 3,
    title: "Fittings, testing & handover",
    deliverable: "All fittings live and handed over.",
    amount: "₹28,320",
    sharePercent: 19,
    expectedCompletion: "Sat 20 Sep",
    partnerService: "₹24,000",
    tax: "₹4,320",
    platformFee: "₹0",
  },
] as const;
