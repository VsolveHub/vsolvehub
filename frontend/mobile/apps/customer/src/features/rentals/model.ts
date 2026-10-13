export interface RentalAssetMedia {
  id: string;
  url: string;
}

export interface RentalPartner {
  id?: string;
  full_name?: string;
  company_name?: string;
  phone_number?: string;
}

export interface RentalAsset {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  location_text?: string;
  daily_rate_paise: number;
  deposit_paise: number;
  quantity_available?: number;
  thumbnail_url?: string;
  partner_name?: string;
  media?: RentalAssetMedia[];
  structured_fields?: Record<string, string | number | boolean>;
  partner?: RentalPartner;
  reserved_ranges?: Array<{ start_date: string; end_date: string }>;
}

export interface RentalDeposit {
  id?: string;
  amount_paise: number;
  status: string;
  consumed_paise?: number;
  requested_consume_paise?: number;
  provider_note?: string;
  payment_attempt_id?: string | null;
  simulated_capture_available?: boolean;
}

export interface RentalBooking {
  id: string;
  asset_id: string;
  start_date: string;
  end_date: string;
  quantity?: number;
  pickup_or_delivery_mode?: string;
  status: string;
  price_paise?: number;
  platform_fee_paise?: number;
  platform_fee_percent?: number;
  total_charge_paise?: number;
  deposit_paise?: number;
  handover_pin?: string;
  asset?: RentalAsset;
  deposit?: RentalDeposit;
}

export function canCancelRentalBooking(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "PENDING_PAYMENT" || value === "CONFIRMED";
}

export interface RentalFilterParams {
  q?: string;
  location?: string;
  service?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  max_deposit?: number;
  start_date?: string;
  end_date?: string;
}

export type RentalMineTab = "ALL" | "UPCOMING" | "ONGOING" | "RETURNED" | "INACTIVE";

export function rentalMineBucket(status?: string): Exclude<RentalMineTab, "ALL"> {
  const value = (status ?? "").toUpperCase();
  if (["CANCELLED", "DISPUTED"].includes(value)) return "INACTIVE";
  if (["RETURNED", "CLOSED"].includes(value)) return "RETURNED";
  if (["HANDOVER", "HANDED_OVER"].includes(value)) return "ONGOING";
  return "UPCOMING";
}

export function formatPaise(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function calculateRentalDays(start: string, end: string): number {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, isNaN(diffDays) ? 1 : diffDays);
}

export function getRentalStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "brand" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "PENDING_PAYMENT":
    case "REQUESTED":
      return { label: "Requested / Pending", tone: "warning" };
    case "CONFIRMED":
      return { label: "Booking Confirmed", tone: "brand" };
    case "HANDOVER":
    case "HANDED_OVER":
      return { label: "In Your Possession", tone: "success" };
    case "RETURNED":
      return { label: "Returned & Inspected", tone: "neutral" };
    case "CLOSED":
      return { label: "Completed", tone: "neutral" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    case "DISPUTED":
      return { label: "Disputed", tone: "danger" };
    default:
      return { label: status ?? "Pending", tone: "neutral" };
  }
}

export function getDepositStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "HELD":
      return { label: "Deposit Held (Protected)", tone: "warning" };
    case "RELEASED":
      return { label: "Deposit Refunded", tone: "success" };
    case "DEDUCTED":
    case "FORFEITED":
      return { label: "Deposit Deducted", tone: "danger" };
    default:
      return { label: status ? `Deposit ${status}` : "Deposit Pending", tone: "neutral" };
  }
}

export interface CreateBookingRequest {
  asset_id: string;
  start_date: string;
  end_date: string;
  quantity?: number;
  pickup_or_delivery_mode?: string;
  notes?: string;
}

export interface RentalTaxonomyVariant {
  id: string;
  name: string;
  code: string;
  asset_schema: Record<string, unknown>;
  default_deposit_paise: number;
}

export interface RentalTaxonomyService {
  id: string;
  name: string;
  slug: string;
  variants: RentalTaxonomyVariant[];
}

export interface RentalTaxonomySubcategory {
  id: string;
  name: string;
  slug: string;
  services: RentalTaxonomyService[];
}
