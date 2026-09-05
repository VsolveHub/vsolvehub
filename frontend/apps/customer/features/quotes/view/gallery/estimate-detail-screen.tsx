import { Badge, Button, Card, Readout, StepDock } from "@vsolve/ui";

/**
 * One estimate, in full, before the customer commits to it.
 *
 * ## The order of the screen is the argument it makes
 *
 * The total comes first, on the readout plate, because it is the question. Then
 * the three facts that decide whether the total is good value. Then — and only
 * then — how the total was arrived at, line by line, ending on the same figure
 * the plate already showed. A customer who reads top to bottom is never
 * surprised, and a customer who reads only the plate is not misled, because the
 * plate's own caption says tax and fees are already inside it.
 *
 * ## Nothing here is editable, and the lock says so
 *
 * Every line in "How the price is built" is server-derived: the professional
 * quotes their work, the tax is statutory, and the V Solve Hub fee is published.
 * There is no input, no percentage the reader can turn, and no profit figure
 * anywhere — the platform's cut is disclosed as a rupee amount on its own row
 * rather than buried in a margin. The small lock glyph is there so the reader
 * knows the breakdown is a statement of fact and not an offer being tuned.
 *
 * ## Why the materials advance sits under the installments rather than in them
 *
 * It funds goods, not a stage of work. Folding it in would make "3 installments"
 * a lie and make the first payment look like it buys labour it does not buy, so
 * it is named separately in the footnote, with its share, before the customer
 * chooses.
 *
 * Pure: props in, JSX out.
 */

export interface EstimateDetailEstimate {
  /** "Item-wise" or "Labour-wise". Shown in the header, never inferred. */
  mode: string;
  startsOn: string;
  duration: string;
  warranty: string;
}

export interface EstimateDetailMoney {
  worksAndMaterials: string;
  /** e.g. "GST 18%". The rate is server-published; the client never names it. */
  taxLabel: string;
  tax: string;
  partnerQuote: string;
  platformFee: string;
  customerTotal: string;
  validUntil: string;
}

export interface EstimateDetailInstallment {
  position: number;
  title: string;
  amount: string;
  sharePercent: number;
  expectedCompletion: string;
}

export interface EstimateDetailAdvance {
  amount: string;
  sharePercent: number;
}

export interface EstimateDetailScreenProps {
  partnerName: string;
  estimate: EstimateDetailEstimate;
  money: EstimateDetailMoney;
  installments: readonly EstimateDetailInstallment[];
  materialsAdvance: EstimateDetailAdvance;
  onBack?: () => void;
  /** Opens the full priced schedule. The whole row is the control. */
  onSeePricedLines?: () => void;
  onChoose?: () => void;
}

/**
 * "Ravi's quote" reads as a person's price; "Ravi Kumar's quote" reads as a
 * legal document. The breakdown is the one place in the flow where the money is
 * attributed to a human being, so it uses the human form of the name.
 */
function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0];
}

/**
 * "Fri 12 Sep" → "12 Sep".
 *
 * The schedule rows carry a share and a date in eleven characters of space; the
 * weekday is what gets dropped, because the share is what the reader is
 * comparing across rows. The expanded date survives on the stage screen, where
 * there is one date and room for it.
 */
function withoutWeekday(dateLabel: string): string {
  return dateLabel.replace(/^[A-Za-z]{3}\s+/, "");
}

function ChevronRight() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function LockGlyph({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

/** One of the three sunken plates under the total. */
function FactPlate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-control bg-surface-sunken px-1 py-1.5 text-center">
      <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
        {label}
      </span>
      <span className="mt-0.5 block text-[13px] font-bold tabular-nums text-text">{value}</span>
    </div>
  );
}

export function EstimateDetailScreen({
  partnerName,
  estimate,
  money,
  installments,
  materialsAdvance,
  onBack,
  onSeePricedLines,
  onChoose,
}: EstimateDetailScreenProps) {
  const firstName = firstNameOf(partnerName);

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
            {partnerName}
          </h1>
          <div className="flex shrink-0 items-center pr-1">
            <Badge tone={estimate.mode === "Labour-wise" ? "info" : "action"}>
              {estimate.mode}
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5">
        {/* The one figure that must never be misread, on the system's readout
            plate — the same device used for countdowns and door codes. */}
        <Readout
          label="You pay in total"
          value={money.customerTotal}
          tone="active"
          caption={`Tax and V Solve Hub fees included. Valid until ${money.validUntil}.`}
          className="shrink-0"
        />

        <div className="flex gap-2">
          <FactPlate label="Starts" value={estimate.startsOn} />
          <FactPlate label="Duration" value={estimate.duration} />
          <FactPlate label="Warranty" value={estimate.warranty} />
        </div>

        <Card padding="sm">
          <div className="mb-2.5 flex items-center gap-1.5">
            <span className="text-text-muted">
              <LockGlyph className="h-[13px] w-[13px]" />
            </span>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
              How the price is built
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            <MoneyRow label="Work, materials and transport" amount={money.worksAndMaterials} />
            <MoneyRow label={money.taxLabel} amount={money.tax} />
            <MoneyRow label={`${firstName}’s quote`} amount={money.partnerQuote} />
            <MoneyRow label="V Solve Hub fee and tax" amount={money.platformFee} />
          </div>

          <div aria-hidden className="my-3 h-px bg-line" />

          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-text">You pay</span>
            <span className="text-lg font-extrabold tracking-[-0.02em] tabular-nums text-text">
              {money.customerTotal}
            </span>
          </div>

          <button
            type="button"
            onClick={onSeePricedLines}
            className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 border-t border-line pt-3 text-left text-[13px] font-semibold text-text-link hover:text-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span>See every priced line</span>
            <ChevronRight />
          </button>
        </Card>

        {/* Shown before selection, not after: how the money leaves the account is
            part of the offer, not a detail of the checkout. */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
            You pay in {installments.length} installments
          </h2>

          <ol className="flex flex-col gap-2">
            {installments.map((installment) => (
              <li
                key={installment.position}
                className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2"
              >
                <span
                  aria-hidden
                  className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-control bg-surface-sunken text-xs font-extrabold text-text-secondary"
                >
                  {installment.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-text">
                    {installment.title}
                  </span>
                  <span className="block text-[11px] tabular-nums text-text-muted">
                    {installment.sharePercent}% &middot; by{" "}
                    {withoutWeekday(installment.expectedCompletion)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-text">
                  {installment.amount}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-2 text-xs leading-[18px] text-text-muted">
            Plus a {materialsAdvance.amount} materials advance ({materialsAdvance.sharePercent}%)
            when you choose this estimate. You fund one installment at a time.
          </p>
        </section>
      </main>

      <StepDock>
        <Button variant="primary" size="lg" block onClick={onChoose}>
          Choose this estimate
        </Button>
      </StepDock>
    </div>
  );
}
