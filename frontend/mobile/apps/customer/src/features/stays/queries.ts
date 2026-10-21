import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

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
          sort: params?.sort,
          limit: params?.limit,
          offset: params?.offset,
        },
      },
    }),
  );
}

export function fetchStayTaxonomy(): Promise<StayTaxonomyCategory[]> {
  return request(() => getApiClient().GET("/api/v1/stays/taxonomy"));
}

/** `key` is the page slug; an old link's property id works too. */
export function fetchStayProperty(key: string): Promise<StayProperty> {
  return request(() =>
    getApiClient().GET("/api/v1/stays/{key}", {
      params: {
        path: { key },
      },
    }),
  );
}

export function fetchStayQuote(params: {
  property_id: string;
  check_in: string;
  length: number;
  unit_id?: string | null;
}): Promise<StayQuote> {
  return request(() =>
    getApiClient().GET("/api/v1/stays/quote", {
      params: {
        query: {
          property_id: params.property_id,
          check_in: params.check_in,
          length: params.length,
          unit_id: params.unit_id ?? undefined,
        },
      },
    }),
  );
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
}): Promise<StayEnquiry> {
  const sanitizedUnitId =
    payload.unit_id && payload.unit_id.trim() !== "" ? payload.unit_id.trim() : undefined;

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
      },
    }),
  );
}

export function fetchMyStayEnquiries(): Promise<StayEnquiry[]> {
  return request(() => getApiClient().GET("/api/v1/me/stay-enquiries"));
}

export function fetchMyStayReservations(): Promise<StayReservation[]> {
  return request(() => getApiClient().GET("/api/v1/me/stay-reservations"));
}

export function fetchMyStayVisits(): Promise<StayVisit[]> {
  return request(() => getApiClient().GET("/api/v1/me/stay-visits"));
}

export function fetchVisitSlots(propertyId: string): Promise<StayVisitSlot[]> {
  return request(() =>
    getApiClient().GET("/api/v1/stays/{property_id}/visit-slots", {
      params: { path: { property_id: propertyId } },
    }),
  );
}

export function createStayVisit(payload: {
  property_id: string;
  slot_id: string;
  visit_date: string;
  unit_id?: string | null;
  message?: string;
}): Promise<StayVisit> {
  return request(() =>
    getApiClient().POST("/api/v1/stays/visits", {
      body: {
        property_id: payload.property_id,
        slot_id: payload.slot_id,
        visit_date: payload.visit_date,
        unit_id: payload.unit_id ?? undefined,
        message: payload.message ?? "",
      },
    }),
  );
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
        body: payload.comment ?? "",
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
