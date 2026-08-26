"use client";

import { Check, CreditCard, Info, Lock, RotateCcw, Smartphone } from "lucide-react";
import { Button, Readout, cn } from "@vsolve/ui";

/**
 * A5 · Visit checkout — the one payment in this flow, and what it is not.
 *
 * ## The disclosure is the screen
 *
 * The single most expensive misunderstanding this product can create is a
 * customer believing the visit fee is the price of the job. They pay ₹499,
 * three professionals turn up, and the first estimate says ₹1,52,810. If that
 * is a surprise, the trust is gone and no refund policy repairs it.
 *
 * So the disclosure is not a footnote, a tooltip or a line inside a collapsed
 * "Terms" block. It is a full-width tinted panel in the reading order, above the
 * payment methods, phrased as a plain sentence with the word *not* carrying
 * weight. It sits in the scroll region rather than in the dock, because the dock
 * is for the action and a legal disclosure must not be something a customer can
 * scroll past to reach the button.
 *
 * ## Why the refund promise is per visit
 *
 * The plan buys three estimates and they are matched independently — one slot
 * can fail while the others hold. "Refunded if we cannot find anyone" would be
 * read as all-or-nothing, so the sentence names the unit: per visit.
 *
 * ## Why the countdown is a `Readout` and not a heading
 *
 * The hold is one of the three values in this product that must never be
 * misread. `Readout` is the device that marks those, and its `warning` tone says
 * the number is running down without dressing a normal checkout as an error.
 * The value is formatted by the caller against the server clock — this screen
 * owns no timer and reads no device clock.
 *
 * ## Why this is a gallery component and not a route
 *
 * BE-2/BE-3/BE-4 are unpublished: there is no customer-facing checkout DTO to
 * render from. This is a pure component — props in, JSX out, no fetching and no
 * data state — rendered from fixed sample values at `/design/m2/visit-checkout`.
 * It carries its own shell for the same reason `ChooseVisitsScreen` does:
 * `MobileScreen`'s `min-h-[100dvh]` root would push this dock under the bottom
 * edge of a 390x844 artboard frame.
 */

export interface VisitCheckoutHold {
  /** "9:41". Already formatted against the server clock by the caller. */
  remaining: string;
  /** "Ravi K." */
  professionalName: string;
  /** "Tue 2 Sep". */
  day: string;
  /** "10:00 – 12:00". */
  window: string;
}

export interface VisitCheckoutPlan {
  /** How many estimates the plan buys. */
  planSize: number;
  /** Server-published. Every figure here is a string: the client displays money and never computes it. */
  planPriceLabel: string;
  /** Signed, e.g. "−₹0". */
  creditsLabel: string;
  amountDueLabel: string;
}

export type PaymentMethodId = "UPI" | "CARD";

export interface VisitCheckoutScreenProps {
  hold: VisitCheckoutHold;
  plan: VisitCheckoutPlan;
  selectedMethod: PaymentMethodId;
  onBack?: () => void;
  onSelectMethod?: (method: PaymentMethodId) => void;
  onPay?: () => void;
}

/**
 * What the customer can pay with.
 *
 * A module constant rather than a prop: these are the two methods the gateway is
 * configured for, and a screen that could be handed an arbitrary list would need
 * an icon for a method nobody has designed one for. When a third arrives it is
 * added here, once.
 */
const PAYMENT_METHODS: readonly {
  id: PaymentMethodId;
  label: string;
  note?: string;
}[] = [
  { id: "UPI", label: "UPI", note: "GPay, PhonePe, Paytm" },
  { id: "CARD", label: "Card" },
];

function MethodIcon({ id, className }: { id: PaymentMethodId; className?: string }) {
  return id === "UPI" ? (
    <Smartphone aria-hidden className={className} />
  ) : (
    <CreditCard aria-hidden className={className} />
  );
}

/**
 * One payment method.
 *
 * A native radio inside the label, so the group announcement, the arrow-key
 * navigation and the checked state all come from the platform rather than from
 * `aria-*` written here. The whole row is the target — 52px tall, comfortably
 * over the 44px floor — and the chosen row thickens its border by a pixel while
 * losing one of padding, so choosing never nudges the row beside it.
 */
function PaymentMethodRow({
  method,
  checked,
  onSelect,
}: {
  method: (typeof PAYMENT_METHODS)[number];
  checked: boolean;
  onSelect?: (method: PaymentMethodId) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-card bg-surface",
        "transition-colors duration-fast",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
        "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
        checked
          ? "border-2 border-selected px-[13px] py-[7px]"
          : "border border-line px-[14px] py-2 hover:bg-surface-hover",
      )}
    >
      <input
        type="radio"
        name="visit-payment-method"
        value={method.id}
        checked={checked}
        onChange={() => onSelect?.(method.id)}
        className="sr-only"
      />

      <span
        aria-hidden
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
          checked ? "bg-selected text-text-inverse" : "bg-surface-sunken text-text-secondary",
        )}
      >
        <MethodIcon id={method.id} className="h-[18px] w-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm text-text", checked ? "font-bold" : "font-semibold")}>
          {method.label}
        </span>
        {method.note !== undefined ? (
          <span className="block text-[11.5px] text-text-muted">{method.note}</span>
        ) : null}
      </span>

      {checked ? <Check aria-hidden className="h-4 w-4 shrink-0 text-selected" /> : null}
    </label>
  );
}

export function VisitCheckoutScreen({
  hold,
  plan,
  selectedMethod,
  onBack,
  onSelectMethod,
  onPay,
}: VisitCheckoutScreenProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface pt-11">
        <div className="flex h-14 items-center gap-1 px-1">
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control",
              "text-text-secondary hover:bg-surface-hover hover:text-text",
            )}
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
            Confirm your visits
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-[14px] overflow-y-auto px-[14px] py-4">
        <Readout
          tone="warning"
          size="sm"
          label="Hold expires in"
          value={hold.remaining}
          caption={`${hold.professionalName} is holding ${hold.day}, ${hold.window}.`}
        />

        <section className="rounded-card border border-line bg-surface p-[14px] shadow-card">
          <h2 className="text-sm font-bold tracking-[-0.015em] text-text">
            {`Visit plan — ${plan.planSize} ${plan.planSize === 1 ? "estimate" : "estimates"}`}
          </h2>

          <dl className="mt-3 flex flex-col gap-2">
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-text-secondary">Visit plan</dt>
              <dd className="m-0 font-medium tabular-nums text-text">{plan.planPriceLabel}</dd>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-text-secondary">Credits</dt>
              <dd className="m-0 font-medium tabular-nums text-text">{plan.creditsLabel}</dd>
            </div>

            {/* The rule belongs to the total rather than sitting between two
                rows as a bare element, so the list stays a valid description
                list and the divider cannot drift away from what it separates. */}
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="text-sm font-bold text-text">Amount due</dt>
              <dd className="m-0 text-[22px] font-extrabold tracking-[-0.02em] tabular-nums text-text">
                {plan.amountDueLabel}
              </dd>
            </div>
          </dl>
        </section>

        {/* The disclosure that must survive every redesign. */}
        <div className="flex gap-2.5 rounded-card border border-info-line bg-info-surface px-[14px] py-3">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-text" />
          <p className="text-[12.5px] leading-[18px] text-info-text">
            This visit fee is <strong className="font-bold">not</strong> the project price. Each
            professional prices the work in writing after seeing the site.
          </p>
        </div>

        <div className="flex gap-2.5 px-0.5">
          <RotateCcw aria-hidden className="mt-px h-4 w-4 shrink-0 text-success-text" />
          <p className="text-[12.5px] leading-[18px] text-text-secondary">
            Any visit that does not happen is refunded automatically — per visit, not
            all-or-nothing.
          </p>
        </div>

        <fieldset className="border-0 p-0">
          <legend className="mb-2 text-[13px] font-semibold text-text">Pay with</legend>
          <div className="flex flex-col gap-2">
            {PAYMENT_METHODS.map((method) => (
              <PaymentMethodRow
                key={method.id}
                method={method}
                checked={method.id === selectedMethod}
                onSelect={onSelectMethod}
              />
            ))}
          </div>
        </fieldset>
      </main>

      <footer
        className={cn(
          "shrink-0 border-t border-line bg-surface px-3.5 pt-3",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Who holds the money, named above the button rather than after it.
              A customer about to enter a UPI PIN is entitled to know whose
              screen they are about to be handed to. */}
          <p className="flex items-center justify-center gap-1.5 text-xs leading-5 text-text-muted">
            <Lock aria-hidden className="h-3.5 w-3.5" />
            Payments are handled by Razorpay
          </p>
          <Button block onClick={onPay} className="h-[50px] rounded-[11px] text-[15px]">
            {`Pay ${plan.amountDueLabel}`}
          </Button>
        </div>
      </footer>
    </div>
  );
}
