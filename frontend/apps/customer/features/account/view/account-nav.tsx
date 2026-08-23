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
          "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
                  "block whitespace-nowrap px-4 py-2.5 transition-all duration-fast",
                  "rounded-full border lg:rounded-none lg:border-0 lg:px-4 lg:py-3",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  isCurrent
                    ? "border-action bg-action text-white shadow-xs lg:border-l-[3px] lg:border-action lg:bg-[#F6F4F0] lg:text-[#D85C3A] lg:shadow-none"
                    : "border-[#e7e2da]/70 bg-white text-navy-900 lg:border-l-[3px] lg:border-transparent lg:bg-transparent lg:hover:bg-[#F6F4F0]",
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-bold lg:text-[0.95rem]",
                    isCurrent ? "lg:font-medium lg:text-[#D85C3A]" : "lg:font-medium lg:text-navy-900",
                  )}
                >
                  {section.label}
                </span>
                <span className="hidden text-[0.75rem] text-text-secondary lg:block mt-0.5">
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
