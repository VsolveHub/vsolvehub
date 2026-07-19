import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

const cancelMutate = vi.fn();
const reviseMutate = vi.fn();
const reviewMutate = vi.fn();
vi.mock("@/lib/query/hooks", () => ({
  useCancelBookingMutation: () => ({ mutate: cancelMutate, isPending: false }),
  useReviseBookingMutation: () => ({ mutate: reviseMutate, isPending: false }),
  useReviewBookingMutation: () => ({ mutate: reviewMutate, isPending: false }),
}));

import { useBookingLifecycle } from "./useBookingLifecycle";
import type { Booking } from "./types";

const booking: Booking = {
  bookingRef: "VSH1",
  status: "STARTED",
  message: "",
  service: { id: "s", name: "n", slug: "sl", categorySlug: "c" },
  issueDescription: "",
  mediaUrls: [],
  slot: "",
  scheduleType: "",
  address: "",
  vendor: null,
  provider: { id: "p", name: "Pro", phone: "1", rating: 5 },
  quotedAmount: 0,
  finalAmountPaise: 0,
  paymentStatus: "PENDING",
  paymentMethod: null,
  rating: null,
  archetypeDetails: "",
  cancelFeePaise: 0,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  cancelMutate.mockClear();
  reviseMutate.mockClear();
  reviewMutate.mockClear();
  vi.stubGlobal("confirm", () => true);
});

describe("useBookingLifecycle", () => {
  it("exposes derived view", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    expect(result.current.view.professional?.name).toBe("Pro");
    expect(result.current.view.status).toBe("STARTED");
  });
  it("reviseAction forwards the action to the revise mutation", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => result.current.reviseAction("approve"));
    expect(reviseMutate).toHaveBeenCalledWith("approve", expect.any(Object));
  });
  it("submitReview sends current rating and review text", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => {
      result.current.setRating(4);
      result.current.setReview("great");
    });
    act(() => result.current.submitReview());
    expect(reviewMutate).toHaveBeenCalledWith({ rating: 4, review: "great" }, expect.any(Object));
  });
  it("cancelBooking calls cancel mutation after confirm", () => {
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => result.current.cancelBooking());
    expect(cancelMutate).toHaveBeenCalled();
  });
  it("cancelBooking does nothing when confirm is declined", () => {
    vi.stubGlobal("confirm", () => false);
    const { result } = renderHook(() => useBookingLifecycle(booking, () => {}), { wrapper });
    act(() => result.current.cancelBooking());
    expect(cancelMutate).not.toHaveBeenCalled();
  });
});
