"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@vsolve/api-client";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

export interface RentalBookingItem {
  id: string;
  asset_id: string;
  asset_title: string;
  vendor_name: string;
  assigned_serial: string;
  rental_start: string;
  rental_end: string;
  delivery_mode: string;
  status: string;
  daily_price_paise: number;
  deposit_paise: number;
  created_at?: string;
  updated_at?: string;
  delivery_address?: {
    line1?: string;
    city?: string;
    postal_code?: string;
  } | null;
  deposit?: {
    status: string;
    amount_paise: number;
    refunded_amount_paise: number;
    consumed_amount_paise: number;
  } | null;
}

export async function fetchCustomerRentalBookings(tab?: "active" | "completed"): Promise<RentalBookingItem[]> {
  const query = tab ? `?tab=${tab}` : "";
  const res = await apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/my-bookings/${query}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, any>;
    const message = body?.detail || body?.error || `Failed to load rental bookings (${res.status})`;
    throw new Error(message);
  }
  return res.json() as Promise<RentalBookingItem[]>;
}

export function useRentalBookings(tab?: "active" | "completed") {
  return useQuery({
    queryKey: ["rentals", "my-bookings", tab ?? "all"],
    queryFn: () => fetchCustomerRentalBookings(tab),
    staleTime: 30_000,
  });
}
