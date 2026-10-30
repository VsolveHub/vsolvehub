import type { ReactNode } from "react";

const CHECKOUT_CARD =
  "overflow-hidden rounded-xl border border-line/80 bg-surface shadow-[0_1px_2px_rgba(0,17,46,0.05)]";
export { CHECKOUT_CARD as checkoutCardClass };

export function CheckoutCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${CHECKOUT_CARD} ${className ?? ""}`}>{children}</div>;
}

export function SecureBookingBadge({ className }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 ${className ?? ""}`}>
      <span
        aria-hidden
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FFF4EB] text-action"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4.5" stroke="currentColor" strokeWidth="1.5">
          <path
            d="M10 2.5 4 5v5c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V5l-6-2.5Z"
            strokeLinejoin="round"
          />
          <path d="m7.5 10 1.75 1.75L12.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-bold text-text">Secure booking</p>
        <p className="text-xs leading-relaxed text-text-secondary">Your data is safe with us.</p>
      </div>
    </div>
  );
}

export function CheckoutCancellationPanel({
  quoteUnitCount,
}: {
  quoteUnitCount: number;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#FDE6D5] bg-[#FFF7F0] px-4 py-3.5 sm:px-5 sm:py-4">
      <span
        aria-hidden
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FFE8D6] text-action"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4.5" stroke="currentColor" strokeWidth="1.5">
          <path
            d="M10 2.5 4 5v5c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V5l-6-2.5Z"
            strokeLinejoin="round"
          />
          <path d="m7.5 10 1.75 1.75L12.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-text">Cancellation policy</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          Free cancellation before a professional is assigned. After that a fee may apply,
          depending on how close the visit is.
          {quoteUnitCount > 1
            ? " Each visit has its own terms, because each one is a separate appointment."
            : ""}
        </p>
      </div>
    </div>
  );
}
