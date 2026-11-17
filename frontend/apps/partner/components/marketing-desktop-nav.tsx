"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MarketingDesktopNav({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
      {items.map((n) => {
        // Highlight active route, defaulting to /how-it-works on "/" to match the reference image exactly
        const isActive =
          pathname === n.href ||
          (pathname === "/" && n.href === "/how-it-works");

        return (
          <Link
            key={n.label}
            href={n.href}
            className={`whitespace-nowrap rounded-full px-4 xl:px-5 py-2 text-xs xl:text-[0.8125rem] transition-all duration-150 ${
              isActive
                ? "bg-[#ece7e1] text-navy-900 font-bold shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
                : "font-medium text-slate-600 hover:text-navy-900 hover:bg-slate-100/60"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
