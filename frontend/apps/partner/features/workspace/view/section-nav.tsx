"use client";

import { SegmentedTrack, segmentStyles } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The phone's way into a workspace's separate destinations.
 *
 * Stays has three (properties, guest enquiries, paid reservations) and Rentals
 * two (ads, bookings) — more than the dock has slots for. On a wide screen they
 * are ordinary items in `DesktopPrimaryNav`; here they are segments, which is
 * the same control the Customer app uses when one screen has to hold several
 * record sets.
 *
 * ## Why this is links and not buttons
 *
 * A segment that changed what this screen *shows* would be a button. These
 * change where the partner *is* — a different record set, a different query,
 * a different empty state. So each one is a `<Link>`: the back button works, a
 * segment is shareable, and a reload lands where the reader was. `segmentStyles`
 * exists in `@vsolve/ui` precisely so the app supplies the router.
 *
 * ## Why it is hidden from `lg:`
 *
 * The wide header already lists every destination inline. Drawing the same
 * three here would be the same information twice on one screen, and the second
 * copy would be the one a reader noticed least.
 *
 * ## Exact match, deliberately
 *
 * `/stays` must not stay lit on `/stays/bookings`. These are siblings, not a
 * tree, so equality is the correct test — a prefix match would light two
 * segments at once the moment one of them grew a detail route.
 */
export interface SectionNavItem {
  href: string;
  label: string;
}

export function SectionNav({
  label,
  items,
}: {
  /** Accessible name for the group. Not rendered — the page has its own heading. */
  label: string;
  items: readonly SectionNavItem[];
}) {
  const pathname = usePathname();

  return (
    <SegmentedTrack label={label} className="lg:hidden">
      {items.map((item) => {
        const selected = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={segmentStyles({ selected })}
          >
            {item.label}
          </Link>
        );
      })}
    </SegmentedTrack>
  );
}
