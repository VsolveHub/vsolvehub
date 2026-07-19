import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  useCancelBookingMutation,
  useReviseBookingMutation,
  useReviewBookingMutation,
} from "@/lib/query/hooks";
import { deriveBookingView } from "./booking-view";
import type { Booking } from "./types";

export function useBookingLifecycle(booking: Booking, onRefresh: () => void) {
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.rating != null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [error, setError] = useState("");

  const cancelMutation = useCancelBookingMutation(booking.bookingRef);
  const reviseMutation = useReviseBookingMutation(booking.bookingRef);
  const reviewMutation = useReviewBookingMutation(booking.bookingRef);
  const loading = cancelMutation.isPending || reviseMutation.isPending || reviewMutation.isPending;

  const view = useMemo(() => deriveBookingView(booking), [booking]);

  function cancelBooking() {
    const fee = booking.cancelFeePaise ?? 0;
    const msg =
      fee > 0
        ? `The professional is already on the way, so a ${formatPrice(fee)} visit fee applies. Cancel anyway?`
        : "Cancel this booking? No fee applies.";
    if (!window.confirm(msg)) return;
    cancelMutation.mutate(undefined, { onSuccess: () => onRefresh() });
  }

  function reviseAction(action: "approve" | "decline") {
    reviseMutation.mutate(action, { onSuccess: () => onRefresh() });
  }

  function submitReview() {
    setError("");
    reviewMutation.mutate(
      { rating, review },
      {
        onSuccess: () => {
          setReviewSubmitted(true);
          onRefresh();
        },
        onError: (err: any) => setError(err?.message || "Could not submit review"),
      },
    );
  }

  return {
    view,
    rating,
    setRating,
    review,
    setReview,
    reviewSubmitted,
    photos,
    setPhotos,
    showDetailsModal,
    setShowDetailsModal,
    error,
    loading,
    cancelBooking,
    reviseAction,
    submitReview,
  };
}
