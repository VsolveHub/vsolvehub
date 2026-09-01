import {
  hasRequestedRevalidation,
  isExpiredQuote,
  isOutOfBudget,
  isSelectable,
  readVendorIdentity,
  type CustomerProposal,
  type CustomerQuoteList,
  type EstimateType,
  type ProposalItemLine,
  type ProposalLabourLine,
  type ProposalMaterialLine,
  type ProposalOtherCharge,
  type ProposalSelection,
  type ProposalStage,
  type RequirementQuestion,
  type RevisionRequest,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

/**
 * The only code in the quotes feature that knows what the wire looks like.
 *
 * Same layering as `features/requirement/adapters/`. One extra job here: the
 * wire hands over three fields the schema types as `unknown` — `inclusions`,
 * `exclusions` and the vendor object — and every one of them is narrowed before
 * it can reach a component.
 */

/* --------------------------------------------------------------------------
   Narrowing the untyped halves
   -------------------------------------------------------------------------- */

/**
 * A `JSONField` list, as a list of readable lines.
 *
 * `inclusions` and `exclusions` are published as `unknown`, which means the
 * compiler is checking nothing at all on the two fields that decide what a
 * vendor did and did not promise. Anything that is not a list of non-empty
 * strings becomes an empty list: **an unreadable exclusion must never render as
 * "nothing is excluded"**, so the caller distinguishes "none given" from "we
 * could not read them" by asking whether the raw value was a list at all.
 */
function readLines(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

/* --------------------------------------------------------------------------
   One quote, as the reader sees it — `M2-FE-407`, `M2-FE-423`
   -------------------------------------------------------------------------- */

export interface QuoteStageView {
  title: string;
  deliverable: string | null;
  amountLabel: string;
  endsOn: string | null;
}

function toStageViews(stages: readonly ProposalStage[]): readonly QuoteStageView[] {
  return stages.map((stage) => ({
    // `title` is required on the wire, but a stage stored before `ProposalStage`
    // was published degrades to a blank one by the serializer's own defensive
    // read. A blank title is rendered as a numbered stage rather than as an
    // empty row.
    title: stage.title.trim(),
    deliverable: stage.deliverable.trim() === "" ? null : stage.deliverable,
    amountLabel: formatMoney(stage.amount_paise),
    endsOn: stage.ends_on ?? null,
  }));
}

/**
 * One material line on an estimate.
 *
 * These were being dropped. `CustomerProposal.material_lines` has been published
 * since the A5 estimate surface landed, the vendor sends it, and the vendor's own
 * read-back renders it — but this adapter never mapped it and `QuoteCardView` had
 * nowhere to put it. The amounts are inside `total_paise`, so a Customer was being
 * charged for materials the app never showed them. That is the kind of gap that
 * reads as overcharging rather than as a missing feature.
 *
 * `unit` is a free string on the wire with a blank default, so a line that carries
 * a quantity and no unit renders the bare number rather than inventing "Nos".
 */
export interface QuoteMaterialView {
  title: string;
  /** e.g. "2 bags", or "2" where the vendor set no unit. Null when quantity is 1. */
  quantityLabel: string | null;
  /** Null when the vendor has listed the material but not yet priced it. */
  amountLabel: string | null;
}

function toMaterialViews(
  materials: readonly ProposalMaterialLine[],
): readonly QuoteMaterialView[] {
  return materials.map((material) => {
    const unit = material.unit.trim();
    // `quantity` is a decimal STRING at 1.44.0, not a number: a material can be
    // 2.5 kg, and a float here would eventually render 2.5000000000000004.
    // Trailing zeros are trimmed because the server sends "1.000" and nobody
    // writes that on a shopping list.
    const quantity = material.quantity.replace(/\.0+$/u, "").replace(/(\.\d*[1-9])0+$/u, "$1");
    return {
      title: material.title.trim(),
      // A quantity of one adds nothing a reader does not already assume, and
      // "1 ×" beside every row is noise on the one screen that has to stay
      // scannable.
      quantityLabel:
        quantity === "1" ? null : unit === "" ? quantity : `${quantity} ${unit}`,
      // Optional at 1.44.0 — the server computes it from rate x quantity, and a
      // line the vendor has not priced yet has none. `total_due_paise` is the
      // tax-inclusive figure and is deliberately NOT used here: this row sits
      // inside a total that is already tax-inclusive, and showing the grossed-up
      // amount per line would double-count it to the reader.
      amountLabel: material.amount_paise === undefined ? null : formatMoney(material.amount_paise),
    };
  });
}

/* --------------------------------------------------------------------------
   The shopping list — what the Customer buys, contract 1.48.0
   -------------------------------------------------------------------------- */

/** One line of `CustomerProposal.material_list`. Not re-exported by `@vsolve/query` yet. */
type MaterialListLine =
  | CustomerProposal["material_list"][number]
  | CustomerProposal["included_supply_list"][number];

/**
 * One thing the Customer should buy. Quantities and a spec — **never a price**.
 *
 * Customer-procured estimates carry this as a shopping list. Turnkey estimates
 * reuse the same display shape for `included_supply_list`, but the two fields
 * retain different meanings and render under different headings.
 */
export interface QuoteMaterialListRowView {
  title: string;
  /** "16 A, white" — what makes it the right one. Null when the pro gave none. */
  spec: string | null;
  /** "5 Nos", or the bare number where the pro set no unit. */
  quantityLabel: string;
  /** A short aside — "any brand", "match the existing". Null when absent. */
  note: string | null;
}

function toMaterialListViews(
  lines: readonly MaterialListLine[],
): readonly QuoteMaterialListRowView[] {
  return lines
    .filter((line) => line.title.trim() !== "")
    .map((line) => {
      // `spec`, `unit` and `note` are `@default ""` on the wire and so optional
      // in the generated type; absent and blank mean the same thing here.
      const unit = (line.unit ?? "").trim();
      const spec = (line.spec ?? "").trim();
      const note = (line.note ?? "").trim();
      const quantity = trimQuantity(line.quantity);
      return {
        title: line.title.trim(),
        spec: spec === "" ? null : spec,
        quantityLabel: unit === "" ? quantity : `${quantity} ${unit}`,
        note: note === "" ? null : note,
      };
    });
}

/**
 * The brand class the pro sized the list for, in words a shop understands.
 *
 * Two tiers on the wire and a blank; anything else is a tier this bundle has
 * no words for and renders nothing rather than a code.
 */
const BRAND_TIER_LABEL: Record<string, string> = {
  STANDARD: "Standard tier (Finolex / Anchor class)",
  PREMIUM: "Premium tier (Polycab / Legrand class)",
};

export function brandTierLabel(tier: string): string | null {
  return BRAND_TIER_LABEL[tier] ?? null;
}

/* --------------------------------------------------------------------------
   Priced lines — how the vendor built the number
   -------------------------------------------------------------------------- */

/**
 * The vendor's own unit vocabulary, in the reader's words. The wire's `UnitEnum`
 * is closed, so an unknown code cannot arrive — but the fallback renders the raw
 * code rather than dropping the quantity, because a quantity with an odd unit
 * still says more than no quantity at all.
 */
const UNIT_LABELS: Record<string, string> = {
  each: "Nos",
  job: "Job",
  hour: "Hours",
  day: "Days",
  sq_ft: "Sq ft",
  running_ft: "Running ft",
  metre: "Metre",
  kg: "Kg",
  litre: "Litre",
  set: "Set",
};

/** "1.000" → "1", "2.500" → "2.5" — same trim `toMaterialViews` performs. */
function trimQuantity(quantity: string): string {
  return quantity.replace(/\.0+$/u, "").replace(/(\.\d*[1-9])0+$/u, "$1");
}

export interface QuoteItemLineView {
  category: string;
  title: string;
  /** "5 Sq ft × ₹80" — null for a single whole-job line, whose rate IS its amount. */
  quantityLabel: string | null;
  amountLabel: string;
}

function toItemLineViews(lines: readonly ProposalItemLine[]): readonly QuoteItemLineView[] {
  return lines.map((line) => {
    const quantity = trimQuantity(line.quantity);
    const unit = UNIT_LABELS[line.unit] ?? line.unit;
    return {
      // Optional since 1.48.0 — a custom line the Partner added on site may carry none.
      category: (line.category ?? "").trim(),
      title: line.title.trim(),
      quantityLabel:
        quantity === "1" && line.unit === "job"
          ? null
          : `${quantity} ${unit} × ${formatMoney(line.rate_paise)}`,
      amountLabel: formatMoney(line.amount_paise),
    };
  });
}

export interface QuoteLabourLineView {
  role: string;
  team: string | null;
  /** "2 people × 3 days × ₹900/day" — the arithmetic behind the amount, spelt out. */
  crewLabel: string;
  amountLabel: string;
}

function toLabourLineViews(lines: readonly ProposalLabourLine[]): readonly QuoteLabourLineView[] {
  return lines.map((line) => ({
    role: line.role.trim(),
    team: line.team.trim() === "" ? null : line.team.trim(),
    crewLabel: [
      line.member_count === 1 ? "1 person" : `${line.member_count} people`,
      line.day_count === 1 ? "1 day" : `${line.day_count} days`,
      `${formatMoney(line.rate_paise_per_day)}/day`,
    ].join(" × "),
    amountLabel: formatMoney(line.amount_paise),
  }));
}

export interface QuoteChargeView {
  label: string;
  amountLabel: string;
}

function toChargeViews(charges: readonly ProposalOtherCharge[]): readonly QuoteChargeView[] {
  return charges.map((charge) => ({
    label: charge.label.trim(),
    amountLabel: formatMoney(charge.amount_paise),
  }));
}

/**
 * One clarification question and its answer, as either side wrote it.
 *
 * `askedByRole` is the server's own field, derived by identity comparison —
 * never inferred here from which screen is looking.
 */
export interface QuestionView {
  id: string;
  askedByRole: "CUSTOMER" | "VENDOR" | "OPERATIONS";
  question: string;
  answer: string | null;
  askedAt: string;
  answeredAt: string | null;
}

export function toQuestionView(question: RequirementQuestion): QuestionView {
  const role = question.asked_by_role;
  return {
    id: question.id,
    askedByRole: role === "CUSTOMER" || role === "VENDOR" ? role : "OPERATIONS",
    question: question.question,
    answer: question.answer.trim() === "" ? null : question.answer,
    askedAt: question.asked_at,
    answeredAt: question.answered_at,
  };
}

/** The Customer's latest ask for a different estimate, as the card shows it. */
export interface RevisionRequestView {
  id: string;
  status: "OPEN" | "ANSWERED" | "DECLINED";
  reasonLabel: string;
  excludedItems: readonly string[];
  note: string | null;
  declineNote: string | null;
  createdAt: string;
}

const REVISION_REASON_LABEL: Record<string, string> = {
  LEAVE_OUT: "Leave something out",
  CHANGE_MATERIALS: "Change materials or finish",
  PHASE_WORK: "Split the work into phases",
  OTHER: "Something else",
};

export function toRevisionRequestView(request: RevisionRequest): RevisionRequestView {
  return {
    id: request.id,
    status: request.status,
    reasonLabel: REVISION_REASON_LABEL[request.reason_code] ?? request.reason_code,
    excludedItems: readLines(request.excluded_items),
    note: request.note.trim() === "" ? null : request.note,
    declineNote: request.decline_note.trim() === "" ? null : request.decline_note,
    createdAt: request.created_at,
  };
}

/**
 * What the Customer may know about the professional before choosing them.
 *
 * Every figure is the server's and every null is honest: a vendor nobody has
 * rated yet has no star count, and printing one would be this adapter deciding
 * a reputation.
 */
export interface VendorTrustView {
  ratingAverage: number | null;
  ratingCount: number;
  jobsCompleted: number;
  experienceYears: number;
  /** "since 2017", or null when the payload predates the field. */
  activeSinceLabel: string | null;
}

export interface QuoteCardView {
  proposalId: string;
  /** The vendor, as much as the fee bought. Contact is never here. */
  vendorName: string | null;
  vendorType: string | null;
  isVerified: boolean;
  trust: VendorTrustView;

  status: string;
  isSelectable: boolean;
  isExpired: boolean;
  isOutOfBudget: boolean;
  hasAskedForRevalidation: boolean;
  revision: number;

  /** The headline number, exactly as the vendor stated it. */
  totalLabel: string;
  taxLabel: string;
  /** `INCLUSIVE` — tax is inside the total. `EXCLUSIVE` — it is added on top. */
  taxBasis: "INCLUSIVE" | "EXCLUSIVE";
  /** What the Customer actually pays, on the one basis. See `comparableTotalPaise`. */
  payableLabel: string;
  payablePaise: number;

  /** A3 only. Null on an estimate. */
  rateLabel: string | null;
  minimumDays: number | null;
  workerCount: number | null;

  /**
   * How the vendor priced the work. `ITEM_WISE` fills `itemLines`, `LABOUR_WISE`
   * fills `labourLines` — the server refuses a mix, so at most one is non-empty.
   * A3 quotes and older tap estimates carry neither; the default is `LABOUR_WISE`
   * and means nothing on its own, so render from the arrays, never the flag.
   */
  estimateType: EstimateType;
  itemLines: readonly QuoteItemLineView[];
  labourLines: readonly QuoteLabourLineView[];
  /** Named charges (transport, disposal…) — inside the total, like materials. */
  otherCharges: readonly QuoteChargeView[];

  /** A5 only. Empty on a workforce quote. */
  stages: readonly QuoteStageView[];

  /**
   * Materials the vendor priced into this estimate. Empty on a workforce quote
   * and on any estimate that quoted labour alone. Their amounts are already
   * inside `totalLabel` — this exists so the Customer can see what they are.
   */
  materials: readonly QuoteMaterialView[];

  /**
   * What the Customer buys themselves — quantities and specs, no prices.
   * Distinct from `materials` above, which the pro supplies inside the total.
   */
  materialList: readonly QuoteMaterialListRowView[];
  /** Materials supplied and managed by the professional inside the quoted rates. */
  includedSupplyList: readonly QuoteMaterialListRowView[];
  /** Explicit server configuration; screens never infer procurement from a service slug. */
  materialFulfilmentMode: CustomerProposal["material_fulfilment_mode"];
  /** "Standard tier (Finolex / Anchor class)", or null when the pro set none. */
  brandTierLabel: string | null;

  inclusions: readonly string[];
  exclusions: readonly string[];
  /** What the vendor will do, in their own words. Null on an estimate written before 1.47.0. */
  scopeSummary: string | null;
  warrantyTerms: string | null;
  validUntil: string | null;
  /**
   * Whole days of validity left, counted from the server's own clock — or null
   * when the vendor set no validity. Zero means it runs out today.
   */
  validityDaysLeft: number | null;
  submittedAt: string;

  /** The visit this estimate came out of. Null for every A3 quote. */
  siteVisitId: string | null;
  visitCompletedAt: string | null;

  /** The clarification thread with this professional, oldest first. */
  questions: readonly QuestionView[];
  /** The Customer's latest ask for a different estimate, or null. */
  revisionRequest: RevisionRequestView | null;
}

/**
 * What the Customer actually pays, normalised onto one basis.
 *
 * `M2-FE-408`'s load-bearing arithmetic, and the only sum this feature performs.
 * A GST-registered vendor quoting `EXCLUSIVE` and an unregistered one quoting
 * `INCLUSIVE` publish two numbers that are not comparable, and putting them side
 * by side unnormalised makes the more expensive quote look cheaper.
 *
 * `_required_tax_basis` forces every quote on one requirement onto the basis the
 * first vendor used, so in practice these agree — this is what makes the
 * comparison honest when they somehow do not, and it is still only ever
 * addition over two published integers.
 */
export function comparableTotalPaise(proposal: CustomerProposal): number {
  return proposal.tax_basis === "EXCLUSIVE"
    ? proposal.total_paise + proposal.tax_paise
    : proposal.total_paise;
}

/**
 * Whole days between the server's clock and `valid_until`, floored at zero.
 *
 * Counted on the server's `server_now` rather than the device, for the reason
 * `isExpiredQuote` gives: a phone an hour fast would show a live estimate as
 * gone. Days rather than hours, because "valid 6 more days" is the grain a
 * decision is made at and a ticking clock on a written estimate is pressure.
 */
export function validityDaysLeft(validUntil: string | null, serverNow: string): number | null {
  if (validUntil === null) return null;
  const until = new Date(validUntil).getTime();
  const now = new Date(serverNow).getTime();
  if (Number.isNaN(until) || Number.isNaN(now)) return null;
  return Math.max(0, Math.floor((until - now) / 86_400_000));
}

function activeSinceLabel(iso: string | null): string | null {
  if (iso === null) return null;
  const year = new Date(iso).getFullYear();
  return Number.isNaN(year) ? null : `since ${year}`;
}

export function toQuoteCard(proposal: CustomerProposal, serverNow: string): QuoteCardView {
  const identity = readVendorIdentity(proposal.vendor);
  const payable = comparableTotalPaise(proposal);

  return {
    proposalId: proposal.id,
    vendorName: identity.displayName,
    vendorType: identity.vendorType,
    isVerified: identity.isVerified,
    trust: {
      ratingAverage: identity.ratingAverage,
      ratingCount: identity.ratingCount,
      jobsCompleted: identity.jobsCompleted,
      experienceYears: identity.experienceYears,
      activeSinceLabel: activeSinceLabel(identity.activeSince),
    },

    status: proposal.status,
    isSelectable: isSelectable(proposal),
    isExpired: isExpiredQuote(proposal),
    isOutOfBudget: isOutOfBudget(proposal),
    hasAskedForRevalidation: hasRequestedRevalidation(proposal),
    revision: proposal.revision,

    totalLabel: formatMoney(proposal.total_paise),
    taxLabel: formatMoney(proposal.tax_paise),
    taxBasis: proposal.tax_basis,
    payableLabel: formatMoney(payable),
    payablePaise: payable,

    rateLabel:
      proposal.rate_paise_per_worker_day === null
        ? null
        : formatMoney(proposal.rate_paise_per_worker_day),
    minimumDays: proposal.minimum_days,
    workerCount: proposal.worker_count,

    estimateType: proposal.estimate_type,
    itemLines: toItemLineViews(proposal.item_lines),
    labourLines: toLabourLineViews(proposal.labour_lines),
    otherCharges: toChargeViews(proposal.other_charges),

    stages: toStageViews(proposal.stages),
    materials: toMaterialViews(proposal.material_lines),
    materialList: toMaterialListViews(proposal.material_list),
    includedSupplyList: toMaterialListViews(proposal.included_supply_list),
    materialFulfilmentMode: proposal.material_fulfilment_mode,
    brandTierLabel: brandTierLabel(proposal.material_brand_tier),

    inclusions: readLines(proposal.inclusions),
    exclusions: readLines(proposal.exclusions),
    scopeSummary: proposal.scope_summary.trim() === "" ? null : proposal.scope_summary.trim(),
    warrantyTerms: proposal.warranty_terms.trim() === "" ? null : proposal.warranty_terms,
    validUntil: proposal.valid_until,
    validityDaysLeft: validityDaysLeft(proposal.valid_until, serverNow),
    submittedAt: proposal.submitted_at,

    siteVisitId: proposal.site_visit?.id ?? null,
    visitCompletedAt: proposal.site_visit?.completed_at ?? null,

    questions: proposal.questions.map(toQuestionView),
    revisionRequest:
      proposal.revision_request === null ? null : toRevisionRequestView(proposal.revision_request),
  };
}

/**
 * The professional's questions still waiting on the Customer, across every estimate.
 *
 * A vendor's unanswered question is the one thing on this whole journey that
 * only the Customer can move, so it is surfaced on the request page rather
 * than left on a timeline with nothing to press.
 */
export function unansweredVendorQuestions(
  cards: readonly QuoteCardView[],
): readonly { card: QuoteCardView; question: QuestionView }[] {
  return cards.flatMap((card) =>
    card.questions
      .filter((question) => question.askedByRole === "VENDOR" && question.answer === null)
      .map((question) => ({ card, question })),
  );
}

function normaliseLine(line: string): string {
  return line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The scope lines other estimates include and this one does not.
 *
 * A comparison, never a judgement. Computed only against what the *other*
 * professionals put in writing — so it says "the others include plumbing
 * rework; this one does not", which is the honest answer to "why is this one
 * cheaper", and never "missing", which would be the screen deciding what a
 * bathroom needs. Matching is on the words, case- and space-insensitive; two
 * vendors describing one thing differently simply do not match, and a false
 * gap is the worse error of the two.
 */
export function scopeGaps(
  card: QuoteCardView,
  cards: readonly QuoteCardView[],
): readonly string[] {
  const own = new Set(card.inclusions.map(normaliseLine));
  const seen = new Set<string>();
  const gaps: string[] = [];
  for (const other of cards) {
    if (other.proposalId === card.proposalId) continue;
    for (const line of other.inclusions) {
      const key = normaliseLine(line);
      if (own.has(key) || seen.has(key)) continue;
      seen.add(key);
      gaps.push(line);
    }
  }
  return gaps;
}

/** One scope line and which estimates include it, for the "where they differ" rows. */
export interface ScopeDifferenceRow {
  line: string;
  /** One flag per card, in card order. */
  included: readonly boolean[];
}

/**
 * The scope lines the estimates disagree on.
 *
 * Only the lines that at least one estimate includes and at least one does
 * not — a line everybody includes is not a difference, and a row of ticks is
 * noise on the table whose whole point is the differences.
 */
export function scopeDifferenceRows(
  cards: readonly QuoteCardView[],
): readonly ScopeDifferenceRow[] {
  if (cards.length < 2) return [];
  const lines = new Map<string, string>();
  for (const card of cards) {
    for (const line of card.inclusions) {
      const key = normaliseLine(line);
      if (!lines.has(key)) lines.set(key, line);
    }
  }
  const rows: ScopeDifferenceRow[] = [];
  for (const [key, line] of lines) {
    const included = cards.map((card) =>
      card.inclusions.some((own) => normaliseLine(own) === key),
    );
    if (included.some(Boolean) && !included.every(Boolean)) rows.push({ line, included });
  }
  return rows;
}

export interface QuoteListView {
  cards: readonly QuoteCardView[];
  /**
   * Free non-responsive replacements left, or **null when the cap is unset**.
   *
   * Null is not zero and must not render as a number. `M2-FE-406`: when the
   * owner has not set a cap, no replacement is offered at all, because a
   * control promising one on a rule that does not exist is the client inventing
   * policy — and `POST .../reject/` answers `m2_policy_unavailable` to prove it.
   */
  replacementsRemaining: number | null;
  /** True when every delivered quote agrees on how tax is stated. */
  isComparableOnOneBasis: boolean;
}

export function toQuoteListView(list: CustomerQuoteList): QuoteListView {
  const cards = list.quotes.map((quote) => toQuoteCard(quote, list.server_now));
  const bases = new Set(cards.map((card) => card.taxBasis));
  return {
    cards,
    replacementsRemaining: list.non_responsive_rejections_remaining,
    // One basis, or none to disagree about. Two means the comparison has to say
    // so rather than quietly presenting incomparable numbers as a ranking.
    isComparableOnOneBasis: bases.size <= 1,
  };
}

/* --------------------------------------------------------------------------
   Comparison — `M2-FE-408`
   -------------------------------------------------------------------------- */

/**
 * One comparison row.
 *
 * `equivalent` is the distinction the whole view turns on. An equivalent row is
 * the same question answered by every vendor and may be ranked; a
 * non-equivalent one is an **assumption** — what a vendor decided to include,
 * exclude, warrant or assume — and ranking those would be the screen inventing a
 * comparison nobody made.
 */
export interface ComparisonRow {
  label: string;
  equivalent: boolean;
  /** One cell per card, in card order. Null renders as "not stated". */
  values: readonly (string | null)[];
  /** A sentence explaining why a row cannot be compared, for the ones that cannot. */
  caveat?: string;
}

function pluralDays(days: number | null): string | null {
  if (days === null) return null;
  return days === 1 ? "1 day" : `${days} days`;
}

function joinOrNull(lines: readonly string[]): string | null {
  return lines.length === 0 ? null : lines.join(" · ");
}

/** "1 item" / "4 items". Null for none, so an all-empty row drops out. */
export function materialCountLabel(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 item" : `${count} items`;
}

/**
 * The comparison table, built once from the cards.
 *
 * Rows that are empty for every card are dropped: an all-blank "Warranty" row
 * across three workforce quotes is noise that makes the two rows that matter
 * harder to find.
 */
/**
 * How much cheaper each estimate is than the dearest one, in the same words.
 *
 * The one number on the comparison screen that is neither a price nor a total,
 * and the only arithmetic this feature performs besides `comparableTotalPaise`.
 * It is a **difference between two server figures**, both already normalised
 * onto one tax basis, and it exists because the alternative is every Customer
 * doing the same subtraction in their head against two six-digit rupee amounts.
 *
 * `null` for the dearest estimate and for every entry when they tie, because
 * "₹0 lower" is not a fact anybody needs and marking a tie would be picking a
 * winner arbitrarily. Also `null` throughout when the totals are not comparable
 * — the caller passes `false` and no delta is claimed at all.
 */
export function savingsAgainstDearest(
  cards: readonly QuoteCardView[],
  isComparableOnOneBasis: boolean,
): readonly (string | null)[] {
  if (!isComparableOnOneBasis || cards.length < 2) return cards.map(() => null);
  const dearest = Math.max(...cards.map((card) => card.payablePaise));
  return cards.map((card) =>
    card.payablePaise < dearest ? formatMoney(dearest - card.payablePaise) : null,
  );
}

/**
 * The first stage a Customer would have to fund, and what it buys.
 *
 * Read straight off `stages[0]` — its own `amount_paise` and its own title — so
 * nothing here decides what "first" means or what it costs. `null` on an A3
 * quote, which has no stages, and on an estimate whose vendor published none.
 *
 * It earns a row of its own because the headline total is not what somebody
 * actually pays first. Two estimates within a few thousand rupees of each other
 * can ask for very different amounts up front, and that difference is invisible
 * on the totals alone.
 */
export function firstStageOf(
  card: QuoteCardView,
): { amountLabel: string; title: string } | null {
  const stage = card.stages[0];
  if (stage === undefined) return null;
  return {
    amountLabel: stage.amountLabel,
    title: stage.title === "" ? "First stage" : stage.title,
  };
}

export function toComparisonRows(cards: readonly QuoteCardView[]): readonly ComparisonRow[] {
  const rows: ComparisonRow[] = [
    {
      label: "What you pay",
      equivalent: true,
      values: cards.map((card) => card.payableLabel),
    },
    {
      label: "First stage to fund",
      equivalent: true,
      values: cards.map((card) => {
        const first = firstStageOf(card);
        return first === null ? null : `${first.amountLabel} — ${first.title}`;
      }),
    },
    {
      label: "Timeline",
      equivalent: true,
      // The last stage's own end date, not a computed week count. A duration
      // needs a start, and nothing published says when the work would begin —
      // the vendor dated their stages and this reads the last of them.
      values: cards.map((card) => {
        const last = card.stages[card.stages.length - 1];
        return last?.endsOn == null ? null : `Ends ${last.endsOn}`;
      }),
    },
    {
      label: "How tax is stated",
      equivalent: true,
      values: cards.map((card) =>
        card.taxBasis === "INCLUSIVE"
          ? `Included — ${card.taxLabel} of the total`
          : `Added on top — ${card.taxLabel}`,
      ),
    },
    {
      label: "Rate per worker per day",
      equivalent: true,
      values: cards.map((card) => card.rateLabel),
    },
    {
      label: "Workers",
      equivalent: true,
      values: cards.map((card) => (card.workerCount === null ? null : String(card.workerCount))),
    },
    {
      label: "Minimum booking",
      equivalent: true,
      values: cards.map((card) => pluralDays(card.minimumDays)),
    },
    {
      label: "Stages",
      equivalent: true,
      values: cards.map((card) =>
        card.stages.length === 0 ? null : `${card.stages.length} stages`,
      ),
    },
    {
      // From the arrays, not `estimateType`: the flag defaults to LABOUR_WISE on
      // quotes that priced neither way (A3, older tap estimates), and claiming a
      // pricing style nobody used would be the table inventing a difference.
      label: "How it is priced",
      equivalent: true,
      values: cards.map((card) =>
        card.itemLines.length > 0
          ? `Item-wise (${card.itemLines.length} ${card.itemLines.length === 1 ? "item" : "items"})`
          : card.labourLines.length > 0
            ? `Labour-wise (${card.labourLines.length} ${card.labourLines.length === 1 ? "role" : "roles"})`
            : null,
      ),
    },
    {
      // A count, never a cost: the list carries no prices by contract, and
      // the number of things to buy is the one figure that compares.
      label: "Materials to buy",
      equivalent: true,
      values: cards.map((card) => materialCountLabel(card.materialList.length)),
    },
    {
      label: "Valid until",
      equivalent: true,
      values: cards.map((card) => card.validUntil),
    },
    {
      label: "What is included",
      equivalent: false,
      caveat:
        "Each professional decided this for themselves. A shorter list is not a worse offer — it may be a more careful one.",
      values: cards.map((card) => joinOrNull(card.inclusions)),
    },
    {
      label: "What is not included",
      equivalent: false,
      caveat:
        "These are the things you would pay for separately. They are the most common reason two quotes that look alike are not.",
      values: cards.map((card) => joinOrNull(card.exclusions)),
    },
    {
      label: "Warranty",
      equivalent: false,
      caveat: "Warranty terms are the vendor's own words, not a platform promise.",
      values: cards.map((card) => card.warrantyTerms),
    },
    // "Commission treatment" was a row here until 1.44.0. It was vendor-authored
    // free text, and BE-5A took it off the proposal entirely: commission is
    // policy, decided by an approved Operations version, not something a vendor
    // states differently from the vendor beside them. A comparison row whose
    // whole point was that the two answers might differ has nothing left to say.
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

/**
 * Which card is cheapest on the normalised total, by index.
 *
 * Returns null on a tie or an empty list. A tie is a real outcome and marking
 * one of two identical prices "cheapest" would be the screen picking a winner
 * arbitrarily.
 */
export function cheapestIndex(cards: readonly QuoteCardView[]): number | null {
  if (cards.length === 0) return null;
  let best = 0;
  let ties = 0;
  for (let index = 1; index < cards.length; index += 1) {
    const value = cards[index]!.payablePaise;
    const current = cards[best]!.payablePaise;
    if (value < current) {
      best = index;
      ties = 0;
    } else if (value === current) {
      ties += 1;
    }
  }
  return ties > 0 ? null : best;
}

/* --------------------------------------------------------------------------
   Selection — `M2-FE-410`..`M2-FE-414`
   -------------------------------------------------------------------------- */

export interface SelectionView {
  selectionId: string;
  proposalId: string;
  status: ProposalSelection["status"];
  /** The vendor's deadline. Null when the area carries no business-hours clock. */
  reconfirmBy: string | null;
  decidedAt: string | null;
  engagementId: string | null;
  /** The vendor's own reason code, where they gave one. */
  declineReasonCode: string | null;
}

export function toSelectionView(selection: ProposalSelection): SelectionView {
  return {
    selectionId: selection.id,
    proposalId: selection.proposal,
    status: selection.status,
    reconfirmBy: selection.reconfirm_by,
    decidedAt: selection.decided_at,
    engagementId: selection.engagement_id,
    declineReasonCode:
      selection.decline_reason_code.trim() === "" ? null : selection.decline_reason_code,
  };
}
