export const PROVIDER_TYPES = [
  "CAPTAIN",
  "PROFESSIONAL",
  "RENTAL_VENDOR",
  "PROPERTY_HOST",
  "EVENT_VENDOR",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const OFFER_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_TTL_SECONDS = 30;

export const CAPTAIN_WORK_STATUSES = ["ASSIGNED", "ARRIVED", "STARTED", "COMPLETED"] as const;
export type CaptainWorkStatus = (typeof CAPTAIN_WORK_STATUSES)[number];

export const KYC_STATUSES = ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED"] as const;

export const PARTNER_NAV = [
  { href: "/partner/dashboard", label: "Dashboard", icon: "home" },
  { href: "/partner/leads", label: "Leads", icon: "comment-alt" },
  { href: "/partner/work", label: "Work", icon: "briefcase" },
  { href: "/partner/calendar", label: "Calendar", icon: "calendar" },
  { href: "/partner/earnings", label: "Earnings", icon: "wallet" },
  { href: "/partner/profile", label: "Profile", icon: "user" },
] as const;
