"use client";

import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";
import type { StayFilterParams } from "./model";

export type StayProperty = Schemas["Property"];
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
        },
      },
    }),
  );
}

export function fetchStayProperty(propertyId: string) {
  return request(() =>
    getApiClient().GET("/api/v1/stays/{property_id}", {
      params: {
        path: { property_id: propertyId },
      },
    }),
  );
}

export function fetchStayQuote(params: {
  property_id: string;
  check_in: string;
  check_out: string;
  unit_id?: string | null;
}) {
  return request(() =>
    getApiClient().GET("/api/v1/stays/quote", {
      params: {
        query: {
          property_id: params.property_id,
          check_in: params.check_in,
          check_out: params.check_out,
          unit_id: params.unit_id ?? undefined,
        },
      },
    }),
  );
}

export function createStayEnquiry(payload: {
  property_id: string;
  check_in: string;
  check_out: string;
  guest_count?: number;
  message?: string;
  unit_id?: string | null;
}) {
  return request(() =>
    getApiClient().POST("/api/v1/stays/enquire", {
      body: {
        property_id: payload.property_id,
        check_in: payload.check_in,
        check_out: payload.check_out,
        guest_count: payload.guest_count ?? 1,
        message: payload.message ?? "",
        unit_id: payload.unit_id ?? undefined,
      },
    }),
  );
}

export function fetchMyStayEnquiries() {
  return request(() => getApiClient().GET("/api/v1/me/stay-enquiries"));
}
