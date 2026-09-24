import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type OpsRentalAsset = Schemas["RentalAsset"];
export type OpsStayProperty = Schemas["Property"];
export type ModerationAction = "APPROVE" | "REJECT";

export async function fetchOpsRentals(): Promise<OpsRentalAsset[]> {
  const data = await request(() => getApiClient().GET("/api/v1/ops/rentals"));
  return Array.isArray(data) ? data : [];
}

export async function moderateOpsRental(
  assetId: string,
  action: ModerationAction,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/rentals/{asset_id}/moderate", {
      params: { path: { asset_id: assetId } },
      body: { action, reason },
    }),
  );
}

export async function fetchOpsStays(): Promise<OpsStayProperty[]> {
  const data = await request(() => getApiClient().GET("/api/v1/ops/stays"));
  return Array.isArray(data) ? data : [];
}

export async function moderateOpsStay(
  propertyId: string,
  action: ModerationAction,
  reason: string,
): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/ops/stays/{property_id}/moderate", {
      params: { path: { property_id: propertyId } },
      body: { action, reason },
    }),
  );
}
