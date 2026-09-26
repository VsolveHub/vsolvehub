import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type StayProperty = Schemas["Property"];
export type StayEnquiry = Schemas["StayEnquiry"];
export type PartnerCapability = Schemas["PartnerCapability"];

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

export async function fetchStayTaxonomy(): Promise<StayTaxonomySubcategory[]> {
  const client = getApiClient();
  const { data, error } = await client.GET("/api/v1/stays/taxonomy" as never);
  if (error) {
    throw new Error(
      typeof error === "object" && error && "detail" in error
        ? String((error as { detail: unknown }).detail)
        : "Failed to load stay taxonomy",
    );
  }
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
    getApiClient().POST("/api/v1/partner/stays/photos" as never, {
      body: { file },
      bodySerializer(body: { file?: Blob }) {
        const form = new FormData();
        if (body.file) form.append("file", body.file, file.name);
        return form;
      },
    } as never),
  );
  return data as StayPhotoUpload;
}

export async function createPartnerStayProperty(input: {
  variant_id: string;
  title: string;
  description: string;
  location_text: string;
  nightly_rate_paise: number;
  sharing_count?: number;
  structured_fields?: Record<string, unknown>;
  cancellation_policy_text?: string;
  house_rules?: string;
  image_urls: string[];
}): Promise<StayProperty> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties", {
      body: {
        variant_id: input.variant_id,
        title: input.title,
        description: input.description,
        location_text: input.location_text,
        nightly_rate_paise: input.nightly_rate_paise,
        sharing_count: input.sharing_count ?? 1,
        structured_fields: input.structured_fields ?? {},
        cancellation_policy_text: input.cancellation_policy_text ?? "",
        house_rules: input.house_rules ?? "",
        image_urls: input.image_urls,
      } as unknown as Schemas["CreatePropertyRequest"],
    }),
  );
  return data as StayProperty;
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
): Promise<StayEnquiry> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/enquiries/{enquiry_id}/respond", {
      params: { path: { enquiry_id: enquiryId } },
      body: { response, decline: false },
    }),
  );
  return data as StayEnquiry;
}

export function stayVariantChoices(
  capabilities: readonly PartnerCapability[] | undefined,
): Array<{ id: string; name: string }> {
  if (!capabilities) return [];
  return capabilities
    .filter((cap) => cap.workspace_key === "A9_STAY" && cap.status === "APPROVED")
    .map((cap) => ({ id: cap.variant_id, name: cap.variant_name }));
}
