import Link from "next/link";

import { NAV_GROUPS } from "@/features/session/nav-groups";

/** One sentence per area: what you come here to do. Keyed by the sidebar group label. */
const PURPOSE: Record<string, string> = {
  "Home services": "Fixed-price visits: find a booking, fix dispatch, book on a customer's behalf.",
  "Workforce & projects": "Crew hire and custom projects: stuck requests, quotes, project recovery, crew rates.",
  Marketplace: "Rentals, stays and jobs: review listings, see bookings and deliveries, cancel and refund.",
  Partners: "Approve applications, check documents and GST, see availability and plans.",
  Customers: "Look up a customer's wallet and rewards, credit or debit it, read service feedback.",
  Money: "Refunds, partner payouts and balance corrections, commission and tax, reports.",
  Insights: "Trends across categories, customers, partners and bookings.",
  System: "Emergency switches and your own account.",
};

/**
 * "Where do I go for…": every area of the console on one screen, in the sidebar's order and
 * words, so the Home page teaches the sidebar instead of competing with it.
 */
export function ConsoleDirectory() {
  const areas = NAV_GROUPS.filter((group) => PURPOSE[group.label]);
  return (
    <section aria-labelledby="directory-heading" className="mx-auto w-full max-w-6xl px-4 py-8">
      <h2 id="directory-heading" className="text-base font-bold text-text">
        Where to find things
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {areas.map((group) => (
          <div key={group.label} className="rounded-card border border-line bg-surface p-4">
            <h3 className="text-sm font-bold text-navy-900">{group.label}</h3>
            <p className="mt-1 text-xs text-text-secondary">{PURPOSE[group.label]}</p>
            <ul className="mt-3 flex flex-col gap-1">
              {group.links.map((entry) => (
                <li key={entry.href}>
                  <Link href={entry.href} className="inline-flex items-center gap-2 text-sm text-text-link hover:underline">
                    <entry.icon className="size-3.5" />
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
