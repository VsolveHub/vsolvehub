import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import type { Page } from "@vsolve/query/native";

import type {
  StayEnquiry,
  StayFilterParams,
  StayProperty,
  StayPropertySummary,
  StayQuote,
  StayReservation,
  StayTaxonomyCategory,
  StayVisit,
  StayVisitSlot,
} from "./model";

export type {
  StayEnquiry,
  StayFilterParams,
  StayProperty,
  StayPropertySummary,
  StayQuote,
  StayReservation,
  StayTaxonomyCategory,
  StayVisit,
  StayVisitSlot,
};

export function fetchStays(params?: StayFilterParams): Promise<StayPropertySummary[]> {
  return request(() =>
    getApiClient().GET("/api/v1/stays", {
      params: {
        query: {
          q: params?.q,
          location: params?.location,
          service: params?.service,
          sharing_count: params?.sharing_count,
          ac: params?.ac,
          food: params?.food,
          min_price: params?.min_price,
          max_price: params?.max_price,
          tenant_preference: params?.tenant_preference,
          lat: params?.lat,
          lng: params?.lng,
          sort: params?.sort,
          limit: params?.limit,
          offset: params?.offset,
        },
      },
    }),
  ) as unknown as Promise<StayPropertySummary[]>;
}

export function fetchStayProperty(propertyId: string): Promise<StayProperty> {
  return request(() =>
    getApiClient().GET("/api/v1/stays/{key}", {
      params: { path: { key: propertyId } },
    }),
  ) as unknown as Promise<StayProperty>;
}

export function fetchStayTaxonomy(): Promise<StayTaxonomyCategory[]> {
  return request(() => getApiClient().GET("/api/v1/stays/taxonomy"));
}

export function fetchStayQuote(params: {
  property_id: string;
  check_in: string;
  length: number;
  guest_count?: number;
  unit_id?: string | null;
}): Promise<StayQuote> {
  const sanitizedUnitId =
    params.unit_id === "" || params.unit_id === null ? undefined : params.unit_id;
  return request(() =>
    getApiClient().GET("/api/v1/stays/quote", {
      params: {
        query: {
          property_id: params.property_id,
          check_in: params.check_in,
          length: params.length,
          unit_id: sanitizedUnitId,
        },
      },
    }),
  ) as unknown as Promise<StayQuote>;
}

export function createStayEnquiry(payload: {
  property_id: string;
  check_in: string;
  length: number;
  guest_count?: number;
  adult_count?: number;
  child_count?: number;
  message?: string;
  unit_id?: string | null;
  look_id?: string | null;
}): Promise<StayEnquiry> {
  const sanitizedUnitId =
    payload.unit_id === "" || payload.unit_id === null ? undefined : payload.unit_id;
  const sanitizedLookId =
    payload.look_id === "" || payload.look_id === null ? undefined : payload.look_id;
  return request(() =>
    getApiClient().POST("/api/v1/stays/enquire", {
      body: {
        property_id: payload.property_id,
        check_in: payload.check_in,
        length: payload.length,
        guest_count: payload.guest_count ?? 1,
        ...(payload.adult_count !== undefined && { adult_count: payload.adult_count }),
        ...(payload.child_count !== undefined && { child_count: payload.child_count }),
        message: payload.message ?? "",
        unit_id: sanitizedUnitId,
        look_id: sanitizedLookId,
      },
    }),
  ) as unknown as Promise<StayEnquiry>;
}

export async function fetchMyStayEnquiries(): Promise<StayEnquiry[]> {
  const data = await request(() => getApiClient().GET("/api/v1/me/stay-enquiries"));
  if (Array.isArray(data)) return data as StayEnquiry[];
  return (((data as unknown as { results?: unknown[] })?.results ?? []) as unknown) as StayEnquiry[];
}

export function fetchMyStayEnquiriesPage(cursor?: string): Promise<Page<StayEnquiry>> {
  return request(() =>
    getApiClient().GET("/api/v1/me/stay-enquiries", { params: { query: { cursor } } }),
  ) as unknown as Promise<Page<StayEnquiry>>;
}

export async function fetchMyStayReservations(): Promise<StayReservation[]> {
  const data = await request(() => getApiClient().GET("/api/v1/me/stay-reservations"));
  if (Array.isArray(data)) return data as StayReservation[];
  return (((data as unknown as { results?: unknown[] })?.results ?? []) as unknown) as StayReservation[];
}

export function fetchMyStayReservationsPage(cursor?: string): Promise<Page<StayReservation>> {
  return request(() =>
    getApiClient().GET("/api/v1/me/stay-reservations", { params: { query: { cursor } } }),
  ) as unknown as Promise<Page<StayReservation>>;
}

export async function fetchMyStayVisits(): Promise<StayVisit[]> {
  const data = await request(() => getApiClient().GET("/api/v1/me/stay-visits"));
  if (Array.isArray(data)) return data as StayVisit[];
  return (((data as unknown as { results?: unknown[] })?.results ?? []) as unknown) as StayVisit[];
}

export function fetchMyStayVisitsPage(cursor?: string): Promise<Page<StayVisit>> {
  return request(() =>
    getApiClient().GET("/api/v1/me/stay-visits", { params: { query: { cursor } } }),
  ) as unknown as Promise<Page<StayVisit>>;
}

export async function fetchVisitSlots(propertyId: string): Promise<StayVisitSlot[]> {
  const data = await request(() =>
    getApiClient().GET("/api/v1/stays/{key}/visit-slots", {
      params: { path: { key: propertyId } },
    }),
  );
  if (Array.isArray(data)) {
    return data as unknown as StayVisitSlot[];
  }
  return [];
}

export function createStayVisit(payload: {
  property_id: string;
  slot_id: string;
  visit_date: string;
  unit_id?: string | null;
  look_id?: string | null;
  message?: string;
}): Promise<StayVisit> {
  return request(() =>
    getApiClient().POST("/api/v1/stays/visits", {
      body: {
        property_id: payload.property_id,
        slot_id: payload.slot_id,
        visit_date: payload.visit_date,
        unit_id: payload.unit_id ?? undefined,
        look_id: payload.look_id ?? undefined,
        message: payload.message ?? "",
      },
    }),
  ) as unknown as Promise<StayVisit>;
}

export function cancelStayEnquiry(enquiryId: string): Promise<{ status?: string }> {
  return request(() =>
    getApiClient().POST("/api/v1/me/stay-enquiries/{enquiry_id}/cancel", {
      params: { path: { enquiry_id: enquiryId } },
    }),
  );
}

export function cancelStayVisit(visitId: string): Promise<{ status?: string }> {
  return request(() =>
    getApiClient().POST("/api/v1/me/stay-visits/{visit_id}/cancel", {
      params: { path: { visit_id: visitId } },
    }),
  );
}

export function cancelStayReservation(reservationId: string): Promise<{ status?: string }> {
  return request(() =>
    getApiClient().POST("/api/v1/me/stay-reservations/{reservation_id}/cancel", {
      params: { path: { reservation_id: reservationId } },
    }),
  );
}

export function canCancelStayEnquiry(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return ["SUBMITTED", "RESPONDED", "CONFIRMED"].includes(value);
}

export function canCancelStayReservation(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return ["HELD", "PAYMENT_PENDING", "CONFIRMED"].includes(value);
}

export function canCancelStayVisit(status?: string): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "REQUESTED" || value === "ACCEPTED";
}

export function submitStayReview(payload: {
  property_id: string;
  rating: number;
  comment?: string;
  enquiry_id?: string | null;
  reservation_id?: string | null;
  image_urls?: string[];
}): Promise<{ id?: string; status?: string }> {
  return request(() =>
    getApiClient().POST("/api/v1/stays/reviews", {
      body: {
        property_id: payload.property_id,
        rating: payload.rating,
        comment: payload.comment ?? "",
        enquiry_id: payload.enquiry_id ?? undefined,
        reservation_id: payload.reservation_id ?? undefined,
        image_urls: payload.image_urls ?? [],
      },
    }),
  );
}

export async function uploadStayReviewPhoto(
  uri: string,
  fileName?: string,
): Promise<{ upload_id: string; url: string }> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: fileName || "review_photo.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const data = await request(() =>
    getApiClient().POST("/api/v1/stays/reviews/photos", {
      body: formData,
      bodySerializer: () => formData,
    }),
  );
  return data as unknown as { upload_id: string; url: string };
}
