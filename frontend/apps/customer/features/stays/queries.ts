"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import type { StayFilterParams } from "./model";

export type StayProperty = Schemas["Property"];
export type StayPropertySummary = Schemas["PropertySummary"];
export type StayEnquiry = Schemas["StayEnquiry"];
export type StayQuote = Schemas["StayQuoteResponse"];
export type CreateEnquiryRequest = Schemas["CreateEnquiryRequest"];

export function fetchStays(params?: StayFilterParams) {
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
        } as Record<string, unknown>,
      },
    }),
  );
}

export function fetchStayTaxonomy() {
  return request(() => getApiClient().GET("/api/v1/stays/taxonomy"));
}

/** `key` is the page slug; an old link's property id works too. */
export function fetchStayProperty(key: string) {
  return request(() =>
    getApiClient().GET("/api/v1/stays/{key}", {
      params: {
        path: { key },
      },
    }),
  );
}

/** `length` is in the property's price unit: nights or months. */
export function fetchStayQuote(params: {
  property_id: string;
  check_in: string;
  length: number;
  unit_id?: string | null;
}) {
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
  /** The look the guest picked, when the room type has several. */
  look_id?: string | null;
}) {
  return request(() =>
    getApiClient().POST("/api/v1/stays/enquire", {
      body: {
        property_id: payload.property_id,
        check_in: payload.check_in,
        length: payload.length,
        guest_count: payload.guest_count ?? 1,
        // Forward adult/child breakdown when the server supports it.
        // The backend will ignore unknown fields gracefully until the migration lands.
        ...(payload.adult_count !== undefined && { adult_count: payload.adult_count }),
        ...(payload.child_count !== undefined && { child_count: payload.child_count }),
        message: payload.message ?? "",
        unit_id: payload.unit_id ?? undefined,
        look_id: payload.look_id ?? undefined,
      },
    }),
  );
}

export function fetchMyStayEnquiriesPage(cursor?: string) {
  return request(() =>
    getApiClient().GET("/api/v1/me/stay-enquiries", { params: { query: cursor ? { cursor } : {} } }),
  );
}

export type StayReservation = Schemas["StayReservation"];

export function fetchMyStayReservationsPage(cursor?: string) {
  return request(() =>
    getApiClient().GET("/api/v1/me/stay-reservations", {
      params: { query: cursor ? { cursor } : {} },
    }),
  );
}

export function cancelStayEnquiry(enquiryId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/me/stay-enquiries/{enquiry_id}/cancel", {
      params: { path: { enquiry_id: enquiryId } },
    }),
  );
}

export function cancelStayReservation(reservationId: string) {
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

export type StayVisit = Schemas["StayVisit"];

export function fetchMyStayVisitsPage(cursor?: string) {
  return request(() =>
    getApiClient().GET("/api/v1/me/stay-visits", { params: { query: cursor ? { cursor } : {} } }),
  );
}

export function fetchVisitSlots(propertyId: string) {
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
  look_id?: string | null;
  message?: string;
}) {
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
  );
}

export function cancelStayVisit(visitId: string) {
  return request(() =>
    getApiClient().POST("/api/v1/me/stay-visits/{visit_id}/cancel", {
      params: { path: { visit_id: visitId } },
    }),
  );
}

/** A guest can cancel a visit that is still requested or already accepted. */
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
}) {
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


/** Uploads one review photo (JPEG, PNG or WebP, up to 10 MB); returns its link for the review. */
export async function uploadStayReviewPhoto(file: File): Promise<{ upload_id: string; url: string }> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/stays/reviews/photos", {
      body: { file },
      bodySerializer(body) {
        const form = new FormData();
        const blob =
          body && typeof body === "object" && "file" in body ? (body as { file?: Blob }).file : undefined;
        if (blob) form.append("file", blob, file.name);
        return form;
      },
    }),
  );
  return data as { upload_id: string; url: string };
}
