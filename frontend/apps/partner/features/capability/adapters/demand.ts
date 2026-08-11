import { WORKSPACE_REGISTRY } from "@/features/workspace/registry";

import type { DemandPreview, DemandSummary } from "../contract-pending/types";

/**
 * Masked live demand, as a screen can render it.
 *
 * The end of the express path (`M2-FE-101`): what a Partner sees after phone,
 * name, one service and one city, having proved nothing.
 *
 * ## Why ineligible demand is shown rather than hidden
 *
 * Most people arriving here are approved for nothing yet, so filtering to
 * eligible leads would make an empty screen the first thing almost every new
 * Partner sees — and an empty screen is indistinguishable from "there is no work
 * here", which is the one impression this marketplace cannot afford to give
 * falsely.
 *
 * Showing it as actionable would be the opposite lie. So `is_eligible` is
 * carried through to the card, the server's own hint says what stands in the
 * way, and the card offers no action it cannot honour.
 *
 * ## What is not here
 *
 * No customer name, phone, street or budget — 0013 §D2 keeps them out of the
 * *response*, and this adapter would have nothing to drop even if it wanted to.
 * `id` is a preview identifier that resolves on no requirement route, so nothing
 * downstream may treat it as one.
 */

export interface DemandCard {
  readonly id: string;
  readonly headline: string;
  /** A locality. Never a street. */
  readonly areaLabel: string;
  readonly startsOn: string;
  /**
   * The workspace this lead belongs to, named the way the Partner would name it —
   * or null when this build has no screens for the key.
   *
   * Null rather than the raw key. A key is a machine value, and printing
   * `A3_TIME_BLOCK` on a card is the archetype leak `08-frontend-…` §2 forbids.
   * The card still renders: an unknown key costs a label, not a real lead.
   */
  readonly workspaceLabel: string | null;
  readonly isEligible: boolean;
  /** What stands between this Partner and this lead. Empty when eligible. */
  readonly hint: string;
}

export interface DemandView {
  readonly cards: readonly DemandCard[];
  /** How many of the Partner's services matched. Zero is a real, explainable state. */
  readonly matchedServiceCount: number;
  /** True when there is genuinely nothing, rather than nothing this Partner may take. */
  readonly isEmpty: boolean;
  /** True when there is demand but none of it is open to this Partner yet. */
  readonly isAllIneligible: boolean;
}

function toCard(summary: DemandSummary): DemandCard {
  return {
    id: summary.id,
    headline: summary.headline,
    areaLabel: summary.area_label,
    startsOn: summary.starts_on,
    workspaceLabel: WORKSPACE_REGISTRY[summary.workspace_key]?.label ?? null,
    isEligible: summary.is_eligible,
    hint: summary.eligibility_hint,
  };
}

/**
 * Eligible leads first, then the rest.
 *
 * Within each group the server's order is kept — it knows which lead is closest,
 * soonest or best matched, and re-sorting by `starts_on` here would throw that
 * away for an ordering the Partner did not ask for.
 */
export function describeDemand(preview: DemandPreview): DemandView {
  const cards = preview.summaries.map(toCard);
  const eligible = cards.filter((card) => card.isEligible);
  const rest = cards.filter((card) => !card.isEligible);

  return {
    cards: [...eligible, ...rest],
    matchedServiceCount: preview.matched_service_count,
    isEmpty: cards.length === 0,
    isAllIneligible: cards.length > 0 && eligible.length === 0,
  };
}
