"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice, formatDate } from "@/lib/format";
import { useReviewBookingMutation } from "@/lib/query/hooks";

type Props = {
  bookingRef: string;
  serviceName: string;
  serviceId: string;
  finalAmountPaise: number;
  slot: string;
  vendorName: string | null;
  existingRating: number | null;
};

export function BookingCompletion({
  bookingRef,
  serviceName,
  serviceId,
  finalAmountPaise,
  slot,
  vendorName,
  existingRating,
}: Props) {
  const [rating, setRating] = useState(existingRating ?? 5);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(existingRating != null);
  const [error, setError] = useState("");
  const reviewMutation = useReviewBookingMutation(bookingRef);
  const loading = reviewMutation.isPending;

  function submitReview() {
    setError("");
    reviewMutation.mutate({ rating, review }, {
      onSuccess: () => {
        setSubmitted(true);
      },
      onError: (err: any) => {
        setError(err.message || "Could not submit review");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p style={{ fontSize: "2.5rem", margin: 0 }}>✓</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Service completed</h1>
        <p className="mt-1 mb-5 text-[15px] text-gray-500">Thank you for using V Solve Hub.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Invoice</h2>
        <p className="text-sm text-gray-500">Booking ref</p>
        <p className="mb-1 text-[15px] font-semibold text-gray-900">{bookingRef}</p>
        <p className="text-sm text-gray-500">Service</p>
        <p>{serviceName}</p>
        {vendorName && (
          <>
            <p className="text-sm text-gray-500">Professional</p>
            <p>{vendorName}</p>
          </>
        )}
        <p className="text-sm text-gray-500">Date</p>
        <p>{formatDate(slot)}</p>
        <p className="text-sm text-gray-500">Final amount</p>
        <p className="text-lg font-black text-gray-900">{formatPrice(finalAmountPaise)}</p>
      </div>

      {!submitted ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Rate your experience</h2>
          <div className="booking-rating-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`booking-rating-star ${n <= rating ? "active" : ""}`}
                onClick={() => setRating(n)}
              >
                ★
              </button>
            ))}
          </div>
          <Textarea
            label="Review (optional)"
            placeholder="Share feedback about the professional…"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          {error && <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{error}</div>}
          <Button onClick={submitReview} loading={loading} disabled={loading} block>
            Submit review
          </Button>
        </div>
      ) : (
        <div className="rounded-xl px-4 py-3 text-sm bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]">Thanks for your feedback!</div>
      )}

      <Link href={`/booking?serviceId=${serviceId}`} className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm bg-[var(--color-brand)] text-white hover:bg-blue-900 w-full" style={{ textAlign: "center" }}>
        Rebook this service
      </Link>
      <Link href="/" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 w-full" style={{ textAlign: "center" }}>
        Back to home
      </Link>
    </div>
  );
}
