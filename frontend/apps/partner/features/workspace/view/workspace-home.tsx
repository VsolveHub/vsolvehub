"use client";

import { Card } from "@vsolve/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { ResolvedWorkspace } from "../registry";

/**
 * A workspace's own front page: what you are approved for, and where it leads.
 *
 * Everything here comes from the grant Django published. There are no counts,
 * because no read publishes them yet and a zero would be indistinguishable from
 * an unread one — "0 shifts today" on a day with three shifts is worse than no
 * number at all.
 *
 * ## Why the payment line is read and not derived
 *
 * ADR-0007 fixes one commercial mode per archetype, which makes it tempting to
 * print the sentence straight off the workspace key. But this is the line that
 * decides whether a Partner expects Vsolve to hold their money or expects to
 * collect it themselves, and a client that computed it would keep promising the
 * wrong one through a policy change nobody redeployed the frontend for. An
 * unrecognised mode prints nothing rather than a guess.
 */

const PAYMENT_COPY: Record<string, string> = {
  LEAD_ONLY: "The customer pays you directly. Vsolve introduces the work and does not hold the money.",
  MANAGED_PAYMENT_REQUIRED:
    "Vsolve holds the money for each stage and releases it once the customer approves that stage.",
};

export interface WorkspaceHomeProps {
  readonly workspace: ResolvedWorkspace;
}

export function WorkspaceHome({ workspace }: WorkspaceHomeProps) {
  const payment =
    workspace.grant.commercialMode === null ? null : PAYMENT_COPY[workspace.grant.commercialMode];

  // The home itself is the page being read; linking to it from its own list
  // would be a destination that goes nowhere.
  const destinations = workspace.authorizedNav.filter((item) => item.href !== workspace.home);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text">{workspace.label}</h1>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{workspace.description}</p>
      </header>

      {payment ? (
        <Card className="p-4 text-sm leading-6 text-text-secondary">{payment}</Card>
      ) : null}

      {destinations.length > 0 ? (
        <nav aria-label={`${workspace.label} sections`}>
          <ul className="flex list-none flex-col gap-2 p-0">
            {destinations.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <span className="flex items-center gap-3">
                    <item.icon size={18} aria-hidden className="text-text-muted" />
                    {item.label}
                  </span>
                  <ChevronRight size={18} aria-hidden className="text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        // Reachable and not an error: 0012 §A1 expresses a suspension by
        // stripping the actions, and the workspace stays readable so the Partner
        // can see it is still theirs while nothing inside it is available.
        <Card className="p-4 text-sm leading-6 text-text-secondary">
          Nothing in this workspace is available to you right now. Contact support if you expected
          something here.
        </Card>
      )}
    </div>
  );
}
