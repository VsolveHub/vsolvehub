import { Badge, Card, cn } from "@vsolve/ui";

/**
 * Three estimates, side by side, without pretending they are the same thing.
 *
 * ## Why there is no "cheapest" badge
 *
 * The three quotes on this screen are not comparable on price and the numbers
 * say so: ₹1,06,082 buys nine days and six months of warranty, ₹1,71,600 buys
 * two years. A badge on the lowest total would be the platform telling a
 * customer which one is better — a judgement it cannot make, because it does not
 * know whether this bathroom is being sold next year or lived in for ten. So the
 * screen ranks nothing. It sets the total large because it is the figure people
 * came for, then puts the four facts that change the answer directly underneath
 * at equal weight, and lets the reader draw their own conclusion.
 *
 * ## Why the mode badge is the loudest thing after the total
 *
 * An item-wise estimate prices every fitting; a labour-wise one prices days of
 * work and leaves materials to the customer. Reading the second as if it were
 * the first is the single most expensive misunderstanding available on this
 * screen, so the two tones are visibly different and the word is always spelled
 * out — never a colour on its own.
 *
 * Pure: props in, JSX out. It fetches nothing and holds no state.
 */

export interface CompareEstimate {
  id: string;
  partnerName: string;
  /** Two letters. Sample data supplies them; nothing here derives an avatar. */
  initials: string;
  rating: string;
  visitCount: number;
  /** "Item-wise" or "Labour-wise" — the pricing basis, spelled out. */
  mode: string;
  /** Server-formatted. This screen displays money and never computes it. */
  total: string;
  startsOn: string;
  duration: string;
  warranty: string;
  installmentCount: number;
}

export interface EstimatesCompareScreenProps {
  estimates: readonly CompareEstimate[];
  onBack?: () => void;
  /** Opens one estimate in full. The whole footer row is the control. */
  onOpen?: (estimateId: string) => void;
}

/**
 * A labour-wise quote reads as information about *how* it is priced, not as a
 * promotion — so it takes the info tone and item-wise takes the brand one. Any
 * unknown mode falls back to the brand tone rather than throwing: a new pricing
 * basis added server-side should render plainly, not blank the card.
 */
function modeTone(mode: string): "action" | "info" {
  return mode === "Labour-wise" ? "info" : "action";
}

/**
 * Avatars are tinted by position, not by identity, so three cards in a column
 * stay tellable apart at a glance. All three steps are navy — the orange in this
 * system means "act on this", and an avatar is not an action.
 */
const AVATAR_TINTS = ["bg-navy-700", "bg-navy-600", "bg-navy-500"] as const;

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

/** One label-over-value pair in the 2x2 grid. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-text">{value}</dd>
    </div>
  );
}

export function EstimatesCompareScreen({
  estimates,
  onBack,
  onOpen,
}: EstimatesCompareScreenProps) {
  return (
    // `h-full`, not `100dvh`: this screen is rendered inside a fixed phone-sized
    // frame in the gallery, where a viewport-height column would push its own
    // content out of the frame.
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
            {estimates.length} estimates
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 pb-6 pt-3.5">
        {/* Said once, at the top, where it frames everything below it. */}
        <p className="text-[12.5px] leading-[18px] text-text-muted">
          Different professionals price differently. Compare the plan, not only the total.
        </p>

        {estimates.map((estimate, index) => (
          <Card key={estimate.id} padding="sm">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-text-inverse",
                  AVATAR_TINTS[index % AVATAR_TINTS.length],
                )}
              >
                {estimate.initials}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold tracking-[-0.015em] text-text">
                  {estimate.partnerName}
                </span>
                <span className="block text-[11.5px] text-text-muted">
                  {estimate.rating} rating &middot; {estimate.visitCount} visits
                </span>
              </span>

              <Badge tone={modeTone(estimate.mode)}>{estimate.mode}</Badge>
            </div>

            {/* The figure people came for, set larger than anything else on the
                card — but never alone, which is why the facts follow it. */}
            <p className="mt-3 text-[26px] font-extrabold tracking-[-0.025em] tabular-nums text-text">
              {estimate.total}
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <Fact label="Starts" value={estimate.startsOn} />
              <Fact label="Duration" value={estimate.duration} />
              <Fact label="Warranty" value={estimate.warranty} />
              <Fact
                label="Payments"
                value={`${estimate.installmentCount} installments`}
              />
            </dl>

            {/* The row is the target, not the words inside it: a 13px link on a
                phone is a miss waiting to happen. */}
            <button
              type="button"
              onClick={onOpen === undefined ? undefined : () => onOpen(estimate.id)}
              className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 border-t border-line pt-3 text-left text-[13.5px] font-semibold text-text-link hover:text-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span>
                Open full estimate
                {/* Three identical rows need three different names in a screen
                    reader's list of controls. */}
                <span className="sr-only"> from {estimate.partnerName}</span>
              </span>
              <ChevronRight />
            </button>
          </Card>
        ))}
      </main>
    </div>
  );
}
