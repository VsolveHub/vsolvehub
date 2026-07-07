// Thin typed fetch wrappers — the ONE place that knows each endpoint URL/shape.
// Query hooks and server prefetch both call these, so there are no duplicated
// inline `fetch("/api/…")` strings scattered across components.
import type { AppNotification } from "@/lib/notifications/types";
import type { FlowService } from "@/components/customer/booking/ServiceBookingFlow";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...init?.headers } });
  if (!res.ok) {
    let message = "Something went wrong";
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

function jsonPost<T>(url: string, body?: unknown): Promise<T> {
  return jsonFetch<T>(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export type SessionUser = { id: string; name?: string | null; phone?: string } | null;
export type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
  area?: string | null;
  city?: string | null;
};
export type NearbyProvider = {
  id: string;
  name: string;
  rating: number;
  jobsCompleted: number;
  distanceKm: number;
  etaMins: number;
};
export type PaymentMethod = "upi" | "card" | "wallet" | "cod";

export const api = {
  // ── reads ──
  session: () => jsonFetch<{ user: SessionUser }>("/api/auth/session").catch(() => ({ user: null })),
  notifications: (audience: "customer" | "provider" = "customer") =>
    jsonFetch<{ items: AppNotification[] }>(
      audience === "provider" ? "/api/provider/notifications" : "/api/notifications",
    ),
  addresses: () => jsonFetch<{ addresses: Address[] }>("/api/profile/addresses"),
  booking: (ref: string) => jsonFetch<Record<string, unknown>>(`/api/bookings/${ref}`),
  catalog: () => jsonFetch<{ services: FlowService[] }>("/api/catalog"),
  providers: (serviceId: string, addressId?: string | null) =>
    jsonFetch<{ providers: NearbyProvider[] }>(
      `/api/providers/nearby?serviceId=${serviceId}${addressId ? `&addressId=${addressId}` : ""}`,
    ),

  // ── mutations ──
  addAddress: (input: Record<string, unknown>) =>
    jsonPost<{ address: Address }>("/api/profile/addresses", input),
  createBooking: (input: Record<string, unknown>) =>
    jsonPost<{ bookingRef: string; status: string; assignmentMode?: string }>("/api/bookings", input),
  payBooking: (ref: string, paymentMethod: PaymentMethod) =>
    jsonPost<{ ok: boolean; paymentStatus?: string }>(`/api/bookings/${ref}/pay`, { paymentMethod }),
  cancelBooking: (ref: string) => jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/cancel`),
  reviewBooking: (ref: string, rating: number, review: string) =>
    jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/review`, { rating, review }),
  reviseBooking: (ref: string, action: "approve" | "decline") =>
    jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/revise`, { action }),
  retryBooking: (ref: string) => jsonPost<{ ok?: boolean }>(`/api/bookings/${ref}/retry`),
};
