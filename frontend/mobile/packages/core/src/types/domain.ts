import type { components } from "@vsolve/api-client";

export type Schemas = components["schemas"];

export type BookingMode = "instant" | "scheduled";

export type PayoutAccount = Schemas["PartnerPayoutAccount"];
export type PayoutAccountInput = Schemas["PartnerPayoutAccountCreateRequest"];
export type Withdrawal = Schemas["PartnerWithdrawal"];
export type WithdrawalPreview = Schemas["PartnerWithdrawalPreview"];

export interface DispatchBooking {
  id: string;
  status: string;
  booking_mode: string;
  scheduled_start: string | null;
  estimated_duration_minutes: number;
  service_title: string;
  service_category: string;
  location_area: string;
  customer_notes: string;
}

export interface DispatchOfferData {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  remaining_seconds: number;
  server_now: string;
  booking: DispatchBooking;
}

export interface StayLook {
  id: string;
  name: string;
  display_name: string;
  display_order: number;
  media: readonly {
    id: string;
    url: string;
    caption?: string;
    display_order?: number;
  }[];
}

