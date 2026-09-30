import type { SectionNavItem } from "@/features/workspace/view/section-nav";

/**
 * The two destinations a rental host moves between.
 *
 * Two, not three: an A7 rental has no enquiry stage. A customer reserves an
 * asset and it arrives as a booking, so there is no "guest asking" record to
 * give its own section — only the ad side and the demand side.
 *
 * Declared once and rendered by both screens, so the phone sub-nav cannot
 * disagree with itself about which sections exist.
 */
export const RENTAL_SECTIONS: readonly SectionNavItem[] = [
  { href: "/rentals", label: "Ads" },
  { href: "/rentals/bookings", label: "Bookings" },
];
