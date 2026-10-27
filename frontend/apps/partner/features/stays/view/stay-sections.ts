import { useT } from "@vsolve/ui";
import { useMemo } from "react";

import type { SectionNavItem } from "@/features/workspace/view/section-nav";

/**
 * The three destinations a stay host moves between.
 *
 * Declared once and rendered by all three screens, so the phone sub-nav cannot
 * disagree with itself about which sections exist — the failure mode being a
 * partner on `/stays/bookings` seeing a control that offers only what the page
 * they are on remembered to list.
 *
 * `Properties` is `/stays` itself: the ads. `Enquiries` is a guest asking, which
 * has no money in it yet. `Bookings` is a guest who has paid. The three were one
 * page with two cards appended, and the order here matches the order a stay
 * actually moves through them.
 *
 * `labelKey` is a `stays.` catalogue key; `useStaySections` resolves it.
 */
export const STAY_SECTIONS: ReadonlyArray<{ href: string; labelKey: string }> = [
  { href: "/stays", labelKey: "stays.sections.properties" },
  // Stays are enquiry-only now; the old paid "Bookings" page is reachable by URL only.
  { href: "/stays/enquiries", labelKey: "stays.sections.enquiries" },
  { href: "/stays/visits", labelKey: "stays.sections.visits" },
];

/** `STAY_SECTIONS` in the reader's language, ready for `SectionNav`. */
export function useStaySections(): readonly SectionNavItem[] {
  const t = useT();
  return useMemo(
    () => STAY_SECTIONS.map(({ href, labelKey }) => ({ href, label: t(labelKey) })),
    [t],
  );
}
