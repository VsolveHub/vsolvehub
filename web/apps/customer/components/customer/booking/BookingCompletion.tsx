"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice, formatDate } from "@/lib/format";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitReview() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/bookings/${bookingRef}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, review }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Could not submit review");
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="stack-lg">
      <div className="text-center">
        <p style={{ fontSize: "2.5rem", margin: 0 }}>✓</p>
        <h1 className="page-title">Service completed</h1>
        <p className="page-subtitle">Thank you for using V Solve Hub.</p>
      </div>

      <div className="card stack">
        <h2 className="section-title">Invoice</h2>
        <p className="text-sm text-muted">Booking ref</p>
        <p className="card-title">{bookingRef}</p>
        <p className="text-sm text-muted">Service</p>
        <p>{serviceName}</p>
        {vendorName && (
          <>
            <p className="text-sm text-muted">Professional</p>
            <p>{vendorName}</p>
          </>
        )}
        <p className="text-sm text-muted">Date</p>
        <p>{formatDate(slot)}</p>
        <p className="text-sm text-muted">Final amount</p>
        <p className="detail-price">{formatPrice(finalAmountPaise)}</p>
      </div>

      {!submitted ? (
        <div className="card stack">
          <h2 className="section-title">Rate your experience</h2>
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
          {error && <div className="alert alert-error">{error}</div>}
          <Button onClick={submitReview} loading={loading} disabled={loading} block>
            Submit review
          </Button>
        </div>
      ) : (
        <div className="alert alert-info">Thanks for your feedback!</div>
      )}

      <Link href={`/booking?serviceId=${serviceId}`} className="btn btn-primary btn-block" style={{ textAlign: "center" }}>
        Rebook this service
      </Link>
      <Link href="/" className="btn btn-secondary btn-block" style={{ textAlign: "center" }}>
        Back to home
      </Link>
    </div>
  );
}
