export interface PickupDay {
  weekday: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
}

export interface PickupHours {
  is_set: boolean;
  summary?: string;
  days: PickupDay[];
  closed_dates: string[];
}

export interface PickupDayInput {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

export type TransportTrip = "ONE_WAY" | "ROUND_TRIP";

export interface RentalTransport {
  status:
    | "REQUESTED"
    | "QUOTED"
    | "ACCEPTED"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "DECLINED"
    | "EXPIRED"
    | "CANCELLED"
    | string;
  trip?: TransportTrip;
  amount_paise?: number;
  max_quotes: number;
  quote_count: number;
  customer_note?: string;
  reject_note?: string;
  respond_by?: string;
}

export interface PartnerRentalAssetMedia {
  id: string;
  url: string;
  kind?: string;
}

export interface TaxonomyVariant {
  id: string;
  name: string;
  default_deposit_paise?: number;
  asset_schema?: Record<string, unknown>;
}

export interface TaxonomyService {
  id: string;
  name: string;
  slug?: string;
  variants?: TaxonomyVariant[];
}

export interface TaxonomySubcategory {
  id: string;
  name: string;
  slug: string;
  services?: TaxonomyService[];
}

export interface PartnerRentalAsset {
  id: string;
  title: string;
  slug?: string;
  daily_rate_paise: number;
  deposit_paise: number;
  quantity_available: number;
  total_quantity?: number;
  location_text?: string;
  description?: string;
  variant_id?: string;
  variant?: string;
  status: "DRAFT" | "SUBMITTED" | "ACTIVE" | "PAUSED" | "ARCHIVED" | string;
  moderation_status?: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "PAUSED" | "REJECTED" | string;
  public_state?: "PUBLISHED" | "UNLISTED" | "ARCHIVED" | string;
  media?: PartnerRentalAssetMedia[];
  image_urls?: string[];
  structured_fields?: Record<string, string | number | boolean>;
  delivery_available?: boolean;
  pickup_address?: {
    line_1?: string;
    area?: string;
    city?: string;
    pincode?: string;
  } | null;
  created_at?: string;
}

export interface PartnerRentalBooking {
  id: string;
  booking_code?: string;
  status:
    | "PENDING_PAYMENT"
    | "CONFIRMED"
    | "HANDOVER"
    | "HANDED_OVER"
    | "RETURNED"
    | "COMPLETED"
    | "CANCELLED"
    | "DISPUTED"
    | string;
  start_date: string;
  end_date: string;
  quantity?: number;
  price_paise?: number;
  total_rent_paise?: number;
  platform_fee_paise?: number;
  platform_fee_percent?: number;
  deposit_paise?: number;
  customer_name?: string;
  customer_phone?: string;
  handover_at?: string;
  return_at?: string;
  handover_pin?: string;
  asset?: PartnerRentalAsset;
  pickup_or_delivery_mode?: string;
  notes?: string;
  deposit?: {
    status?: string;
    amount_paise?: number;
    payment_attempt_id?: string;
  };
  transport?: RentalTransport | null;
  transport_paise?: number | null;
  transport_fee_percent?: number | null;
  delivery_address?: {
    line?: string;
    area?: string;
    city?: string;
    pincode?: string;
    contact_phone?: string;
  } | null;
  delivery_directions_url?: string | null;
  created_at?: string;
}

export function formatPaise(paise?: number | null): string {
  if (paise == null) return "₹0";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function getRentalStatusBadge(status?: string, moderation?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger" | "brand";
} {
  const mod = (moderation ?? "").toUpperCase();
  if (mod === "REJECTED") return { label: "Rejected", tone: "danger" };
  if (mod === "PENDING_REVIEW") return { label: "In Review", tone: "warning" };
  if (mod === "DRAFT") return { label: "Draft", tone: "neutral" };

  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
    case "PUBLISHED":
      return { label: "Live / Available", tone: "success" };
    case "PAUSED":
      return { label: "Paused", tone: "warning" };
    case "SUBMITTED":
      return { label: "Under Review", tone: "warning" };
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    default:
      return { label: status ?? "Draft", tone: "neutral" };
  }
}

export function getRentalBookingStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger" | "brand";
} {
  switch ((status ?? "").toUpperCase()) {
    case "CONFIRMED":
      return { label: "Confirmed", tone: "brand" };
    case "HANDOVER":
    case "HANDED_OVER":
      return { label: "Active Rental", tone: "success" };
    case "RETURNED":
      return { label: "Returned", tone: "neutral" };
    case "COMPLETED":
      return { label: "Completed", tone: "neutral" };
    case "DISPUTED":
      return { label: "Disputed", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    case "PENDING_PAYMENT":
      return { label: "Pending Payment", tone: "warning" };
    default:
      return { label: status ?? "Pending", tone: "neutral" };
  }
}

/** Pre-handover cancel allowed only for PENDING_PAYMENT or CONFIRMED. */
export function canCancelBooking(status: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "PENDING_PAYMENT" || s === "CONFIRMED";
}

/** Submit for moderation when draft or rejected. */
export function canSubmitAsset(moderationStatus?: string, status?: string): boolean {
  const m = (moderationStatus ?? "").toUpperCase();
  const s = (status ?? "").toUpperCase();
  return m === "DRAFT" || m === "REJECTED" || s === "DRAFT";
}

export interface CreateAssetRequest {
  variant_id?: string;
  title: string;
  description?: string;
  location_text?: string;
  daily_rate_paise: number;
  deposit_paise: number;
  quantity_available?: number;
  asset_identifier?: string;
  structured_fields?: Record<string, string | number | boolean>;
  image_urls: string[];
}

export interface UpdateAssetRequest {
  title?: string;
  description?: string;
  daily_rate_paise?: number;
  deposit_paise?: number;
  location_text?: string;
  quantity_available?: number;
  structured_fields?: Record<string, string | number | boolean>;
}

export interface PartnerBookingActionRequest {
  pin?: string;
  reason?: string;
  consume_paise?: number;
  photo_ids?: string[];
}

export interface AssetSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: (string | number | boolean)[];
  examples?: (string | number | boolean)[];
}

export interface AssetSchema {
  properties?: Record<string, AssetSchemaProperty>;
  required?: string[];
}
