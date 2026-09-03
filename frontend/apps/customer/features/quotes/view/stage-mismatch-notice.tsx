import { formatMoney } from "@vsolve/ui";

import type { QuoteCardView } from "../adapters";

/**
 * The payment schedule does not add up to the total, said out loud.
 *
 * ## It must compare the right two numbers
 *
 * The first version of this compared `sum(amount_paise)` against the estimate total and
 * fired on **every estimate on the platform**, always short by exactly the platform fee
 * plus its GST — 2% grossed up by 18%, so 2.36% every time. Three "defects" were reported
 * off the back of it and all three were this subtraction. A stage carries both the
 * vendor's work amount and `total_due_paise`, what the Customer owes; only the second
 * shares a basis with the total.
 *
 * A warning that cries wolf on every row is worse than no warning: it trains the reader
 * to skip the one estimate that is genuinely wrong, and it accuses a vendor of an
 * arithmetic error they did not make.
 *
 * ## It reports; it never reconciles
 *
 * No figure on the estimate is adjusted to make the arithmetic work — that would be the
 * client inventing a price to cover a composer bug, which is the more expensive failure
 * by far. It also does not claim anybody has been contacted: nothing here notifies the
 * vendor, and saying so was a promise with no code behind it.
 */
export function StageMismatchNotice({
  card,
  driftPaise,
}: {
  card: QuoteCardView;
  /** Positive when the stages ask for more than the total, negative for less. */
  driftPaise: number;
}) {
  const scheduled = card.stages.reduce((sum, stage) => sum + stage.totalDuePaise, 0);
  const short = driftPaise < 0;
  return (
    <div
      role="status"
      className="rounded-[14px] border border-warning-line bg-warning-surface px-4 py-3"
    >
      <p className="text-sm font-bold text-text">
        The payment stages do not match the total
      </p>
      <p className="mt-1 text-sm leading-6 text-text-secondary tabular-nums">
        {card.stages.length === 1 ? "The stage adds" : `The ${card.stages.length} stages add`} up to{" "}
        <strong className="font-bold text-text">{formatMoney(scheduled)}</strong> —{" "}
        {formatMoney(Math.abs(driftPaise))} {short ? "less" : "more"} than the{" "}
        {card.payableLabel} total. Ask{" "}
        {card.vendorName ?? "the professional"} which figure is right before you choose.
      </p>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        Nothing here has been adjusted. Both figures are shown exactly as they were sent.
      </p>
    </div>
  );
}
