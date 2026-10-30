"use client";

import { Badge, Card, cn, useT } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { WorkspaceSummary } from "../model/home-summary";
import { translateNavLabel, translateWorkspaceDescription } from "../nav-labels";

/**
 * Each workspace on the global home, in its own words.
 *
 * Closes the presentation half of `M2-FE-112`.
 *
 * ## One card per workspace, never one list
 *
 * A Partner with both capabilities sees a Workforce card and a Projects card.
 * They do not see a merged feed, because a shift and a stage are not the same
 * kind of thing and putting them in one list forces one noun on both — the
 * erasure `M2-FE-111` forbids. Each count links into its own lifecycle view,
 * where the record keeps its own vocabulary.
 *
 * ## Why a quiet workspace still renders
 *
 * "Nothing right now" and "you no longer have this" look identical if the card
 * disappears when the counts are zero. The first is a normal Tuesday; the second
 * is something the Partner needs to act on. So the card stays and says which.
 *
 * ## Nothing here is a record
 *
 * Counts and labels only. No customer name, no address, no amount — a home
 * screen is read in public and on a shared phone, and an aggregate that started
 * carrying record detail would be the leak nobody reviewed, arriving one field
 * at a time.
 */

export interface WorkspaceSummariesProps {
  readonly summaries: readonly WorkspaceSummary[];
  readonly className?: string;
}

export function WorkspaceSummaries({ summaries, className }: WorkspaceSummariesProps) {
  const t = useT();
  // An A1 Partner holds none, and their home stays exactly as it is today.
  if (summaries.length === 0) return null;

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label={t("workspaces.summaries.ariaLabel")}>
      {summaries.map((summary) => (
        <Card key={summary.key} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-text">{translateNavLabel(t, summary.label)}</h3>
                {summary.needsAttention ? <Badge tone="warning">{t("workspaces.summaries.needsYou")}</Badge> : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {translateWorkspaceDescription(t, summary.description)}
              </p>
            </div>
            <Link
              href={summary.home}
              aria-label={t("workspaces.summaries.open", { label: translateNavLabel(t, summary.label) })}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <ChevronRight size={18} aria-hidden />
            </Link>
          </div>

          {summary.isQuiet ? (
            <p className="mt-3 text-sm text-text-muted">
              {t("workspaces.summaries.quiet")}
            </p>
          ) : (
            <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
              {summary.counts
                .filter((entry) => entry.count > 0)
                .map((entry) => (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      // Named explicitly rather than left to the name
                      // computation. The count and the noun are separate
                      // elements with no whitespace between them, and engines
                      // disagree about whether a separator belongs there — the
                      // announcement is "3shifts today" wherever they decide it
                      // does not.
                      aria-label={`${entry.count} ${entry.label}`}
                      className={cn(
                        "flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-semibold",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                        entry.needsAttention
                          ? "bg-warning-surface text-warning-text"
                          : "bg-surface-sunken text-text-secondary hover:bg-surface-hover",
                      )}
                    >
                      <span className="tabular-nums">{entry.count}</span>
                      {/* The lifecycle's own noun, supplied by the caller. A
                          generic "items" here would be the merge arriving as
                          copy instead of as data. */}
                      <span className="font-medium">{entry.label}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ))}
    </section>
  );
}
