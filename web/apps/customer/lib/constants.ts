export const MOCK_OTP = "1234";
export const SESSION_COOKIE = "vsh_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Legacy vendor-pick flow statuses */
export const BOOKING_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "ON_THE_WAY",
  "STARTED",
  "COMPLETED",
  "CANCELLED",
] as const;

/** Live marketplace dispatch statuses */
export const MARKETPLACE_STATUSES = [
  "PENDING",
  "SEARCHING_PROVIDER",
  "ASSIGNED",
  "PROVIDER_ARRIVING",
  "STARTED",
  "COMPLETED",
  "CANCELLED",
  "NO_WORKER_FOUND",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type MarketplaceStatus = (typeof MARKETPLACE_STATUSES)[number];
export type AnyBookingStatus = BookingStatus | MarketplaceStatus;

/** Map legacy DB statuses from older bookings */
export const LEGACY_STATUS_MAP: Record<string, AnyBookingStatus> = {
  SEARCHING: "REQUESTED",
  ASSIGNED: "ASSIGNED",
  ARRIVED: "PROVIDER_ARRIVING",
  IN_PROGRESS: "STARTED",
};

export function isMarketplaceStatus(status: string): boolean {
  return (MARKETPLACE_STATUSES as readonly string[]).includes(status);
}

export function normalizeBookingStatus(status: string): AnyBookingStatus {
  if ((BOOKING_STATUSES as readonly string[]).includes(status)) {
    return status as BookingStatus;
  }
  if ((MARKETPLACE_STATUSES as readonly string[]).includes(status)) {
    return status as MarketplaceStatus;
  }
  return LEGACY_STATUS_MAP[status] ?? "REQUESTED";
}

export const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  ON_THE_WAY: "On the way",
  STARTED: "Started",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  SEARCHING_PROVIDER: "Finding provider",
  ASSIGNED: "Assigned",
  PROVIDER_ARRIVING: "Provider arriving",
  NO_WORKER_FOUND: "No provider found",
};

export const STATUS_MESSAGES: Record<string, string> = {
  REQUESTED: "Your booking request has been sent.",
  ACCEPTED: "A professional has accepted your booking.",
  ON_THE_WAY: "Your professional is on the way.",
  STARTED: "Service has started at your location.",
  COMPLETED: "Your service has been completed.",
  CANCELLED: "This booking was cancelled.",
  PENDING: "Your booking is being processed.",
  SEARCHING_PROVIDER: "Searching for an available provider near you.",
  ASSIGNED: "A provider has accepted your booking.",
  PROVIDER_ARRIVING: "Your provider is on the way to your location.",
  NO_WORKER_FOUND: "No provider is available right now. You can retry or schedule later.",
};

export const MARKETPLACE_TIMELINE = [
  "PENDING",
  "SEARCHING_PROVIDER",
  "ASSIGNED",
  "PROVIDER_ARRIVING",
  "STARTED",
  "COMPLETED",
] as const;

export const RECENTLY_VIEWED_COOKIE = "vsh_recent";
export const RECENTLY_VIEWED_MAX = 6;
