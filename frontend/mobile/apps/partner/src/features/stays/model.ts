export interface StayTaxonomyVariant {
  id: string;
  slug?: string;
  name?: string;
  property_schema?: Record<string, unknown>;
  room_schema?: Record<string, unknown>;
  amenity_options?: Array<{ key: string; label: string }>;
  room_name_suggestions?: string[];
}

export interface StayTaxonomySubcategory {
  id: string;
  name: string;
  services: Array<{
    id: string;
    name: string;
    variants: StayTaxonomyVariant[];
  }>;
}

export type StayPropertyType = {
  variant: StayTaxonomyVariant;
  label: string;
  group: string;
};

export function stayPropertyTypes(taxonomy: readonly any[]): StayPropertyType[] {
  const types: StayPropertyType[] = [];
  for (const sub of taxonomy) {
    const services = sub.services ?? [];
    const variants = services.flatMap((service: any) =>
      (service.variants ?? []).map((variant: any) => ({ service, variant })),
    );
    for (const { service, variant } of variants) {
      types.push({
        variant,
        group: sub.name,
        label: variants.length === 1 ? sub.name : `${sub.name} – ${service.name}`,
      });
    }
  }
  return types;
}

export interface StayUnitMedia {
  id: string;
  url: string;
  display_order?: number;
  caption?: string;
}

export interface StayRoom {
  id: string;
  number: string;
  status?: "AVAILABLE" | "UNAVAILABLE" | "BOOKED" | string;
  available?: boolean;
  occupant_name?: string | null;
}

export interface StayUnit {
  id: string;
  name: string;
  nightly_rate_paise: number;
  sharing_count?: number;
  quantity?: number;
  available_count?: number;
  max_guests?: number;
  is_active?: boolean;
  image_urls?: string[];
  media?: StayUnitMedia[];
  room_numbers?: string[];
  rooms?: StayRoom[];
  attributes?: Record<string, any>;
}

export interface StayPropertyMedia {
  id: string;
  url: string;
  caption?: string;
  display_order?: number;
}

export interface VisitSlotRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export type VisitSlotInput = {
  weekday: number;
  start_time: string;
  end_time: string;
};

export interface StayProperty {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  location_text?: string;
  min_price_paise?: number;
  min_stay_nights?: number;
  price_period?: string;
  room_style?: string;
  tenant_preference?: string;
  listing_status?: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED" | string;
  moderation_status?: "APPROVED" | "PENDING" | "REJECTED" | "REMOVED" | string;
  moderation_reason?: string;
  image_urls?: string[];
  media?: StayPropertyMedia[];
  units?: StayUnit[];
  variant?: StayTaxonomyVariant;
  house_rules?: string;
  structured_fields?: Record<string, any>;
  visits_enabled?: boolean;
  visit_slots?: VisitSlotRow[];
  visit_blocked_dates?: string[];
  created_at?: string;
}

export interface HostStaySummary {
  total_properties: number;
  total_rooms: number;
  available_rooms: number;
  booked_rooms: number;
  review_count: number;
  average_rating?: number | null;
  new_enquiries: number;
  pending_visits: number;
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
  adult_count?: number;
  child_count?: number;
  message?: string;
  status: "SUBMITTED" | "RESPONDED" | "DECLINED" | "CANCELLED" | "CONFIRMED" | string;
  property?: StayProperty;
  property_title?: string;
  property_slug?: string;
  unit?: StayUnit;
  unit_name?: string;
  total_quote_paise?: number;
  user_name?: string;
  user_phone?: string;
  host_response?: string;
  responded_at?: string;
  created_at?: string;
}

export interface PartnerStayVisit {
  id: string;
  visit_date: string;
  status: "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | string;
  property?: StayProperty;
  property_title?: string;
  property_slug?: string;
  unit_name?: string;
  user_name?: string;
  user_phone?: string;
  message?: string;
  slot_label?: string;
  start_time?: string;
  end_time?: string;
  reason?: string;
  reason_text?: string;
  note?: string;
}

export interface StayReservation {
  id: string;
  property_title?: string;
  unit_name?: string;
  customer_name?: string;
  customer_phone?: string;
  status: string;
  check_in: string;
  check_out: string;
  total_paise?: number;
}

export type StayPropertyAction = "publish" | "pause" | "resume" | "archive" | "restore";

export function formatPaise(paise?: number | null): string {
  if (paise == null) return "₹0";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function stayLengthLabel(length: number, period: string = "MONTH"): string {
  const unit = period === "NIGHT" ? "night" : "month";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

export function ratePeriodSuffix(pricePeriod: string | undefined): string {
  return pricePeriod === "NIGHT" ? "/ night" : "/ month";
}

export function stayListingStatus(
  property: Pick<StayProperty, "moderation_status" | "listing_status">,
): {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
} {
  if (property.listing_status === "ARCHIVED") return { label: "Archived", tone: "neutral" };
  switch (property.moderation_status) {
    case "APPROVED":
      return property.listing_status === "PAUSED"
        ? { label: "Paused — hidden from guests", tone: "neutral" }
        : { label: "Live", tone: "success" };
    case "PENDING":
      return { label: "Under quick review", tone: "warning" };
    case "REJECTED":
      return { label: "Changes needed", tone: "danger" };
    case "REMOVED":
      return { label: "Removed by VSolve", tone: "danger" };
    default:
      return { label: "Draft", tone: "neutral" };
  }
}

export function getStayListingStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "LIVE":
    case "ACTIVE":
      return { label: "Live / Listed", tone: "success" };
    case "PAUSED":
      return { label: "Paused", tone: "warning" };
    case "ARCHIVED":
      return { label: "Archived", tone: "neutral" };
    default:
      return { label: status ?? "Draft", tone: "neutral" };
  }
}

export function getEnquiryStatusBadge(status?: string): {
  label: string;
  tone: "brand" | "success" | "danger" | "neutral";
} {
  switch ((status ?? "").toUpperCase()) {
    case "SUBMITTED":
    case "OPEN":
      return { label: "To call", tone: "brand" };
    case "RESPONDED":
      return { label: "Responded", tone: "success" };
    case "CONFIRMED":
      return { label: "Booked", tone: "success" };
    case "DECLINED":
    case "CLOSED":
      return { label: "Closed", tone: "neutral" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" };
    default:
      return { label: status ?? "Enquiry", tone: "neutral" };
  }
}

export function getVisitStatusBadge(status?: string): {
  label: string;
  tone: "brand" | "success" | "danger" | "neutral";
} {
  switch ((status ?? "").toUpperCase()) {
    case "REQUESTED":
      return { label: "To answer", tone: "brand" };
    case "ACCEPTED":
      return { label: "Accepted", tone: "success" };
    case "DECLINED":
      return { label: "Declined", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: status ?? "Visit", tone: "neutral" };
  }
}

export const VISIT_DECLINE_REASONS = [
  { value: "ROOM_UNAVAILABLE", label: "Room unavailable" },
  { value: "DATE_MISMATCH", label: "Date doesn't match" },
  { value: "ALREADY_OCCUPIED", label: "Already occupied" },
  { value: "OTHER", label: "Other" },
] as const;

export type VisitDeclineReason = (typeof VISIT_DECLINE_REASONS)[number]["value"];

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function formatClock(value?: string | null): string {
  if (!value) return "";
  const [h = "0", m = "0"] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  const display = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return minute ? `${display}:${String(minute).padStart(2, "0")} ${suffix}` : `${display} ${suffix}`;
}

export function clockText(value: string): string {
  if (!value) return "Set time";
  const [h = 10, m = 0] = value.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function clockWindow(start?: string | null, end?: string | null): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

export function dayLabel(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  return isoDate;
}

export function byRoomNumber(a: StayRoom, b: StayRoom): number {
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}
