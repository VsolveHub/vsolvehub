"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import type { StayProperty } from "../model";
import { StayQuotePanel } from "./stay-quote-panel";
import { StayVisitPanel } from "./stay-visit-panel";

type Mode = "enquire" | "visit";

/**
 * The right-hand panel on a stay: "Enquire" or, when the owner offers visiting times,
 * "Schedule a visit".
 */
export function StayActionPanel({
  property,
  onSelectUnit,
  onViewProperty,
}: {
  property: StayProperty;
  onSelectUnit?: (unitId: string) => void;
  onViewProperty?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("enquire");
  const visits = Boolean(property.visits_offered);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-text">
          {mode === "visit" ? "Schedule a visit" : "Send an enquiry"}
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="size-3.5" aria-hidden />
          Verified host
        </span>
      </div>

      {visits ? (
        <div
          role="tablist"
          aria-label="How to get in touch"
          className="mt-4 grid grid-cols-2 gap-1 rounded-control border border-line bg-surface-sunken p-1"
        >
          {(
            [
              ["enquire", "Enquire"],
              ["visit", "Schedule a visit"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-xs font-bold transition ${
                mode === value ? "bg-surface text-text shadow-xs" : "text-text-secondary hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        {mode === "visit" && visits ? (
          <StayVisitPanel property={property} />
        ) : (
          <StayQuotePanel
            property={property}
            onSelectUnit={onSelectUnit}
            onViewProperty={onViewProperty}
            embedded
          />
        )}
      </div>
    </div>
  );
}
