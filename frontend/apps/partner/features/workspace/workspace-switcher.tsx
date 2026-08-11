"use client";

import { cn } from "@vsolve/ui";
import Link from "next/link";

import type { ResolvedWorkspace } from "./registry";

/**
 * Moves a multi-capability Partner between their workspaces.
 *
 * Closes the switcher half of `M2-FE-007` and the multi-workspace case of
 * `M2-FE-004`.
 *
 * ## Why links rather than a state toggle
 *
 * Each workspace owns real routes, so switching *is* a navigation. A toggle
 * holding the choice in client state would give both workspaces one URL —
 * unshareable, unbookmarkable, and wrong after a back button. Links also mean
 * the browser announces the change without this component doing anything.
 *
 * ## Why it disappears below two entries
 *
 * A control offering one option is furniture. A Partner with a single capability
 * gets their tabs and nothing else; the switcher appears the moment there is a
 * genuine choice, which is also the moment its purpose is self-evident.
 *
 * ## Accessibility
 *
 * A labelled `nav` with `aria-current="page"` on the active entry. Not a
 * `tablist` — the panels are separate documents rather than sections of this
 * one, and claiming tab semantics would promise arrow-key movement between
 * panels that are not there.
 */

export interface WorkspaceSwitcherProps {
  workspaces: readonly ResolvedWorkspace[];
  /** The workspace the current route belongs to, or null when on the base app. */
  active: ResolvedWorkspace | null;
  /** Where "Home" returns to — the M1 app every Partner keeps. */
  baseHref?: string;
  baseLabel?: string;
  className?: string;
}

export function WorkspaceSwitcher({
  workspaces,
  active,
  baseHref = "/dashboard",
  baseLabel = "Home",
  className,
}: WorkspaceSwitcherProps) {
  if (workspaces.length === 0) return null;

  const entries = [
    { key: "__base__", href: baseHref, label: baseLabel, isActive: active === null },
    ...workspaces.map((workspace) => ({
      key: workspace.key,
      href: workspace.home,
      label: workspace.label,
      isActive: active?.key === workspace.key,
    })),
  ];

  return (
    <nav aria-label="Workspace" className={cn("overflow-x-auto", className)}>
      <ul className="flex list-none gap-1 p-0">
        {entries.map((entry) => (
          <li key={entry.key}>
            <Link
              href={entry.href}
              aria-current={entry.isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3.5",
                "text-sm font-semibold transition-colors duration-fast ease-out",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                entry.isActive
                  ? "bg-selected-surface text-action-secondary"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text",
              )}
            >
              {entry.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
