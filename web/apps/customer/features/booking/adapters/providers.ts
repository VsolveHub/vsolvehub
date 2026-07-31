import { formatMoney } from "@vsolve/ui";

import type { ProposedEligiblePartners } from "../contract-pending/types";

/**
 * Provider options for the Scheduled provider stage.
 *
 * Auto Assign is modelled as an option in the same list rather than as a
 * separate control. Doc 03 §5 makes it the recommended choice, and a customer
 * comparing "Auto Assign" against four named people in one radio group is making
 * one decision — splitting it into a toggle plus a list makes it two.
 */

/** Sentinel id for the Auto Assign option. Never sent to the server as a partner id. */
export const AUTO_ASSIGN_ID = "__auto_assign";

export interface ProviderOptionView {
  id: string;
  isAutoAssign: boolean;
  name: string;
  photoUrl: string | null;
  /** "4.7 (213 ratings)", or null when the Partner has none yet. */
  ratingLabel: string | null;
  /** "240 jobs completed" */
  experienceLabel: string | null;
  skillBadge: string | null;
  previouslyBooked: boolean;
  /** "+₹50" — null when this Partner costs the same. */
  priceDifferenceLabel: string | null;
  availabilityText: string;
  /** Supporting line for Auto Assign, explaining what it does. */
  description: string | null;
}

function autoAssignOption(): ProviderOptionView {
  return {
    id: AUTO_ASSIGN_ID,
    isAutoAssign: true,
    name: "Auto assign",
    photoUrl: null,
    ratingLabel: null,
    experienceLabel: null,
    skillBadge: null,
    previouslyBooked: false,
    priceDifferenceLabel: null,
    // Deliberately not a promise about speed or quality — it is a description of
    // the mechanism, which is all the platform can honestly claim here.
    availabilityText: "We pick the best available professional for your slot",
    description: "Recommended",
  };
}

export function toProviderOptions(
  response: ProposedEligiblePartners,
): ProviderOptionView[] {
  const options: ProviderOptionView[] = response.auto_assign_available
    ? [autoAssignOption()]
    : [];

  for (const partner of response.partners) {
    const difference = partner.price_difference;
    options.push({
      id: partner.id,
      isAutoAssign: false,
      name: partner.display_name,
      photoUrl: partner.photo_url,
      ratingLabel:
        partner.rating_count > 0
          ? `${partner.rating} (${partner.rating_count} ${
              partner.rating_count === 1 ? "rating" : "ratings"
            })`
          : null,
      experienceLabel:
        partner.completed_jobs > 0 ? `${partner.completed_jobs} jobs completed` : null,
      skillBadge: partner.skill_badge || null,
      previouslyBooked: partner.previously_booked,
      // A zero difference renders as nothing rather than "+₹0", which reads as a
      // fee that does not exist.
      priceDifferenceLabel:
        difference && difference.amount_paise !== 0
          ? `${difference.amount_paise > 0 ? "+" : "−"}${formatMoney(
              Math.abs(difference.amount_paise),
            )}`
          : null,
      availabilityText: partner.availability_text,
      description: null,
    });
  }

  // Doc 03 §5 caps the list at four named providers plus Auto Assign. Enforced
  // here as well as server-side: a longer list turns a choice into a directory.
  const named = options.filter((option) => !option.isAutoAssign).slice(0, 4);
  const auto = options.filter((option) => option.isAutoAssign);
  return [...auto, ...named];
}
