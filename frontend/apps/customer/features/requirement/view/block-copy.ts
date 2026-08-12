import type { BlockReason } from "../model/state";

/**
 * Why the Customer cannot continue, in words.
 *
 * The guard returns a `BlockReason` code so the rule stays testable and the
 * wording stays translatable. This is the other half, and it lives in its own
 * module because **two** controls need it: the workspace's "Next" on screens 1–3,
 * and the review screen's own submit — review has no "Next", so a shared copy
 * table imported from the workspace component would have meant importing a
 * client component to read a constant.
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
  SERVICE_DATE_NOT_CHOSEN: "Choose the date you need this by.",
  SERVICE_DATE_IN_PAST: "That date has passed. Pick a date in the future.",
  SERVICE_DATE_BEFORE_START:
    "The date you need this by is before the work starts. Check both dates.",
  ATTACHMENT_STILL_UPLOADING: "One of your files is still uploading. It will only take a moment.",
  ATTACHMENT_FAILED: "A file did not upload. Retry it or remove it before continuing.",
  DUPLICATE_NOT_RESOLVED:
    "You have a similar request open. Merge it or choose to continue with a separate one.",
  OPTIONAL_DETAIL_INCOMPLETE:
    "One of the optional details is half finished. Open it to complete it, or clear it — you do not have to fill it in at all.",
};
