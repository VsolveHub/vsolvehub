"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { normalizeBookingStatus } from "@/lib/constants";
import {
  useSimulateBookingStatusMutation,
  useSetBookingStatusMutation,
  useReviewBookingMutation,
} from "@/lib/query/hooks";
import type { Booking } from "@/lib/booking/types";
import { parseConstructionDetails } from "./construction/parseDetails";
import { ActiveJobPanel } from "./construction/ActiveJobPanel";
import { CompletedJobPanel } from "./construction/CompletedJobPanel";

type Props = {
  booking: Booking;
  onRefresh: () => void;
};

export function ConstructionTracker({ booking, onRefresh }: Props) {
  const [otp, setOtp] = useState<string[]>(["", "", "", ""]);
  const [otpVerified, setOtpVerified] = useState(false);
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.rating != null);

  const simulateStatusMutation = useSimulateBookingStatusMutation(booking.bookingRef);
  const setStatusMutation = useSetBookingStatusMutation(booking.bookingRef);
  const reviewMutation = useReviewBookingMutation(booking.bookingRef);

  const loading = simulateStatusMutation.isPending || setStatusMutation.isPending || reviewMutation.isPending;
  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  const details = parseConstructionDetails(booking.archetypeDetails);
  const isCompleted = status === "COMPLETED";

  function updateStatus(nextStatus: string) {
    setStatusMutation.mutate(nextStatus, { onSuccess: () => onRefresh() });
  }

  function simulateNextStatus() {
    simulateStatusMutation.mutate(undefined, { onSuccess: () => onRefresh() });
  }

  // Handle OTP digit changes
  function handleOtpChange(index: number, val: string) {
    const cleaned = val.replace(/\D/g, "");
    if (!cleaned) return;

    const copy = [...otp];
    copy[index] = cleaned.slice(-1);
    setOtp(copy);

    // Auto-focus next input
    if (index < 3) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-verify if full
    const fullCode = copy.join("");
    if (fullCode.length === 4) {
      if (fullCode === "2847") {
        setOtpVerified(true);
        setError("");
      } else {
        setError("Invalid OTP. Hint: Use 2 8 4 7");
      }
    }
  }

  function submitFeedback() {
    setError("");
    reviewMutation.mutate({ rating, review }, {
      onSuccess: () => {
        setReviewSubmitted(true);
        onRefresh();
      },
      onError: (err: any) => {
        setError(err.message || "Could not submit review");
      },
    });
  }

  // Resolve step badge and title (matches the 10-screen booking diagram)
  const badge = isCompleted ? 10 : 9;
  const title = isCompleted ? "Work Completed" : "Live Tracking";

  return (
    <div className="vsh-simulator-frame">
      {/* Status Bar */}
      <div className="vsh-status-bar">
        <span>9:41</span>
        <div className="vsh-status-bar-icons">
          <span>📶</span>
          <span>📶</span>
          <span>🔋 100%</span>
        </div>
      </div>

      {/* Navbar Header */}
      <div className="vsh-navbar">
        <Link href="/" className="vsh-nav-back" style={{ textDecoration: "none" }}>
          ←
        </Link>
        <span className="vsh-nav-title">Construction Tracker</span>
      </div>

      {/* Circle Step Header */}
      <div className="vsh-step-header">
        <span className="vsh-step-badge">{badge}</span>
        <span className="vsh-step-title">{title}</span>
      </div>

      {/* Scrollable Simulator Content */}
      <div className="vsh-content">
        {!isCompleted ? (
          <ActiveJobPanel booking={booking} status={status} loading={loading} onSimulateNext={simulateNextStatus} details={details} />
        ) : (
          <CompletedJobPanel
            booking={booking}
            otp={otp}
            otpVerified={otpVerified}
            error={error}
            onOtpChange={handleOtpChange}
            reviewSubmitted={reviewSubmitted}
            rating={rating}
            setRating={setRating}
            review={review}
            setReview={setReview}
            loading={loading}
            onSubmitFeedback={submitFeedback}
          />
        )}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="vsh-footer-actions">
        {!isCompleted ? (
          <>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, borderRadius: "12px" }}>Call Team</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, borderRadius: "12px" }}>Chat</button>
            <Button variant="secondary" style={{ flex: 1, borderRadius: "12px" }} onClick={() => updateStatus("CANCELLED")} loading={loading}>Cancel</Button>
          </>
        ) : (
          <Link href="/" className="btn btn-primary" style={{ flex: 1, height: "44px", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", borderRadius: "12px" }}>
            Back to Dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
