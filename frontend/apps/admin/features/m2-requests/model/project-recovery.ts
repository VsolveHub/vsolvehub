import type { Schemas } from "@vsolve/api-client";

export type ProjectMilestone = Schemas["ProjectMilestone"];

const UNFINISHED = new Set(["PENDING", "IN_PROGRESS", "AWAITING_REVIEW", "CORRECTION_REQUESTED"]);

/**
 * The milestones a transfer must price, exactly as the server counts them: unfinished, and not a
 * material advance that has already been funded (that money bought goods and stays put).
 */
export function transferableMilestones(milestones: ProjectMilestone[]): ProjectMilestone[] {
  return milestones.filter(
    (m) => UNFINISHED.has(m.status) && !(m.kind === "MATERIAL_ADVANCE" && m.funding_state === "FUNDED"),
  );
}

/** A disputed milestone blocks a transfer until it is decided. */
export function hasDisputedMilestone(milestones: ProjectMilestone[]): boolean {
  return milestones.some((m) => m.status === "DISPUTED");
}

export const RECOVERY_REASONS: Record<string, string> = {
  vendor_abandoned: "Vendor stopped working",
  vendor_unresponsive: "Vendor cannot be reached",
  quality_failure: "Work not to standard",
  vendor_unavailable: "Vendor unable to continue",
  customer_request: "Customer asked",
  other: "Other (explain in the note)",
};

/** Rupee prices typed per milestone → the transfer quotes, or the first problem. */
export function transferQuotes(
  milestones: ProjectMilestone[],
  prices: Record<string, string>,
): { quotes: { stage_id: string; amount_paise: number }[] } | { error: string } {
  const quotes: { stage_id: string; amount_paise: number }[] = [];
  for (const milestone of milestones) {
    const raw = (prices[milestone.stage_id] ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
      return { error: `Enter the new vendor's price for “${milestone.milestone_label}”.` };
    }
    quotes.push({ stage_id: milestone.stage_id, amount_paise: Math.round(Number(raw) * 100) });
  }
  if (quotes.length === 0) return { error: "Nothing is left to transfer." };
  return { quotes };
}
