"use client";

import type { Schemas } from "@vsolve/api-client";
import { Dialog } from "@vsolve/ui";
import { useState } from "react";

import type { GroupQuote } from "../queries";
import { Money } from "./money";

const LINE_KIND_HINTS: Record<Schemas["QuoteLineKindEnum"], string | null> = {
  SERVICE: null,
  MINIMUM_VISIT_ADJUSTMENT: "Minimum charge for this visit",
  PLATFORM_FEE_ALLOCATION: "This visit's share of the platform fee",
};

export function CheckoutMobileBottomBar({ quote }: { quote: GroupQuote | null }) {
  const [breakupOpen, setBreakupOpen] = useState(false);

  if (quote === null || quote.status !== "ACTIVE") {
    return null;
  }

  return (
    <>
      <div
        aria-label="Amount to pay"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 py-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden"
      >
        <div className="mx-auto w-full max-w-lg">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-text">Amount to pay</span>
            <Money
              value={quote.total}
              className="text-xl font-bold tabular-nums text-text"
            />
          </div>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setBreakupOpen(true)}
              className="text-sm font-medium text-text-secondary underline decoration-dotted underline-offset-4"
            >
              View breakup
            </button>
          </div>
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
