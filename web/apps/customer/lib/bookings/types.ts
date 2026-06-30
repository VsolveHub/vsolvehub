export type ScheduleType = "instant" | "scheduled";
export type PaymentMethodType = "upi" | "card" | "wallet" | "cod";
export type VendorAssignmentMode = "auto" | "manual";

export type BookingDraft = {
  serviceId: string;
  issueDescription: string;
  mediaUrls: string[];
  addressId: string | null;
  scheduleType: ScheduleType;
  slot: string;
  vendorId: string | null;
  vendorAssignmentMode: VendorAssignmentMode;
  paymentMethod: PaymentMethodType | null;
};

export type VendorOption = {
  id: string;
  name: string;
  phone: string;
  rating: number;
  distanceKm: number;
  isPrevious?: boolean;
};

export type BookingServiceInfo = {
  id: string;
  name: string;
  pricePaise: number;
  unit?: string;
  archetype?: string;
  category: { icon: string; slug: string };
};

export const BOOKING_STEPS = [
  "details",
  "address",
  "schedule",
  "vendor",
  "summary",
  "payment",
] as const;

export type BookingStep = (typeof BOOKING_STEPS)[number];

export const BOOKING_STEP_LABELS: Record<BookingStep, string> = {
  details: "Details",
  address: "Address",
  schedule: "Date & time",
  vendor: "Professional",
  summary: "Summary",
  payment: "Payment",
};
