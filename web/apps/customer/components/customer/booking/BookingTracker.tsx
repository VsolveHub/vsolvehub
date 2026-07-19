"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { ElectricianTracker } from "./ElectricianTracker";
import { BeauticianTracker } from "./BeauticianTracker";
import { ConstructionTracker } from "./ConstructionTracker";
import { CrewBookingTracker, type CrewTrackingData } from "./CrewBookingTracker";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatPrice } from "@/lib/format";

type TrackingData = {
  bookingRef: string;
  status: string;
  message: string;
  marketplace?: boolean;
  isCrew?: boolean;
  service: { id: string; name: string; slug: string; categorySlug: string };
  issueDescription: string;
  mediaUrls: string[];
  slot: string;
  scheduleType: string;
  address: string;
  vendor: { id: string; name: string; phone: string; rating: number } | null;
  provider: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    etaMinutes: number;
  } | null;
  quotedAmount: number;
  finalAmountPaise: number;
  paymentStatus: string;
  paymentMethod: string | null;
  rating: number | null;
  archetypeDetails: string;
};

type PaymentMethod = "upi" | "card" | "wallet" | "cod";

export function BookingTracker({ bookingRef }: { bookingRef: string }) {
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");

  // Live status: server-hydrated on first paint, then polled every 4s.
  const { data, isError } = useQuery<TrackingData>({
    queryKey: qk.booking(bookingRef),
    queryFn: () => api.booking(bookingRef) as Promise<TrackingData>,
    refetchInterval: 4000,
    staleTime: 0,
  });

  // Child trackers call this after their own actions to force a fresh read.
  const fetchStatus = () => queryClient.invalidateQueries({ queryKey: qk.booking(bookingRef) });

  const payMutation = useMutation({
    mutationFn: () => api.payBooking(bookingRef, paymentMethod),
    onSuccess: fetchStatus,
  });
  const retryMutation = useMutation({
    mutationFn: () => api.retryBooking(bookingRef),
    onSuccess: fetchStatus,
  });

  const actionLoading = payMutation.isPending || retryMutation.isPending;
  const actionError =
    (payMutation.error instanceof Error ? payMutation.error.message : "") ||
    (retryMutation.error instanceof Error ? retryMutation.error.message : "");

  if (isError) {
    return <div className="alert alert-error">Booking not found</div>;
  }

  if (!data) {
    return <LoadingState label="Loading booking status…" variant="inline" />;
  }

  if (data.isCrew) {
    return <CrewBookingTracker booking={data as unknown as CrewTrackingData} onRefresh={fetchStatus} />;
  }

  const categorySlug = data.service.categorySlug;
  const needsPayment = data.status === "ASSIGNED" && data.paymentStatus === "PENDING";
  const noProviderFound = data.status === "NO_WORKER_FOUND";
  const searchingProvider = data.status === "PENDING" || data.status === "SEARCHING_PROVIDER";
  const actionPanel = data.marketplace ? (
    <div className="mx-auto w-full flow-page-shell__inner bg-white border-b border-purple-100 px-4 py-3 shadow-sm">
      {searchingProvider && (
        <p className="text-xs font-semibold text-purple-900 m-0">
          Your professional had to step away — we're finding you a new one now. No action needed.
        </p>
      )}
      {needsPayment && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-purple-950 m-0">Partner assigned</p>
              <p className="text-[11px] text-gray-500 m-0">Pay now so the partner can start moving.</p>
            </div>
            <span className="text-sm font-black text-purple-900">{formatPrice(data.finalAmountPaise ?? data.quotedAmount)}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(["upi", "card", "wallet", "cod"] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase ${
                  paymentMethod === method ? "border-purple-700 bg-purple-50 text-purple-900" : "border-gray-200 text-gray-600"
                }`}
              >
                {method}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => payMutation.mutate()}
            disabled={actionLoading}
            className="w-full rounded-xl bg-purple-800 py-2.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {actionLoading ? "Processing…" : `Pay ${formatPrice(data.finalAmountPaise ?? data.quotedAmount)}`}
          </button>
        </div>
      )}
      {noProviderFound && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-amber-800 m-0">
            No provider accepted this request. You can retry and send it to available partners again.
          </p>
          <button
            type="button"
            onClick={() => retryMutation.mutate()}
            disabled={actionLoading}
            className="w-full rounded-xl bg-purple-800 py-2.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {actionLoading ? "Resending…" : "Retry request"}
          </button>
        </div>
      )}
      {actionError && <p className="mt-2 text-xs font-semibold text-red-600">{actionError}</p>}
    </div>
  ) : null;

  if (categorySlug === "construction-services") {
    return (
      <>
        {actionPanel}
        <ConstructionTracker booking={data} onRefresh={fetchStatus} />
      </>
    );
  }

  if (categorySlug === "beauty-wellness") {
    return (
      <>
        {actionPanel}
        <BeauticianTracker booking={data} onRefresh={fetchStatus} />
      </>
    );
  }

  // Default (Electrician/Technician/etc. Archetype A)
  return (
    <>
      {actionPanel}
      <ElectricianTracker booking={data} onRefresh={fetchStatus} />
    </>
  );
}
