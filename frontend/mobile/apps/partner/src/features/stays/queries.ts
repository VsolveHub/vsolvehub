import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

import type {
  HostStaySummary,
  PartnerStayVisit,
  StayEnquiry,
  StayProperty,
  StayPropertyAction,
  StayReservation,
  StayReservationAction,
  StayRoom,
  StayUnit,
  StayUnitMedia,
} from "./model";

export async function fetchPartnerDefaultLocation(): Promise<string> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/me/"));
    return (((data as any)?.default_location_text as string) ?? "").trim();
  } catch {
    return "";
  }
}

export async function fetchPartnerStayProperties(): Promise<StayProperty[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/stays/properties"));
    return Array.isArray(data) ? (data as StayProperty[]) : [];
  } catch {
    return [];
  }
}

export async function fetchPartnerStaySummary(): Promise<HostStaySummary | null> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/stays/summary"));
    return data as HostStaySummary;
  } catch {
    return null;
  }
}

export async function fetchPartnerStayEnquiries(): Promise<StayEnquiry[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/stays/enquiries"));
    return Array.isArray(data) ? (data as StayEnquiry[]) : [];
  } catch {
    return [];
  }
}

export async function fetchPartnerStayVisits(): Promise<PartnerStayVisit[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/partner/stays/visits"));
    return Array.isArray(data) ? (data as PartnerStayVisit[]) : [];
  } catch {
    return [];
  }
}

export async function fetchPartnerStayReservations(): Promise<StayReservation[]> {
  try {
    const data = await request(() =>
      (getApiClient() as any).GET("/api/v1/partner/stays/reservations"),
    );
    return Array.isArray(data) ? (data as StayReservation[]) : [];
  } catch {
    return [];
  }
}

export async function partnerStayReservationAction(
  reservationId: string,
  action: StayReservationAction,
  reason: string = "",
): Promise<StayReservation> {
  const data = await request(() =>
    (getApiClient() as any).POST(
      "/api/v1/partner/stays/reservations/{reservation_id}/{action}",
      {
        params: { path: { reservation_id: reservationId, action } },
        body: { reason },
      },
    ),
  );
  return data as StayReservation;
}

export async function uploadPartnerStayPhoto(
  uri: string,
  fileName?: string,
): Promise<{ upload_id: string; url: string }> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: fileName || "stay_photo.jpg",
    type: "image/jpeg",
  } as any);

  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/photos", {
      body: formData,
      bodySerializer: () => formData,
    }),
  );
  return data as { upload_id: string; url: string };
}

export async function createPartnerStayProperty(payload: {
  variant_id?: string;
  title: string;
  location_text: string;
  description?: string;
  house_rules?: string;
  nightly_rate_paise?: number;
  sharing_count?: number;
  unit_name?: string;
  min_stay_nights?: number;
  structured_fields?: Record<string, any>;
  image_urls?: string[];
}): Promise<StayProperty> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/properties", {
      body: {
        variant_id: payload.variant_id,
        title: payload.title,
        location_text: payload.location_text,
        description: payload.description ?? "",
        house_rules: payload.house_rules ?? "",
        nightly_rate_paise: payload.nightly_rate_paise,
        sharing_count: payload.sharing_count ?? 1,
        unit_name: payload.unit_name ?? "Standard Room",
        min_stay_nights: payload.min_stay_nights ?? 1,
        structured_fields: payload.structured_fields ?? {},
        image_urls: payload.image_urls ?? [],
      },
    }),
  );
  return data as StayProperty;
}

export async function updatePartnerStayProperty(
  propertyId: string,
  payload: Partial<StayProperty>,
): Promise<StayProperty> {
  const data = await request(() =>
    (getApiClient() as any).PATCH("/api/v1/partner/stays/properties/{property_id}", {
      params: { path: { property_id: propertyId } },
      body: payload,
    }),
  );
  return data as StayProperty;
}

export async function partnerStayPropertyAction(
  propertyId: string,
  action: StayPropertyAction,
): Promise<StayProperty> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/properties/{property_id}/{action}", {
      params: { path: { property_id: propertyId, action } },
    }),
  );
  return data as StayProperty;
}

export async function addPartnerStayPropertyMedia(
  propertyId: string,
  payload: { url: string; caption?: string; display_order?: number },
) {
  return request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/properties/{property_id}/media", {
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
    (getApiClient() as any).DELETE(
      "/api/v1/partner/stays/properties/{property_id}/media/{media_id}",
      {
        params: { path: { property_id: propertyId, media_id: mediaId } },
      },
    ),
  );
}

export async function listPartnerStayUnits(propertyId: string): Promise<StayUnit[]> {
  try {
    const data = await request(() =>
      (getApiClient() as any).GET("/api/v1/partner/stays/properties/{property_id}/units", {
        params: { path: { property_id: propertyId } },
      }),
    );
    return Array.isArray(data) ? (data as StayUnit[]) : [];
  } catch {
    return [];
  }
}

export async function createPartnerStayUnit(
  propertyId: string,
  payload: {
    name: string;
    nightly_rate_paise: number;
    sharing_count?: number;
    quantity?: number;
    max_guests?: number;
    room_numbers?: string[];
    image_urls?: string[];
    attributes?: Record<string, any>;
  },
): Promise<StayUnit> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/properties/{property_id}/units", {
      params: { path: { property_id: propertyId } },
      body: {
        name: payload.name,
        nightly_rate_paise: payload.nightly_rate_paise,
        sharing_count: payload.sharing_count ?? 1,
        quantity: payload.quantity ?? 1,
        max_guests: payload.max_guests,
        room_numbers: payload.room_numbers ?? [],
        image_urls: payload.image_urls ?? [],
        attributes: payload.attributes ?? {},
      },
    }),
  );
  return data as StayUnit;
}

export async function updatePartnerStayUnit(
  unitId: string,
  payload: Partial<StayUnit>,
): Promise<StayUnit> {
  const data = await request(() =>
    (getApiClient() as any).PATCH("/api/v1/partner/stays/units/{unit_id}", {
      params: { path: { unit_id: unitId } },
      body: payload,
    }),
  );
  return data as StayUnit;
}

export async function addPartnerStayUnitMedia(
  unitId: string,
  url: string,
): Promise<StayUnitMedia> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/units/{unit_id}/media", {
      params: { path: { unit_id: unitId } },
      body: { url },
    }),
  );
  return data as StayUnitMedia;
}

export async function deletePartnerStayUnitMedia(
  unitId: string,
  mediaId: string,
): Promise<void> {
  await request(() =>
    (getApiClient() as any).DELETE("/api/v1/partner/stays/units/{unit_id}/media/{media_id}", {
      params: { path: { unit_id: unitId, media_id: mediaId } },
    }),
  );
}

export async function setPartnerVisitingHours(
  propertyId: string,
  input: {
    visits_enabled: boolean;
    slots: { weekday: number; start_time: string; end_time: string }[];
    blocked_dates: string[];
  },
): Promise<StayProperty> {
  const data = await request(() =>
    (getApiClient() as any).PUT(
      "/api/v1/partner/stays/properties/{property_id}/visiting-hours",
      {
        params: { path: { property_id: propertyId } },
        body: input,
      },
    ),
  );
  return data as StayProperty;
}

export async function respondPartnerStayEnquiry(
  enquiryId: string,
  responseMessage: string,
  decline: boolean = false,
): Promise<StayEnquiry> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/enquiries/{enquiry_id}/respond", {
      params: { path: { enquiry_id: enquiryId } },
      body: { response: responseMessage, decline },
    }),
  );
  return data as StayEnquiry;
}

export async function confirmPartnerStayEnquiry(
  enquiryId: string,
  roomId?: string | null,
): Promise<StayEnquiry> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/enquiries/{enquiry_id}/confirm", {
      params: { path: { enquiry_id: enquiryId } },
      body: { room_id: roomId ?? null },
    }),
  );
  return data as StayEnquiry;
}

export async function cancelPartnerStayEnquiry(
  enquiryId: string,
): Promise<StayEnquiry> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/enquiries/{enquiry_id}/cancel", {
      params: { path: { enquiry_id: enquiryId } },
    }),
  );
  return data as StayEnquiry;
}

export async function addPartnerStayRoom(
  unitId: string,
  payload: { number: string },
): Promise<StayRoom> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/units/{unit_id}/rooms", {
      params: { path: { unit_id: unitId } },
      body: payload,
    }),
  );
  return data as StayRoom;
}

export async function updatePartnerStayRoom(
  roomId: string,
  payload: { number?: string; available?: boolean },
): Promise<StayRoom> {
  const data = await request(() =>
    (getApiClient() as any).PATCH("/api/v1/partner/stays/rooms/{room_id}", {
      params: { path: { room_id: roomId } },
      body: payload,
    }),
  );
  return data as StayRoom;
}

export async function deletePartnerStayRoom(roomId: string): Promise<void> {
  await request(() =>
    (getApiClient() as any).DELETE("/api/v1/partner/stays/rooms/{room_id}", {
      params: { path: { room_id: roomId } },
    }),
  );
}

export async function partnerStayRoomAction(
  roomId: string,
  action: "book" | "release",
  payload?: { occupant_name?: string },
): Promise<StayRoom> {
  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/rooms/{room_id}/{action}", {
      params: { path: { room_id: roomId, action } },
      body: payload ?? {},
    }),
  );
  return data as StayRoom;
}

export async function partnerStayVisitAction(
  visitId: string,
  action: "accept" | "decline",
  payload?: { reason?: string; note?: string } | string,
  noteParam: string = "",
): Promise<PartnerStayVisit> {
  const body =
    typeof payload === "object"
      ? payload
      : { reason: payload ?? "", note: noteParam };

  const data = await request(() =>
    (getApiClient() as any).POST("/api/v1/partner/stays/visits/{visit_id}/{action}", {
      params: { path: { visit_id: visitId, action } },
      body,
    }),
  );
  return data as PartnerStayVisit;
}

export async function fetchStayTaxonomy(): Promise<any[]> {
  try {
    const data = await request(() => (getApiClient() as any).GET("/api/v1/stays/taxonomy"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

