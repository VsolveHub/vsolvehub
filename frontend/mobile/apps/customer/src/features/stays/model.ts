export interface StayUnit {
  id: string;
  name: string;
  nightly_rate_paise: number;
  sharing_count?: number;
  max_guests?: number;
  quantity_available?: number;
}

export interface StayTaxonomyService {
  id: string;
  name: string;
  slug?: string;
}

export interface StayTaxonomyCategory {
  id: string;
  name: string;
  slug?: string;
  services?: StayTaxonomyService[];
}

export interface StayPartner {
  id?: string;
  full_name?: string;
  company_name?: string;
  business_name?: string;
  phone_number?: string;
}

export interface StayPropertySummary {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  location_text?: string;
  price_period?: string;
  room_style?: string;
  min_price_paise?: number;
  min_stay_nights?: number;
  tenant_preference?: string;
  average_rating?: number;
  review_count?: number;
  total_units?: number;
  image_urls?: string[];
  host_name?: string;
  amenities?: { key: string; label: string }[];
  partner?: StayPartner;
  structured_fields?: Record<string, unknown>;
  units?: StayUnit[];
}

export interface StayReview {
  id?: string;
  rating?: number;
  comment?: string;
  customer_name?: string;
  image_urls?: string[];
  created_at?: string;
}

export interface StayProperty extends StayPropertySummary {
  description?: string;
  house_rules?: string;
  structured_fields?: Record<string, unknown>;
  highlights?: { label: string; value: string }[];
  can_review?: boolean;
  reviews?: StayReview[];
  units?: StayUnit[];
  visits_offered?: boolean;
}

export interface StayEnquiry {
  id: string;
  check_in: string;
  check_out?: string;
  length?: number;
  stay_length?: number;
  nights?: number;
  price_period?: string;
  guest_count?: number;
  message?: string;
  status: string;
  property?: StayProperty | string;
  property_title?: string;
  property_slug?: string;
  unit?: StayUnit;
  unit_name?: string;
  total_quote_paise?: number;
  created_at?: string;
  host_name?: string;
  host_phone?: string;
  host_response?: string;
  responded_at?: string;
}

export interface StayVisitSlot {
  id: string;
  start_time?: string;
  end_time?: string;
  label?: string;
}

export interface StayVisit {
  id: string;
  visit_date: string;
  status: string;
  property?: StayProperty;
  property_title?: string;
  property_slug?: string;
  unit_name?: string;
  slot?: StayVisitSlot;
  start_time?: string;
  end_time?: string;
  message?: string;
  host_name?: string;
  host_phone?: string;
  reason_text?: string;
}

export interface StayReservation {
  id: string;
  status: string;
  check_in: string;
  check_out?: string;
  nights?: number;
  total_paise?: number;
  guest_count?: number;
  property_title?: string;
  unit_name?: string;
  created_at?: string;
}

export interface StayQuote {
  property_id: string;
  unit_id?: string | null;
  unit_name?: string;
  check_out?: string;
  nights?: number;
  stay_length?: number;
  price_period?: string;
  nightly_rate_paise?: number;
  total_quote_paise?: number;
  booking_mode?: string;
  min_stay_nights?: number;
  max_guests?: number;
}

export interface StayFilterParams {
  q?: string;
  location?: string;
  sharing_count?: number;
  ac?: boolean;
  food?: boolean;
  min_price?: number;
  max_price?: number;
  tenant_preference?: string;
  service?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export function formatPaise(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export type PricePeriod = "NIGHT" | "MONTH";

export function pricePeriodOf(value: string | undefined | null): PricePeriod {
  return value === "NIGHT" ? "NIGHT" : "MONTH";
}

export function formatRate(paise: number, period: PricePeriod): string {
  return `${formatPaise(paise)} / ${period === "NIGHT" ? "night" : "month"}`;
}

export function roomOccupancyLabel(
  unit: { sharing_count?: number; max_guests?: number },
  roomStyle: string | undefined | null,
): string {
  if (roomStyle === "PRIVATE") {
    const guests = unit.max_guests ?? 1;
    return `Up to ${guests} guest${guests === 1 ? "" : "s"}`;
  }
  const sharing = unit.sharing_count ?? 1;
  return sharing === 1 ? "Private room" : `${sharing} sharing`;
}

export function stayLengthLabel(length: number, period: PricePeriod): string {
  const unit = period === "NIGHT" ? "night" : "month";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

export function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 1;
  const s = new Date(checkIn);
  const e = new Date(checkOut);
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, isNaN(diffDays) ? 1 : diffDays);
}

export function getEnquiryStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "brand" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "SUBMITTED":
      return { label: "Sent · Waiting for host", tone: "brand" };
    case "RESPONDED":
      return { label: "Host Responded", tone: "success" };
    case "DECLINED":
      return { label: "Not available", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    case "CONFIRMED":
      return { label: "Booked", tone: "success" };
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "neutral" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    default:
      return { label: status ?? "Submitted", tone: "neutral" };
  }
}

export function availabilityLabel(count: number | undefined, roomStyle?: string | null): string {
  const n = Math.max(count ?? 0, 0);
  const word = roomStyle === "SHARED" ? "bed" : "room";
  return `${n} ${word}${n === 1 ? "" : "s"} available`;
}

export function getVisitStatusBadge(status?: string): {
  label: string;
  tone: "success" | "neutral" | "brand" | "danger";
} {
  switch (status) {
    case "REQUESTED":
      return { label: "Waiting for Owner", tone: "brand" };
    case "ACCEPTED":
      return { label: "Visit Accepted", tone: "success" };
    case "DECLINED":
      return { label: "Declined", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    default:
      return { label: status ?? "Requested", tone: "neutral" };
  }
}

export const DIRECT_PAYMENT_NOTE =
  "Payment is made directly to the property owner. V Solve Hub does not collect room rent.";

export function formatPhone(value?: string | null): string {
  if (!value) return "";
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return value;
}

export const SLIDER_MIN_PAISE = 0;
export const SLIDER_MAX_PAISE = 2_000_000; // ₹20,000

export const TENANT_PREFERENCES = [
  { value: "", label: "Anyone" },
  { value: "BACHELOR_MALE", label: "Bachelor (M)" },
  { value: "BACHELOR_FEMALE", label: "Ladies" },
  { value: "FAMILY", label: "Family" },
  { value: "WORKING_PROFESSIONAL", label: "Professional" },
] as const;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating_desc", label: "Top Rated" },
] as const;

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "Each photo must be 10 MB or smaller.";
export const MAX_REVIEW_PHOTOS = 5;

export function reviewPhotoUrls(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === "string") : [];
}

export function formatVisitTime(value: string | undefined | null): string {
  if (!value) return "";
  const [h = "0", m = "0"] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 || 12;
  return minute ? `${display}:${String(minute).padStart(2, "0")} ${suffix}` : `${display} ${suffix}`;
}

export function visitWindowLabel(start?: string | null, end?: string | null): string {
  return `${formatVisitTime(start)} – ${formatVisitTime(end)}`;
}

export function visitDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!, 12);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
