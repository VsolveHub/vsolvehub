"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The four screens of the review workspace.
 *
 * One nav entry, four screens. `Cases` is already in the shell's workspace list and the sidebar
 * is not this feature's to extend, so the money, signals and touch screens hang off the case
 * route rather than claiming three more entries in a sidebar that is already thirteen long. They
 * belong together anyway: all four are the same job — somebody looking at a claim, the money
 * behind it, the signals around it and what it cost to work.
 */

const TABS: { href: string; label: string }[] = [
  { href: "/operations/cases", label: "Cases" },
  { href: "/operations/cases/money", label: "Refunds and holds" },
  { href: "/operations/cases/signals", label: "Review signals" },
  { href: "/operations/cases/touches", label: "Touches" },
];

export function CasesTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Case review screens" className="mt-4 border-b border-line">
      <ul className="-mb-px flex list-none flex-wrap gap-1 p-0">
        {TABS.map((tab) => {
          // Exact match only. `startsWith` would light "Cases" up on every screen below it, which
          // is how a person loses track of which of four screens they are on.
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-action text-text-link"
                    : "border-transparent text-text-secondary hover:border-line-strong hover:text-text",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
