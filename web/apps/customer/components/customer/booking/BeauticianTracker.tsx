"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { normalizeBookingStatus } from "@/lib/constants";
import { useReviewBookingMutation } from "@/lib/query/hooks";
import type { Booking } from "@/lib/booking/types";
import { TrackStep } from "./beautician/TrackStep";
import { CompletedStep } from "./beautician/CompletedStep";
import { InvoiceStep } from "./beautician/InvoiceStep";

type Props = {
  booking: Booking;
  onRefresh: () => void;
};

function getStepInfo(step: "track" | "completed" | "invoice", status: string): { badge: number; title: string } {
  if (step === "invoice") {
    return { badge: 14, title: "Invoice & Review" };
  }
  if (step === "completed") {
    return { badge: 13, title: "Service Completed" };
  }
  if (status === "PROVIDER_ARRIVING") {
    return { badge: 12, title: "Beautician Arrived" };
  }
  if (status === "STARTED") {
    return { badge: 13, title: "Service In Progress" };
  }
  return { badge: 11, title: "Live Tracking" };
}

export function BeauticianTracker({ booking, onRefresh }: Props) {
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [tip, setTip] = useState<number>(0);
  const [step, setStep] = useState<"track" | "completed" | "invoice">(booking.status === "COMPLETED" ? "completed" : "track");

  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  const professional = booking.provider ?? booking.vendor;
  const partnerName = professional?.name ?? "Assigned Partner";

  const reviewMutation = useReviewBookingMutation(booking.bookingRef);

  // Status is driven by the partner (in the partner app). The customer tracker
  // only reflects the real status it polls — it never advances the booking.
  useEffect(() => {
    if (booking.status === "COMPLETED" && step === "track") {
      setStep("completed");
    }
  }, [booking.status, step]);

  function submitFeedback() {
    setError("");
    reviewMutation.mutate(
      { rating, review },
      {
        onSuccess: () => {
          onRefresh();
          setStep("invoice");
        },
        onError: (err: any) => setError(err?.message || "Could not submit review"),
      },
    );
  }

  const { badge, title } = getStepInfo(step, status);

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
        <span className="vsh-nav-title">Booking Details</span>
      </div>

      {/* Circle Step Header */}
      <div className="vsh-step-header">
        <span className="vsh-step-badge">{badge}</span>
        <span className="vsh-step-title">{title}</span>
      </div>

      {/* Scrollable Simulator Content */}
      <div className="vsh-content">
        {step === "track" && <TrackStep booking={booking} status={status} partnerName={partnerName} />}

        {step === "completed" && (
          <CompletedStep
            partnerName={partnerName}
            rating={rating}
            setRating={setRating}
            tip={tip}
            setTip={setTip}
            review={review}
            setReview={setReview}
            error={error}
            loading={reviewMutation.isPending}
            onSubmit={submitFeedback}
          />
        )}

        {step === "invoice" && <InvoiceStep booking={booking} partnerName={partnerName} tip={tip} />}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="vsh-footer-actions">
        {step === "track" && ["PENDING", "SEARCHING_PROVIDER", "ASSIGNED", "ON_THE_WAY", "PROVIDER_ARRIVING"].includes(status) ? (
          <>
            <a href={`tel:${professional?.phone ?? "9876543210"}`} className="btn btn-secondary" style={{ flex: 1, height: "44px", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", borderRadius: "12px" }}>Call</a>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, borderRadius: "12px" }}>Chat</button>
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
