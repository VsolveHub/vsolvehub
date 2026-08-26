import { Button, Card, StepDock, cn } from "@vsolve/ui";

/**
 * Funding one stage of a project — not the project.
 *
 * ## What this screen is defending against
 *
 * A customer about to send ₹43,070 needs to know three things that a generic
 * payment sheet would not tell them: that this is one of four payments and not
 * the bill; that the money buys a named, finishable piece of work with a date on
 * it; and that the next payment cannot be taken without their approval. All
 * three are on the screen before the amount is, which is the order in which
 * somebody deciding whether to pay actually needs them.
 *
 * ## The rail counts four segments, not three
 *
 * The materials advance is the first segment because it has already been paid,
 * but it is not "installment 0" — it funded goods, not a stage of work. Showing
 * it in the rail and naming it separately in the caption is what keeps
 * "Installment 1 of 3" true while still accounting for every rupee that has
 * left the customer's account.
 *
 * ## Every rupee is disclosed, and none of it is editable
 *
 * The professional's charge for the stage, the statutory tax and the V Solve Hub
 * fee are three separate server-derived rows above the divider. There is no
 * input, no rate the reader can change, and no profit percentage — the platform
 * takes a disclosed rupee amount, printed next to the work it sits beside.
 *
 * Pure: props in, JSX out.
 */

export interface FundedInstallment {
  position: number;
  /** The stage name, as the schedule names it. */
  title: string;
  /** What "done" means for this stage, in the professional's own terms. */
  deliverable: string;
  expectedCompletion: string;
  /** Server-derived, all four. The client displays money and never computes it. */
  partnerService: string;
  tax: string;
  platformFee: string;
  amount: string;
}

export interface FundInstallmentAdvance {
  /** e.g. "Materials advance". Named, because the rail counts it. */
  label: string;
}

export interface FundInstallmentScreenProps {
  partnerName: string;
  /** The stage being funded now. */
  installment: FundedInstallment;
  /** The whole schedule, for the rail and the "of N" count. */
  installments: readonly { position: number }[];
  materialsAdvance: FundInstallmentAdvance;
  /** e.g. "GST 18%" — the rate is server-published, never named by the client. */
  taxLabel: string;
  onBack?: () => void;
  onPay?: () => void;
}

function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0];
}

function LockGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

/** One line of the breakdown. Label left, server-derived amount right. */
function MoneyRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13.5px]">
      <span className="text-text-secondary">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-text">{amount}</span>
    </div>
  );
}

/**
 * Paid, active, pending. Colour alone never carries the state — the caption
 * under the rail says in words where the customer is, which is what a
 * colour-blind reader and a screen reader both get.
 */
const SEGMENT_TONES = {
  paid: "bg-success-text",
  active: "bg-action",
  pending: "bg-warm-300",
} as const;

export function FundInstallmentScreen({
  partnerName,
  installment,
  installments,
  materialsAdvance,
  taxLabel,
  onBack,
  onPay,
}: FundInstallmentScreenProps) {
  const firstName = firstNameOf(partnerName);
  // The stage being funded is still "to go" — it is not paid until this screen
  // is. Counting from the active position keeps the caption true on stage 2 and
  // 3 as well, where a plain list length would keep saying three.
  const remaining = installments.filter(
    (entry) => entry.position >= installment.position,
  ).length;

  // The advance first, then one segment per installment. Everything before the
  // stage being funded is paid; everything after it is not yet askable.
  const segments: (keyof typeof SEGMENT_TONES)[] = [
    "paid",
    ...installments.map((entry) =>
      entry.position < installment.position
        ? ("paid" as const)
        : entry.position === installment.position
          ? ("active" as const)
          : ("pending" as const),
    ),
  ];

  const nextPosition = installment.position + 1;
  const hasNext = installments.some((entry) => entry.position === nextPosition);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span className="sr-only">Back</span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>
          <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-bold text-text">
            Installment {installment.position} of {installments.length}
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-3.5 py-4">
        {/* Where this payment sits in the schedule. */}
        <div>
          <div aria-hidden className="mb-2 flex gap-[5px]">
            {segments.map((state, index) => (
              <span
                key={index}
                className={cn("h-1.5 flex-1 rounded-full", SEGMENT_TONES[state])}
              />
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {materialsAdvance.label} paid &middot; {remaining}{" "}
            {remaining === 1 ? "installment" : "installments"} to go
          </p>
        </div>

        <Card padding="sm">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            You are funding
          </h2>
          <p className="text-[17px] font-bold tracking-[-0.02em] text-text">{installment.title}</p>
          <p className="mt-2 text-[13px] leading-[19px] text-text-secondary">
            {installment.deliverable}
          </p>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] text-text-muted">
            <CalendarGlyph />
            <span>
              {firstName} expects to finish this by{" "}
              <strong className="font-bold text-text">{installment.expectedCompletion}</strong>
            </span>
          </div>
        </Card>

        {/* Every rupee disclosed above the amount due, never after it. */}
        <Card padding="sm">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            What this payment covers
          </h2>
          <div className="flex flex-col gap-2">
            <MoneyRow
              label={`${firstName}’s work for this stage`}
              amount={installment.partnerService}
            />
            <MoneyRow label={taxLabel} amount={installment.tax} />
            <MoneyRow label="V Solve Hub fee and tax" amount={installment.platformFee} />
          </div>

          <div aria-hidden className="my-3 h-px bg-line" />

          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-text">Amount due now</span>
            <span className="text-[22px] font-extrabold tracking-[-0.02em] tabular-nums text-text">
              {installment.amount}
            </span>
          </div>
        </Card>

        <div className="flex gap-2.5 rounded-[var(--radius-card)] border border-info-line bg-info-surface px-3.5 py-3">
          <span aria-hidden className="mt-0.5 shrink-0 text-text-link">
            <LockGlyph />
          </span>
          <p className="text-[12.5px] leading-[18px] text-info-text">
            Work on this stage starts once the payment is confirmed.
            {hasNext
              ? ` Installment ${nextPosition} stays locked until you approve this one.`
              : ""}
          </p>
        </div>
      </main>

      {/* The reassurance sits above the action because it is the promise that
          makes the action safe to press — it has to be read before the tap, not
          discovered under it. */}
      <StepDock>
        <p className="text-center text-xs leading-5 text-text-muted">
          You are paying one stage, not the whole project.
        </p>
        <Button variant="primary" size="lg" block onClick={onPay}>
          Pay {installment.amount}
        </Button>
      </StepDock>
    </div>
  );
}
