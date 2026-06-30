export const ACCOMMODATION_TYPES = [
  { slug: "rooms", label: "Rooms" },
  { slug: "pg", label: "PG" },
  { slug: "hostels", label: "Hostels" },
  { slug: "apartments", label: "Apartments" },
  { slug: "short-stay", label: "Short Stay" },
  { slug: "worker-accommodation", label: "Worker Accommodation" },
] as const;

export type AccommodationTypeSlug = (typeof ACCOMMODATION_TYPES)[number]["slug"];

/** Map catalog service slugs to accommodation property types */
export const SERVICE_SLUG_TO_PROPERTY_TYPE: Record<string, AccommodationTypeSlug> = {
  rooms: "rooms",
  "pg-accommodation": "pg",
  hostels: "hostels",
  apartments: "apartments",
  "rental-properties": "apartments",
  "short-stay": "short-stay",
  "student-accommodation": "hostels",
  "worker-accommodation": "worker-accommodation",
};

export const ACCOMMODATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "VISIT_SCHEDULED",
  "CHECKED_IN",
  "CANCELLED",
] as const;

export type AccommodationStatus = (typeof ACCOMMODATION_STATUSES)[number];

export const ACCOMMODATION_STATUS_LABELS: Record<AccommodationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  VISIT_SCHEDULED: "Visit scheduled",
  CHECKED_IN: "Checked in",
  CANCELLED: "Cancelled",
};

export const ACCOMMODATION_STATUS_MESSAGES: Record<AccommodationStatus, string> = {
  PENDING: "Your booking request is being reviewed by the owner.",
  CONFIRMED: "Your stay has been confirmed by the owner.",
  VISIT_SCHEDULED: "Your property visit has been scheduled.",
  CHECKED_IN: "You have checked in. Welcome!",
  CANCELLED: "This booking was cancelled.",
};

export const ACCOMMODATION_BOOKING_STEPS = [
  "type",
  "requirements",
  "payment",
] as const;

export type AccommodationBookingStep = (typeof ACCOMMODATION_BOOKING_STEPS)[number];

export const TOKEN_ADVANCE_PAISE = 500000;
export const BOOKING_FEE_PAISE = 9900;
