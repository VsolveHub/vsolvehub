import type { BlockReason } from "../model/state";

/**
 * Why the Customer cannot continue, in words.
 *
 * The guard returns a `BlockReason` code so the rule stays testable and the
 * wording stays translatable. This is the other half, in its own module so the
 * wizard's Continue and the brief's rail can both read it without importing a
 * client component to reach a constant.
 *
 * The rule both callers follow: the control is disabled **and** the reason is
 * stated. A disabled button with no explanation is the most common way a form
 * dead-ends someone — they can see they cannot continue and not why.
 */
export const BLOCK_COPY: Record<BlockReason, string> = {
  REQUIRED_ANSWER_MISSING: "Please answer the questions marked required.",
  ADDRESS_NOT_CHOSEN: "Choose where the work is.",
  START_DATE_NOT_CHOSEN: "Choose when the work should start.",
  START_DATE_IN_PAST: "That start date has passed. Pick a date in the future.",
  SERVICE_DATE_IN_PAST: "That date has passed. Pick a date in the future.",
  SERVICE_DATE_BEFORE_START:
    "The date you need this by is before the work starts. Check both dates.",
  DUPLICATE_NOT_RESOLVED:
    "You have a similar request open. Merge it or choose to continue with a separate one.",
};
