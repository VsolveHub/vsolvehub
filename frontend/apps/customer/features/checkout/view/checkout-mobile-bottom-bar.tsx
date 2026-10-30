"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button, Dialog } from "@vsolve/ui";
import { useState } from "react";

import type { GroupQuote } from "../queries";
import { Money } from "./money";

const LINE_KIND_HINTS: Record<Schemas["QuoteLineKindEnum"], string | null> = {
  SERVICE: null,
  MINIMUM_VISIT_ADJUSTMENT: "Minimum charge for this visit",
  PLATFORM_FEE_ALLOCATION: "This visit's share of the platform fee",
};

export interface CheckoutMobileBottomBarProps {
  quote: GroupQuote | null;
  showConfirmButton?: boolean;
  onConfirm?: () => void;
  isConfirmDisabled?: boolean;
  isConfirmLoading?: boolean;
  confirmLoadingLabel?: string;
}

export function CheckoutMobileBottomBar({
  quote,
  showConfirmButton = false,
  onConfirm,
  isConfirmDisabled = false,
  isConfirmLoading = false,
  confirmLoadingLabel,
}: CheckoutMobileBottomBarProps) {
  const [breakupOpen, setBreakupOpen] = useState(false);

  if (quote === null || quote.status !== "ACTIVE") {
    return null;
  }

  return (
    <>
      <div
        aria-label="Amount to pay"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden transition-all duration-200"
      >
        <div className="mx-auto w-full max-w-lg">
          {showConfirmButton ? (
            <div className="flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-text-secondary">To pay:</span>
                  <Money
                    value={quote.total}
                    className="text-lg font-bold tabular-nums text-text"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBreakupOpen(true)}
                  className="mt-0.5 block text-xs font-medium text-text-secondary underline decoration-dotted underline-offset-2"
                >
                  View breakup
                </button>
              </div>

              <Button
                className="shrink-0 px-5 shadow-sm font-bold min-h-11"
                disabled={isConfirmDisabled}
                loading={isConfirmLoading}
                loadingLabel={confirmLoadingLabel}
                onClick={onConfirm}
              >
                Confirm booking
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 transition-all duration-200">
              <div>
                <span className="text-xs font-semibold text-text-secondary">Amount to pay</span>
                <div className="mt-0.5">
                  <button
                    type="button"
                    onClick={() => setBreakupOpen(true)}
                    className="text-xs font-medium text-text-secondary underline decoration-dotted underline-offset-4"
                  >
                    View breakup
                  </button>
                </div>
              </div>
              <Money
                value={quote.total}
                className="text-xl font-bold tabular-nums text-text"
              />
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={breakupOpen}
        onOpenChange={setBreakupOpen}
        title="Price breakup"
      >
        <div className="mt-2 space-y-4">
          {quote.units.map((unit, index) => (
            <section key={unit.id} className="space-y-2 border-b border-line pb-3 last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-text">
                  Visit {index + 1} of {quote.units.length}
                </h3>
                <Money
                  value={unit.total}
                  className="text-sm font-semibold tabular-nums text-text"
                />
              </div>
              <p className="text-xs text-text-secondary">
                <time dateTime={unit.starts_at}>
                  {new Date(unit.starts_at).toLocaleString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </p>
              <dl className="flex flex-col gap-2 text-sm">
                {unit.lines.map((line) => {
                  const hint = LINE_KIND_HINTS[line.kind];
                  return (
                    <div key={line.id} className="flex justify-between gap-3">
                      <dt className="min-w-0 text-text">
                        {line.label}
                        {line.quantity > 1 ? (
                          <span className="text-text-secondary"> × {line.quantity}</span>
                        ) : null}
                        {hint ? (
                          <span className="block text-xs text-text-secondary">{hint}</span>
                        ) : null}
                      </dt>
                      <dd className="shrink-0 tabular-nums text-text">
                        <Money value={line.amount} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}

          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <span className="text-sm font-bold text-text">Total</span>
            <Money
              value={quote.total}
              className="text-lg font-bold tabular-nums text-text"
            />
          </div>
          <p className="text-xs text-text-secondary">Includes taxes and charges.</p>
        </div>
      </Dialog>
    </>
  );
}
