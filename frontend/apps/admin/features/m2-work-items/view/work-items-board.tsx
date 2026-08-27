"use client";

import { cn } from "@vsolve/ui";
import { useState } from "react";

import { CustomItemReviewQueue } from "./custom-item-review-queue";
import { GuardrailPolicyPanel } from "./guardrail-policy-panel";
import { WorkItemCatalog } from "./work-item-catalog";

/**
 * Phase A: the vendor price book, Operations' side (contract 1.46.0).
 *
 * Three sections, one screen: the catalog every Partner rate card is built
 * from, the guardrail policy every rate and quote is checked against, and
 * the review queue that lets the catalog learn from what Partners actually
 * price on the ground. See `docs/prompts/vendor-price-book-build-prompt.md`.
 */

const SECTIONS = [
  { key: "catalog", label: "Catalog" },
  { key: "guardrails", label: "Guardrail policy" },
  { key: "reviews", label: "Custom-item reviews" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export function WorkItemsBoard() {
  const [section, setSection] = useState<SectionKey>("catalog");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Work items</h1>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          The catalog every Partner&rsquo;s item-wise rate card is built from, the
          percentages every rate and quote are checked against, and the items
          Partners have priced outside the catalog.
        </p>
      </div>

      <div role="tablist" aria-label="Work items sections" className="flex flex-wrap gap-2 border-b border-line pb-2">
        {SECTIONS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={section === entry.key}
            onClick={() => setSection(entry.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              section === entry.key
                ? "bg-action text-action-text"
                : "bg-surface-sunken text-text-secondary hover:text-text",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {section === "catalog" ? <WorkItemCatalog /> : null}
      {section === "guardrails" ? <GuardrailPolicyPanel /> : null}
      {section === "reviews" ? <CustomItemReviewQueue /> : null}
    </div>
  );
}
