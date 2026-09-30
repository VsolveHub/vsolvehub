import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type StayProperty = Schemas["PartnerProperty"];
export type StayEnquiry = Schemas["StayEnquiry"];
export type PartnerCapability = Schemas["PartnerCapability"];
export type StayUnit = Schemas["Unit"];
export type CreateUnitRequest = Schemas["CreateUnitRequest"];
export type PatchedUpdateUnitRequest = Schemas["PatchedUpdateUnitRequest"];
export type PatchedUpdatePropertyRequest = Schemas["PatchedUpdatePropertyRequest"];

export type StayTaxonomyVariant = {
  id: string;
  name: string;
  code: string;
  property_schema: Record<string, unknown>;
};

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
  available_from?: string | null;
  available_until?: string | null;
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
    available_from: input.available_from ?? null,
    available_until: input.available_until ?? null,
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
    attributes?: Record<string, unknown>;
    is_active?: boolean;
  },
): Promise<StayUnit> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties/{property_id}/units", {
      params: { path: { property_id: propertyId } },
      body: {
        name: input.name,
        nightly_rate_paise: input.nightly_rate_paise,
        sharing_count: input.sharing_count ?? 1,
        attributes: input.attributes ?? {},
        is_active: input.is_active ?? true,
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

export async function submitPartnerStayProperty(propertyId: string): Promise<StayProperty> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties/{property_id}/{action}", {
      params: { path: { property_id: propertyId, action: "submit" } },
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

export async function partnerStayReservationAction(
  reservationId: string,
  action: "check_in" | "check_out",
): Promise<StayReservation> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/reservations/{reservation_id}/{action}", {
      params: { path: { reservation_id: reservationId, action } },
    }),
  );
  return data as StayReservation;
}

/** Where a property stands, in the words a host reads. */
export function stayListingStatus(property: Pick<StayProperty, "moderation_status">): {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
} {
  switch (property.moderation_status) {
    case "APPROVED":
      return { label: "Live", tone: "success" };
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
