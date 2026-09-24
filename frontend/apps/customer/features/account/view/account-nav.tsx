"use client";

import { cn } from "@vsolve/ui";
import {
  Coins,
  Gift,
  MapPin,
  MessageCircle,
  Shield,
  Smartphone,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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

const SECTIONS: readonly {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  { href: "/account", label: "Profile", hint: "Your personal details", icon: User },
  { href: "/account/wallet", label: "Wallet", hint: "Prepaid balance & top-ups", icon: Wallet },
  { href: "/account/coins", label: "V Coins", hint: "Earned, locked & expiring", icon: Coins },
  { href: "/account/referrals", label: "Refer & Earn", hint: "Invite friends for rewards", icon: Gift },
  { href: "/account/addresses", label: "Addresses", hint: "Where we send someone", icon: MapPin },
  { href: "/account/messages", label: "Messages", hint: "What we send you", icon: MessageCircle },
  { href: "/account/privacy", label: "Privacy", hint: "Your data and consents", icon: Shield },
  { href: "/account/sessions", label: "Devices", hint: "Where you are signed in", icon: Smartphone },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="min-w-0 lg:w-56 lg:shrink-0">
      <ul
        className={cn(
          "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0",
        )}
      >
        {SECTIONS.map((section) => {
          const isCurrent =
            pathname === section.href ||
            (section.href === "/account" && pathname.startsWith("/account/edit"));
          const Icon = section.icon;

          return (
            <li key={section.href} className="shrink-0 lg:shrink">
              <Link
                href={section.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm transition-all duration-fast",
                  "lg:flex lg:min-h-0 lg:flex-col lg:items-start lg:gap-0 lg:rounded-none lg:border-0 lg:px-4 lg:py-3",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  isCurrent
                    ? "border-[#EA580C] bg-[#EA580C] font-bold text-white shadow-xs lg:border-l-[3px] lg:border-action lg:bg-[#F6F4F0] lg:font-medium lg:text-[#D85C3A] lg:shadow-none"
                    : "border-[#e7e2da] bg-white font-semibold text-navy-900 lg:border-l-[3px] lg:border-transparent lg:bg-transparent lg:font-medium lg:hover:bg-[#F6F4F0]",
                )}
              >
                <Icon
                  aria-hidden
                  className="size-4 shrink-0 lg:hidden"
                  strokeWidth={2.1}
                />
                <span className={cn("block lg:text-[0.95rem]", isCurrent ? "lg:text-[#D85C3A]" : "lg:text-navy-900")}>
                  {section.label}
                </span>
                <span className="hidden text-[0.75rem] text-text-secondary lg:mt-0.5 lg:block">
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
