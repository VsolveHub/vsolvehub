import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type StayProperty = Schemas["Property"];
export type StayEnquiry = Schemas["StayEnquiry"];
export type PartnerCapability = Schemas["PartnerCapability"];

export async function fetchPartnerStayProperties(): Promise<StayProperty[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/stays/properties"));
  return Array.isArray(data) ? data : [];
}

export async function fetchPartnerStayEnquiries(): Promise<StayEnquiry[]> {
  const data = await request(() => getApiClient().GET("/api/v1/partner/stays/enquiries"));
  return Array.isArray(data) ? data : [];
}

export async function createPartnerStayProperty(input: {
  variant_id: string;
  title: string;
  location_text: string;
  nightly_rate_paise: number;
}): Promise<StayProperty> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/partner/stays/properties", {
      body: {
        variant_id: input.variant_id,
        title: input.title,
        description: "",
        location_text: input.location_text,
        nightly_rate_paise: input.nightly_rate_paise,
      } as Schemas["CreatePropertyRequest"],
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
