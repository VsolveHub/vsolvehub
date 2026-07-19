// Thin typed fetch wrappers — the ONE place that knows each endpoint URL/shape.
// Query hooks and server prefetch both call these, so there are no duplicated
// inline `fetch("/api/…")` strings scattered across components.
import type { AppNotification } from "@/lib/notifications/types";
import type { FlowService } from "@/components/customer/booking/ServiceBookingFlow";

export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body, so callers can read structured codes (e.g. the
   *  NO_PROVIDERS shape) rather than just the message string. */
  body: Record<string, unknown> | null;
  constructor(message: string, status: number, body: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...init?.headers } });
  if (!res.ok) {
    let message = "Something went wrong";
    let body: Record<string, unknown> | null = null;
    try {
      body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, body);
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
export type PaymentMethod = "upi" | "card" | "wallet" | "cod";
/** A pickable professional on the choose step (real, matcher-ranked). */
export type ProfessionalChoice = {
  id: string;
  name: string;
  rating: number;
  jobsCompleted: number;
  distanceKm: number;
  etaMins: number;
};
/** The professional revealed at checkout by direct assignment. */
export type AssignedPartner = { name: string; rating: number; jobsCompleted: number };
export type SlotSuggestion = { slotIso: string; label: string; count: number };
/** Body of a 409 from POST /api/bookings when no professional can take the slot. */
export type NoProvidersBody = {
  code: "NO_PROVIDERS";
  suggestedSlots: SlotSuggestion[];
  /** Present only on the post-payment race: money was returned in full. */
  refunded?: boolean;
};
export type CreateBookingResult = {
  bookingRef: string;
  status: string;
  assignmentMode?: string;
  partner?: AssignedPartner;
  /** False when the customer's picked pro was taken and we fell back. */
  preferredHonored?: boolean;
};

export const api = {
  // ── reads ──
  session: () => jsonFetch<{ user: SessionUser }>("/api/auth/session").catch(() => ({ user: null })),
  notifications: (audience: "customer" | "provider" = "customer") =>
    jsonFetch<{ items: AppNotification[] }>(
      audience === "provider" ? "/api/provider/notifications" : "/api/notifications",
    ),
  addresses: () => jsonFetch<{ addresses: Address[] }>("/api/profile/addresses"),
  booking: (ref: string) => jsonFetch<Record<string, unknown>>(`/api/bookings/${ref}`),
  vehicleBooking: (ref: string) => jsonFetch<any>(`/api/vehicle/bookings/${ref}`),
  getVehicleNextStatus: (ref: string) => jsonFetch<{ nextStatus: string }>(`/api/vehicle/bookings/${ref}/status`),
  catalog: () => jsonFetch<{ services: FlowService[] }>("/api/catalog"),

  // ── mutations ──
  addAddress: (input: Record<string, unknown>) =>
    jsonPost<{ address: Address }>("/api/profile/addresses", input),
  selectAddress: (id: string) =>
    jsonFetch<{ address: Address }>("/api/profile/addresses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  deleteAddress: (id: string) =>
    jsonFetch<{ success: boolean }>(`/api/profile/addresses?id=${id}`, {
      method: "DELETE",
    }),
  logout: () =>
    jsonFetch<{ success: boolean }>("/api/auth/session", {
      method: "DELETE",
    }),
  updateProfile: (input: { name: string }) =>
    jsonFetch<{ user: SessionUser }>("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  trackRecentlyViewed: (serviceId: string) =>
    jsonPost<{ ok: boolean }>("/api/recently-viewed", { serviceId }),
  saveService: (serviceId: string) =>
    jsonPost<{ ok: boolean }>("/api/profile/saved", { serviceId }),
  unsaveService: (serviceId: string) =>
    jsonFetch<{ ok: boolean }>(`/api/profile/saved?serviceId=${serviceId}`, {
      method: "DELETE",
    }),
  reverseGeocode: (lat: number, lng: number) =>
    jsonFetch<Record<string, unknown>>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`),
  availability: (input: { serviceId: string; addressId: string; slot: string; scheduleType: string }) =>
    jsonFetch<{ count: number; professionals: ProfessionalChoice[]; suggestedSlots: SlotSuggestion[] }>(
      `/api/providers/availability?serviceId=${input.serviceId}&addressId=${input.addressId}` +
        `&slot=${encodeURIComponent(input.slot)}&scheduleType=${input.scheduleType}`,
    ),
  createBooking: (input: Record<string, unknown>) =>
    jsonPost<CreateBookingResult>("/api/bookings", input),
  payBooking: (ref: string, paymentMethod: PaymentMethod) =>
    jsonPost<{ ok: boolean; paymentStatus?: string }>(`/api/bookings/${ref}/pay`, { paymentMethod }),
  cancelBooking: (ref: string) => jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/cancel`),
  cancelVehicleBooking: (ref: string) => jsonPost<{ success?: boolean }>(`/api/vehicle/bookings/${ref}/cancel`),
  setVehicleStatus: (ref: string, status: string) => jsonPost<{ success?: boolean }>(`/api/vehicle/bookings/${ref}/status`, { status }),
  getBookingNextStatus: (ref: string) => jsonFetch<{ nextStatus: string }>(`/api/bookings/${ref}/status`),
  setBookingStatus: (ref: string, status: string) => jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/status`, { status }),
  reviewBooking: (ref: string, rating: number, review: string) =>
    jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/review`, { rating, review }),
  reviseBooking: (ref: string, action: "approve" | "decline") =>
    jsonPost<{ success?: boolean }>(`/api/bookings/${ref}/revise`, { action }),
  retryBooking: (ref: string) => jsonPost<{ ok?: boolean }>(`/api/bookings/${ref}/retry`),
  cancelCrewBooking: (ref: string) => jsonPost<{ success?: boolean }>(`/api/crew/bookings/${ref}/cancel`),
  payCrewBooking: (ref: string, paymentMethod: string) => jsonPost<{ success?: boolean }>(`/api/crew/bookings/${ref}/pay`, { paymentMethod }),
  postCrewAction: (ref: string, path: string, body?: any) => jsonPost<{ success?: boolean }>(`/api/crew/bookings/${ref}/${path}`, body),
  approveCrewExtension: (ref: string, paymentMethod: string) => jsonPost<{ success?: boolean }>(`/api/crew/bookings/${ref}/extension`, { action: "approve", paymentMethod }),
  rescheduleCrewBooking: (ref: string, body: any) => jsonPost<{ success?: boolean }>(`/api/crew/bookings/${ref}/reschedule`, body),
  retryCrewBooking: (ref: string) => jsonPost<{ success?: boolean }>(`/api/crew/bookings/${ref}/retry`),
};
