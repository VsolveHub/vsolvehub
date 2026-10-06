// Ported from frontend/apps/partner/features/proposal/model/estimate-view.ts
/**
 * What the estimate screens render.
 *
 * These are VIEW types, not wire types. The published contract at 1.43.0 cannot
 * express an item-wise estimate at all — it has no `ITEM_WISE`/`LABOUR_WISE`
 * discriminator, no per-line `unit`/`quantity`/`rate`, no `category` to group
 * by, and A3 labour is three flat integers on the proposal root rather than an
 * array of roles. So the screens are written against this shape and an adapter
 * maps the contract onto it once Codex publishes the estimate surface
 * (proposal 0015). When that lands, only the adapter changes; nothing in the
 * view layer moves.
 *
 * Everything here is pre-formatted for display. Money arrives as a string that
 * has already been through `formatMoney`, because a view type carrying paise is
 * a view type that will one day be divided by 100 twice. The server owns every
 * derived figure; nothing in this file is arithmetic the client is allowed to
 * do.
 */

/** Exactly one line family per estimate. Mixed-mode is out of scope for M2. */
export type EstimateMode = "ITEM_WISE" | "LABOUR_WISE";

/** A priced line the partner entered, in either mode. */
export interface EstimateLineView {
  id: string;
  /** Display name, e.g. "Switch (6A)" or "Electrician". */
  name: string;
  /** Qualifier under the name, e.g. "Fitting", "Skilled". */
  qualifier?: string;
  /** Formatted line total, or null when the partner has not priced it yet. */
  amount: string | null;
  /**
   * The working as one pre-rendered string, e.g. "5 Nos × ₹80" or "5 × 5 × ₹600".
   * This is what the COLLAPSED row shows.
   *
   * The three structured fields below are what the OPEN row's controls bind to.
   * They are carried separately and not parsed back out of this string: two
   * independent screen builds each wrote a regex to recover them, and a display
   * string is the worst possible source of truth for a form — it breaks on a
   * locale that groups differently, on a unit containing a space, and on the
   * multiplication sign the day someone types `x` instead of `×`.
   */
  workings: string;
  /** Unit of measure, e.g. "Nos", "Sq.ft", "Per Pax", "rft". */
  unit: string;
  /**
   * Quantity as a display string, not a number. Painting quotes 500 sq ft and
   * catering quotes 200 pax, but a half-day of labour is 0.5 — so this is
   * decimal, and a float here would eventually render 0.30000000000000004.
   */
  quantity: string;
  /** Formatted unit rate, e.g. "₹80" or "₹600" per day. Never the line total. */
  rate: string;
  /**
   * LABOUR-WISE ONLY: the headcount multiplier, e.g. "5".
   *
   * A labour line prices three dimensions — people × days × rate — where an
   * item line prices two. Rather than give labour its own parallel line type
   * (and every screen a second shape to branch on), the two shared dimensions
   * reuse `quantity` (the days) and `rate` (per day), and this carries the
   * third. Absent on item-wise lines, where the concept does not exist.
   */
  members?: string;
  /**
   * What the customer must buy for this line. Absent where the partner supplies
   * the material, which is a different commercial model — see `MaterialView`.
   */
  buy?: {
    /** Short chip text on the row, e.g. "buy 5 pcs". */
    note: string;
    /** Full name for the shopping list, e.g. "Modular switch". */
    name: string;
    /** e.g. "6 A, white". Free text; the partner knows the spec, we do not. */
    specification: string;
    /** e.g. "5 Nos". */
    quantity: string;
  };
}

/** A named group of lines with its own subtotal. */
export interface EstimateSectionView {
  id: string;
  /** e.g. "Wiring & points". Sentence case; the band uppercases it. */
  title: string;
  /** Formatted subtotal for this section. */
  subtotal: string;
  lines: EstimateLineView[];
}

/**
 * A named charge. Controlled codes only — the references' generic
 * "Miscellaneous" is deliberately not representable, because a charge the
 * customer cannot identify is a charge they cannot agree to.
 */
export type ChargeCode =
  | "TRANSPORT"
  | "LOADING_UNLOADING"
  | "DISPOSAL"
  | "PERMIT_FEE"
  | "EQUIPMENT_DELIVERY"
  | "CUSTOM";

export interface ChargeView {
  id: string;
  code: ChargeCode;
  /** Resolved label. For CUSTOM the partner supplied it and it must be shown. */
  label: string;
  amount: string;
}

/**
 * The money, entirely server-derived and entirely read-only.
 *
 * There is no profit percentage and no editable platform fee: the partner's
 * margin already sits inside the rates they quoted, and the V Solve Hub charge
 * is policy. Both appear as inputs in the reference JPEGs and both are excluded
 * on purpose.
 */
export interface EstimateTotalsView {
  /** Sum of the selected mode's lines. The other mode contributes nothing. */
  linesTotal: string;
  chargesTotal: string;
  taxableValue: string;
  /** e.g. "GST 18%". Rate and basis are policy, never partner input. */
  taxLabel: string;
  taxAmount: string;
  /** What the customer pays. */
  customerTotal: string;
  /** Words, for the document. Server-rendered; en-IN grouping differs from en-US. */
  customerTotalInWords: string;
  /** e.g. "V Solve Hub commission (5%)". */
  commissionLabel: string;
  commissionAmount: string;
  /** What reaches the partner's account. */
  partnerReceives: string;
  /**
   * What is still unallocated across the installment schedule, formatted.
   *
   * Carried explicitly rather than left for the screen to assume. The installments
   * editor renders a plate reading "Still to allocate", and a plate that shows ₹0
   * because nobody told it otherwise is exactly the bug it exists to catch — the
   * schedule must reconcile before the estimate can be sent, so this is the number
   * that decides whether the send button is live.
   */
  allocationRemaining: string;
  /** True only when the schedule reconciles exactly. Drives the send guard. */
  allocationReconciles: boolean;
}

/** One stage of the payment schedule. Reuses proposal stages; adds no rail. */
export interface InstallmentView {
  id: string;
  position: number;
  title: string;
  /** What the customer has at the end of it. */
  deliverable: string;
  /** Partner-service amount, ex-tax. The server allocates tax across these. */
  amount: string;
  /** Display-only share of the allocatable base. Never the stored value. */
  sharePercent: number;
  expectedCompletion?: string;
}

/** A material the customer buys themselves, collected from the lines. */
export interface MaterialView {
  id: string;
  name: string;
  specification: string;
  quantity: string;
  /** Which counter to ask at, e.g. "Electrical shop". */
  shop: string;
}

/** Everything one estimate screen needs. Screens take a slice of this. */
export interface EstimateView {
  invitationId: string;
  mode: EstimateMode;
  /** e.g. "V Estimate – Electrician". */
  documentTitle: string;
  serviceName: string;
  partner: { name: string; initials: string; rating: string; verified: boolean };
  customer: { name: string; locality: string; phone: string };
  estimateDate: string;
  sections: EstimateSectionView[];
  charges: ChargeView[];
  totals: EstimateTotalsView;
  installments: InstallmentView[];
  materials: MaterialView[];
  /** Non-null when the estimate cannot be sent, and says why. */
  blockedReason: string | null;
}
