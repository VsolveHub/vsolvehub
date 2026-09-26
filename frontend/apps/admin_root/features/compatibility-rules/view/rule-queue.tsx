"use client";

import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import {
  describeLifecycle,
  describeMode,
  isOwnProposal,
  lifecycleTone,
} from "../model/lifecycle";
import { useActorId, useCompatibilityRules, type RuleFilters } from "../queries";

/**
 * Rules waiting on a decision, and rules already in force.
 *
 * ## Provenance is on the row, not just the detail
 *
 * Every draft says whether the signed-in operator proposed it. That is the one
 * thing they cannot act on, and finding it out only after opening the rule and
 * hunting for a missing button is how a queue teaches people that the console is
 * broken. "Yours" is a fact about the row, so it belongs on the row.
 *
 * ## Cursor pages
 *
 * Drafts are proposed while an operator is reading, so an offset would skip or
 * repeat rows as the list shifts. Pages append rather than replace, so scrolling
 * position survives loading more.
 */

type Rule = Schemas["CompatibilityRule"];

const FILTER_TABS: { label: string; filters: RuleFilters }[] = [
  { label: "Awaiting review", filters: { lifecycleStatus: "DRAFT" } },
  { label: "Active", filters: { lifecycleStatus: "ACTIVE" } },
  { label: "Retired", filters: { lifecycleStatus: "RETIRED" } },
  { label: "Rejected", filters: { lifecycleStatus: "REJECTED" } },
  { label: "All", filters: {} },
];

function pairLabel(rule: Rule): string {
  return `${rule.left_service_name} · ${rule.left_variant_name} with ${rule.right_service_name} · ${rule.right_variant_name}`;
}

export function RuleQueue({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (ruleId: string) => void;
}) {
  const [tab, setTab] = useState(0);
  const filters = FILTER_TABS[tab]?.filters ?? {};
  const rules = useCompatibilityRules(filters);
  const actorId = useActorId();

  const items = rules.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <section aria-labelledby="rule-queue-title">
      <h2 id="rule-queue-title" className="text-base font-bold text-text">
        Compatibility rules
      </h2>

      <div role="tablist" aria-label="Rule filters" className="mt-3 flex flex-wrap gap-2">
        {FILTER_TABS.map((entry, index) => (
          <button
            key={entry.label}
            role="tab"
            type="button"
            aria-selected={tab === index}
            onClick={() => setTab(index)}
            className={[
              "min-h-11 rounded-control px-3 text-sm font-semibold",
              tab === index
                ? "bg-action-secondary text-action-secondary-text"
                : "bg-surface text-text-secondary hover:bg-surface-hover",
            ].join(" ")}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {rules.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-text-secondary">
          <Spinner size="sm" />
          Loading rules…
        </p>
      ) : rules.isError ? (
        <ErrorState
          className="mt-4"
          title="We could not load the rules"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void rules.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          title="Nothing here"
          description="No rules match this filter right now."
        />
      ) : (
        <>
          <ul className="mt-4 flex list-none flex-col gap-2 p-0">
            {items.map((rule) => {
              const mine = isOwnProposal(rule, { actorId });

              return (
                <li key={rule.id}>
                  <Card
                    className={[
                      "cursor-pointer p-4 transition-colors hover:bg-surface-hover",
                      selectedId === rule.id ? "border-action" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(rule.id)}
                      aria-current={selectedId === rule.id ? "true" : undefined}
                      className="w-full text-left"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-text">{pairLabel(rule)}</span>
                        <div className="flex items-center gap-2">
                          {mine && rule.lifecycle_status === "DRAFT" ? (
                            // Said before the click, not after: this is the one
                            // row in the queue they cannot decide.
                            <Badge tone="neutral">Your proposal</Badge>
                          ) : null}
                          <Badge tone={lifecycleTone(rule.lifecycle_status)}>
                            {describeLifecycle(rule.lifecycle_status)}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {describeMode(rule.mode)} · version{" "}
                        <span data-numeric>{rule.version}</span>
                      </p>
                    </button>
                  </Card>
                </li>
              );
            })}
          </ul>

          {rules.hasNextPage ? (
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void rules.fetchNextPage()}
              loading={rules.isFetchingNextPage}
              loadingLabel="Loading more"
            >
              Load more
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
