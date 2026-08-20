"use client";

import { cn } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation within the account area.
 *
 * A rail beside the content on desktop, a scrolling row above it on mobile.
 * Ordered by how often it is needed rather than by how the API is grouped:
 * addresses are why almost everyone comes here, and the privacy record is
 * something people look for once.
 *
 * `aria-current="page"` rather than styling alone — the underline is the visual
 * cue and this is the one screen readers get.
 */

const SECTIONS = [
  { href: "/account", label: "Profile", hint: "Your personal details" },
  { href: "/account/addresses", label: "Addresses", hint: "Where we send someone" },
  { href: "/account/messages", label: "Messages", hint: "What we send you" },
  { href: "/account/privacy", label: "Privacy", hint: "Your data and consents" },
  { href: "/account/sessions", label: "Devices", hint: "Where you are signed in" },
] as const;

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="lg:w-56 lg:shrink-0">
      <ul
        className={cn(
          "flex gap-1 overflow-x-auto pb-1",
          "lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0",
        )}
      >
        {SECTIONS.map((section) => {
          const isCurrent =
            pathname === section.href ||
            (section.href === "/account" && pathname.startsWith("/account/edit"));

          return (
            <li key={section.href} className="shrink-0 lg:shrink">
              <Link
                href={section.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "block rounded-control px-3 py-2 text-sm",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  isCurrent
                    ? "bg-selected-surface font-semibold text-text"
                    : "font-medium text-text-secondary hover:bg-surface-hover hover:text-text",
                )}
              >
                {section.label}
                <span className="hidden text-xs font-normal text-text-muted lg:block">
                  {section.hint}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
