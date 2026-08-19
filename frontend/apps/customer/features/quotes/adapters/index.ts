import {
  hasRequestedRevalidation,
  isExpiredQuote,
  isOutOfBudget,
  isSelectable,
  readVendorIdentity,
  type CustomerProposal,
  type CustomerQuoteList,
  type ProposalSelection,
  type ProposalStage,
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

export interface QuoteCardView {
  proposalId: string;
  /** The vendor, as much as the fee bought. Contact is never here. */
  vendorName: string | null;
  vendorType: string | null;
  isVerified: boolean;

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

  /** A5 only. Empty on a workforce quote. */
  stages: readonly QuoteStageView[];

  inclusions: readonly string[];
  exclusions: readonly string[];
  warrantyTerms: string | null;
  /**
   * How platform commission is treated, stated rather than implied.
   *
   * An immutable field on every proposal and a free-text one on the wire —
   * `Proposal.commission_treatment` is a `CharField` with no choices and no
   * published vocabulary. Rendered verbatim where the vendor set it and named as
   * unstated where they did not, because inventing a code here would be this
   * client authoring the vocabulary Finance reports on.
   */
  commissionTreatment: string | null;
  validUntil: string | null;
  submittedAt: string;

  /** The visit this estimate came out of. Null for every A3 quote. */
  siteVisitId: string | null;
  visitCompletedAt: string | null;
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

export function toQuoteCard(proposal: CustomerProposal): QuoteCardView {
  const identity = readVendorIdentity(proposal.vendor);
  const payable = comparableTotalPaise(proposal);

  return {
    proposalId: proposal.id,
    vendorName: identity.displayName,
    vendorType: identity.vendorType,
    isVerified: identity.isVerified,

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

    stages: toStageViews(proposal.stages),

    inclusions: readLines(proposal.inclusions),
    exclusions: readLines(proposal.exclusions),
    warrantyTerms: proposal.warranty_terms.trim() === "" ? null : proposal.warranty_terms,
    commissionTreatment:
      proposal.commission_treatment.trim() === "" ? null : proposal.commission_treatment,
    validUntil: proposal.valid_until,
    submittedAt: proposal.submitted_at,

    siteVisitId: proposal.site_visit?.id ?? null,
    visitCompletedAt: proposal.site_visit?.completed_at ?? null,
  };
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
  const cards = list.quotes.map(toQuoteCard);
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
    {
      label: "Commission treatment",
      equivalent: false,
      caveat:
        "Whether our commission sits inside the quoted price or on top of it. Stated by the vendor, and not something we normalise.",
      values: cards.map((card) => card.commissionTreatment),
    },
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
