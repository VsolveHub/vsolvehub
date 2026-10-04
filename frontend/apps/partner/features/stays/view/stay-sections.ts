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
 */
export const STAY_SECTIONS: readonly SectionNavItem[] = [
  { href: "/stays", label: "Properties" },
  // Stays are enquiry-only now; the old paid "Bookings" page is reachable by URL only.
  { href: "/stays/enquiries", label: "Enquiries" },
  { href: "/stays/visits", label: "Visits" },
];
