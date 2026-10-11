"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The five dashboards behind one sidebar entry. */
export const DASHBOARD_TABS: { href: string; label: string }[] = [
  { href: "/operations/dashboards/overview", label: "Overview" },
  { href: "/operations/dashboards/categories", label: "Categories" },
  { href: "/operations/dashboards/customer", label: "Customers" },
  { href: "/operations/dashboards/vendor", label: "Partners" },
  { href: "/operations/dashboards/booking", label: "Bookings" },
];

export function DashboardTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboards" className="mx-auto mt-4 w-full max-w-6xl border-b border-line px-4">
      <ul className="-mb-px flex list-none flex-wrap gap-1 p-0">
        {DASHBOARD_TABS.map((tab) => {
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
