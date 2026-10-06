import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type StayProperty = Schemas["PartnerProperty"];
export type StayEnquiry = Schemas["PartnerStayEnquiry"];
export type PartnerCapability = Schemas["PartnerCapability"];
export type StayUnit = Schemas["PartnerUnit"];
export type CreateUnitRequest = Schemas["CreateUnitRequest"];
export type PatchedUpdateUnitRequest = Schemas["PatchedUpdateUnitRequest"];
export type PatchedUpdatePropertyRequest = Schemas["PatchedUpdatePropertyRequest"];
export type StayRoom = Schemas["Room"];
export type HostStaySummary = Schemas["HostStaySummary"];
export type PartnerStayVisit = Schemas["PartnerStayVisit"];
export type StayVisitSlot = Schemas["StayVisitSlot"];

export type StayTaxonomyVariant = {
  id: string;
  name: string;
  code: string;
  /** Questions asked once per property. */
  property_schema: Record<string, unknown>;
  /** Questions asked per room, such as AC or bathroom. */
  room_schema: Record<string, unknown>;
  /** Room names this category suggests; the host may type any name. */
  room_name_suggestions: string[];
  booking_mode: string;
  /** "NIGHT" or "MONTH": what room rates for this type are quoted per. */
  price_period: string;
  /** Amenity checkboxes for this type; the category's own questions are left out. */
  amenity_options?: { key: string; label: string }[];
};

/** One choice per property type: the taxonomy flattened, since each type has one variant. */
export type StayPropertyType = {
  variant: StayTaxonomyVariant;
  label: string;
  group: string;
};

export function stayPropertyTypes(taxonomy: readonly StayTaxonomySubcategory[]): StayPropertyType[] {
  const types: StayPropertyType[] = [];
  for (const sub of taxonomy) {
    const variants = sub.services.flatMap((service) =>
      service.variants.map((variant) => ({ service, variant })),
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

export type StayTaxonomyService = {
  id: string;
  name: string;
  slug: string;
  variants: StayTaxonomyVariant[];
};

export type StayTaxonomySubcategory = {
  id: string;
  name: string;
  slug: string;
  services: StayTaxonomyService[];
};

export type StayPhotoUpload = {
  upload_id: string;
  url: string;
  original_name: string;
};

export type StayReservation = {
  id: string;
  property_title?: string;
  unit_name?: string;
  customer_name?: string;
  customer_phone?: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_count?: number;
  nights?: number;
  total_paise?: number;
};

export async function fetchPartnerDefaultLocation(): Promise<string> {
  try {
    const data = await request(() => getApiClient().GET("/api/v1/partner/me/"));
    return (data.default_location_text ?? "").trim();
  } catch {
    return "";
  }
}

export async function fetchStayTaxonomy(): Promise<StayTaxonomySubcategory[]> {
  const data = await request(() => getApiClient().GET("/api/v1/stays/taxonomy"));
  return Array.isArray(data) ? (data as StayTaxonomySubcategory[]) : [];
}

export async function fetchPartnerStayProperties(): Promise<StayProperty[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/stays/properties"));
  return Array.isArray(data) ? data : [];
}

export async function fetchPartnerStayEnquiries(): Promise<StayEnquiry[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/stays/enquiries"));
  return Array.isArray(data) ? data : [];
}

export async function uploadPartnerStayPhoto(file: File): Promise<StayPhotoUpload> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/photos", {
      body: { file },
      bodySerializer(body) {
        const form = new FormData();
        const blob = body && typeof body === "object" && "file" in body ? (body as { file?: Blob }).file : undefined;
        if (blob) form.append("file", blob, file.name);
        return form;
      },
    }),
  );
  return data as StayPhotoUpload;
}

export async function createPartnerStayProperty(input: {
  variant_id: string;
  title: string;
  description: string;
  location_text: string;
  nightly_rate_paise?: number;
  unit_name?: string;
  sharing_count?: number;
  min_stay_nights?: number;
  structured_fields?: Record<string, unknown>;
  cancellation_policy_text?: string;
  house_rules?: string;
  image_urls: string[];
}): Promise<StayProperty> {
  const body: Schemas["CreatePropertyRequest"] = {
    variant_id: input.variant_id,
    title: input.title,
    description: input.description,
    location_text: input.location_text,
    unit_name: "",
    sharing_count: 1,
    structured_fields: input.structured_fields ?? {},
    cancellation_policy_text: input.cancellation_policy_text ?? "",
    house_rules: input.house_rules ?? "",
    image_urls: input.image_urls,
    min_stay_nights: input.min_stay_nights ?? 1,
  };
  // Property-first: only attach a unit when an explicit rate is provided.
  if (input.nightly_rate_paise != null) {
    body.nightly_rate_paise = input.nightly_rate_paise;
    body.sharing_count = input.sharing_count ?? 1;
    body.unit_name = input.unit_name ?? "Standard room";
  }
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties", { body }),
  );
  return data as StayProperty;
}

export async function updatePartnerStayProperty(
  propertyId: string,
  input: PatchedUpdatePropertyRequest,
): Promise<StayProperty> {
  const data = await request(() =>
    getApiClient().PATCH("/api/v1/partner/stays/properties/{property_id}", {
      params: { path: { property_id: propertyId } },
      body: input,
    }),
  );
  return data as StayProperty;
}

export async function listPartnerStayUnits(propertyId: string): Promise<StayUnit[]> {
  const data = await request(() =>
    getApiClient().GET("/api/v1/partner/stays/properties/{property_id}/units", {
      params: { path: { property_id: propertyId } },
    }),
  );
  return Array.isArray(data) ? data : [];
}

export async function createPartnerStayUnit(
  propertyId: string,
  input: {
    name: string;
    nightly_rate_paise: number;
    sharing_count?: number;
    quantity?: number;
    max_guests?: number;
    attributes?: Record<string, unknown>;
    is_active?: boolean;
    /** "101", "102" — one per room. When given, the count is their number. */
    room_numbers?: string[];
    /** Photos of this room type, already uploaded with `uploadPartnerStayPhoto`. */
    image_urls?: string[];
  },
): Promise<StayUnit> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties/{property_id}/units", {
      params: { path: { property_id: propertyId } },
      body: {
        name: input.name,
        nightly_rate_paise: input.nightly_rate_paise,
        sharing_count: input.sharing_count ?? 1,
        quantity: input.quantity ?? 1,
        max_guests: input.max_guests,
        attributes: input.attributes ?? {},
        is_active: input.is_active ?? true,
        room_numbers: input.room_numbers ?? [],
        image_urls: input.image_urls ?? [],
      },
    }),
  );
  return data as StayUnit;
}

export async function updatePartnerStayUnit(
  unitId: string,
  input: PatchedUpdateUnitRequest,
): Promise<StayUnit> {
  const data = await request(() =>
    getApiClient().PATCH("/api/v1/partner/stays/units/{unit_id}", {
      params: { path: { unit_id: unitId } },
      body: input,
    }),
  );
  return data as StayUnit;
}

export type StayPropertyAction = "publish" | "pause" | "resume" | "archive" | "restore";

export async function partnerStayPropertyAction(
  propertyId: string,
  action: StayPropertyAction,
): Promise<StayProperty> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties/{property_id}/{action}", {
      params: { path: { property_id: propertyId, action } },
    }),
  );
  return data as StayProperty;
}

export async function respondPartnerStayEnquiry(
  enquiryId: string,
  response: string,
  decline = false,
): Promise<StayEnquiry> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/enquiries/{enquiry_id}/respond", {
      params: { path: { enquiry_id: enquiryId } },
      body: { response, decline },
    }),
  );
  return data as StayEnquiry;
}

/** The host spoke to the guest and the stay is agreed; `roomId` is the room they take. */
export async function confirmPartnerStayEnquiry(
  enquiryId: string,
  roomId?: string | null,
): Promise<StayEnquiry> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/enquiries/{enquiry_id}/confirm", {
      params: { path: { enquiry_id: enquiryId } },
      body: { room_id: roomId ?? null },
    }),
  );
  return data as StayEnquiry;
}

/** "3 months", "1 night" — how long the guest asked to stay. */
export function stayLengthLabel(length: number, period: string | undefined | null): string {
  const unit = period === "NIGHT" ? "night" : "month";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

/** "₹9,000 / month". */
export function ratePeriodSuffix(period: string | undefined | null): string {
  return period === "NIGHT" ? "/ night" : "/ month";
}

export async function cancelPartnerStayEnquiry(enquiryId: string): Promise<StayEnquiry> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/enquiries/{enquiry_id}/cancel", {
      params: { path: { enquiry_id: enquiryId } },
    }),
  );
  return data as StayEnquiry;
}

export async function fetchPartnerStayReservations(): Promise<StayReservation[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/stays/reservations"));
  return Array.isArray(data) ? (data as StayReservation[]) : [];
}

export type StayReservationAction = "check_in" | "check_out" | "no_show" | "cancel";

export async function partnerStayReservationAction(
  reservationId: string,
  action: StayReservationAction,
  reason = "",
): Promise<StayReservation> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/reservations/{reservation_id}/{action}", {
      params: { path: { reservation_id: reservationId, action } },
      body: { reason },
    }),
  );
  return data as StayReservation;
}

/** Where a property stands, in the words a host reads. */
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

export function stayVariantChoices(
  capabilities: readonly PartnerCapability[] | undefined,
): Array<{ id: string; name: string }> {
  if (!capabilities) return [];
  return capabilities
    .filter((cap) => cap.workspace_key === "A9_STAY" && cap.status === "APPROVED")
    .map((cap) => ({ id: cap.variant_id, name: cap.variant_name }));
}

export async function addPartnerStayPropertyMedia(
  propertyId: string,
  payload: { url: string; caption?: string; display_order?: number },
) {
  return request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties/{property_id}/media", {
      params: { path: { property_id: propertyId } },
      body: {
        url: payload.url,
        caption: payload.caption ?? "",
        display_order: payload.display_order ?? 0,
      },
    }),
  );
}

export async function deletePartnerStayPropertyMedia(
  propertyId: string,
  mediaId: string,
) {
  return request(() =>
    getApiClient().DELETE(
      "/api/v1/partner/stays/properties/{property_id}/media/{media_id}",
      {
        params: { path: { property_id: propertyId, media_id: mediaId } },
      },
    ),
  );
}


// --- dashboard summary ----------------------------------------------------------------------

export async function fetchPartnerStaySummary(): Promise<HostStaySummary> {
  return request(() => getApiClient().GET("/api/v1/partner/stays/summary"));
}

// --- numbered rooms -------------------------------------------------------------------------

export async function addPartnerStayRoom(
  unitId: string,
  input: { number: string; available?: boolean },
): Promise<StayRoom> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/stays/units/{unit_id}/rooms", {
      params: { path: { unit_id: unitId } },
      body: { number: input.number, available: input.available ?? true },
    }),
  );
}

export async function updatePartnerStayRoom(
  roomId: string,
  input: { number?: string; available?: boolean },
): Promise<StayRoom> {
  return request(() =>
    getApiClient().PATCH("/api/v1/partner/stays/rooms/{room_id}", {
      params: { path: { room_id: roomId } },
      body: input,
    }),
  );
}

export async function deletePartnerStayRoom(roomId: string): Promise<void> {
  await request(() =>
    getApiClient().DELETE("/api/v1/partner/stays/rooms/{room_id}", {
      params: { path: { room_id: roomId } },
    }),
  );
}

/** `book` marks the room Booked; `release` makes a booked room available again. */
export async function partnerStayRoomAction(
  roomId: string,
  action: "book" | "release",
  input: { occupant_name?: string; visit_id?: string | null } = {},
): Promise<StayRoom> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/stays/rooms/{room_id}/{action}", {
      params: { path: { room_id: roomId, action } },
      body: { occupant_name: input.occupant_name ?? "", visit_id: input.visit_id ?? null },
    }),
  );
}

// --- visiting hours and visits ----------------------------------------------------------------

export type VisitSlotInput = { weekday: number; start_time: string; end_time: string };

export async function setPartnerVisitingHours(
  propertyId: string,
  input: { visits_enabled: boolean; slots: VisitSlotInput[]; blocked_dates: string[] },
): Promise<StayProperty> {
  return request(() =>
    getApiClient().PUT("/api/v1/partner/stays/properties/{property_id}/visiting-hours", {
      params: { path: { property_id: propertyId } },
      body: input,
    }),
  );
}

export async function fetchPartnerStayVisits(): Promise<PartnerStayVisit[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/stays/visits"));
  return Array.isArray(data) ? data : [];
}

export type VisitDeclineReason = "ROOM_UNAVAILABLE" | "DATE_MISMATCH" | "ALREADY_OCCUPIED" | "OTHER";

export const VISIT_DECLINE_REASONS: ReadonlyArray<{ value: VisitDeclineReason; label: string }> = [
  { value: "ROOM_UNAVAILABLE", label: "Room unavailable" },
  { value: "DATE_MISMATCH", label: "Date doesn't match" },
  { value: "ALREADY_OCCUPIED", label: "Already occupied" },
  { value: "OTHER", label: "Other" },
];

export async function partnerStayVisitAction(
  visitId: string,
  action: "accept" | "decline",
  input: { reason?: VisitDeclineReason | ""; note?: string } = {},
): Promise<PartnerStayVisit> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/stays/visits/{visit_id}/{action}", {
      params: { path: { visit_id: visitId, action } },
      body: { reason: input.reason ?? "", note: input.note ?? "" },
    }),
  );
}

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "17:00:00" or "17:00" → "5 PM". */
export function formatClock(value: string | undefined | null): string {
  if (!value) return "";
  const [h = "0", m = "0"] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  const display = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return minute ? `${display}:${String(minute).padStart(2, "0")} ${suffix}` : `${display} ${suffix}`;
}

export function clockWindow(start?: string | null, end?: string | null): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

/** "2026-10-12" → "Sat, 12 Oct", read as a local calendar day. */
export function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Numbers sort as people read them: Room 2 before Room 10. */
export function byRoomNumber(a: { number: string }, b: { number: string }): number {
  return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: "base" });
}

// --- room type photos -------------------------------------------------------------------------

export type StayUnitMedia = Schemas["UnitMedia"];

/** Most photos one room type can carry; the server enforces the same. */
export const MAX_ROOM_PHOTOS = 8;

export async function addPartnerStayUnitMedia(unitId: string, url: string): Promise<StayUnitMedia> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/units/{unit_id}/media", {
      params: { path: { unit_id: unitId } },
      body: { url },
    }),
  );
  return data as StayUnitMedia;
}

export async function deletePartnerStayUnitMedia(unitId: string, mediaId: string): Promise<void> {
  await request(() =>
    getApiClient().DELETE("/api/v1/partner/stays/units/{unit_id}/media/{media_id}", {
      params: { path: { unit_id: unitId, media_id: mediaId } },
    }),
  );
}
