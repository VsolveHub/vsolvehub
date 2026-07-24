import Image from "next/image";
import { formatPrice } from "@/lib/format";
import type { Booking } from "@/lib/booking/types";
import { OtpEntry } from "./OtpEntry";
import { ContractorReviewPanel } from "./ContractorReviewPanel";

type Props = {
  booking: Booking;
  otp: string[];
  otpVerified: boolean;
  error: string;
  onOtpChange: (index: number, val: string) => void;
  reviewSubmitted: boolean;
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  loading: boolean;
  onSubmitFeedback: () => void;
};

export function CompletedJobPanel({
  booking,
  otp,
  otpVerified,
  error,
  onOtpChange,
  reviewSubmitted,
  rating,
  setRating,
  review,
  setReview,
  loading,
  onSubmitFeedback,
}: Props) {
  return (
    <div className="vsh-receipt-notch-container" style={{ padding: "1.5rem" }}>
      <div className="vsh-receipt-notch-left" />
      <div className="vsh-receipt-notch-right" />

      <div className="text-center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: "2.5rem" }}>🏗️</span>
        <h3 style={{ fontWeight: 800, margin: "0.5rem 0 0 0", fontSize: "1.15rem" }}>Work Completed!</h3>
        <p style={{ color: "#71717a", fontSize: "0.75rem", margin: "0.125rem 0 1rem 0" }}>Reference: {booking.bookingRef}</p>
      </div>

      {/* Before/After Photos */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#3f3f46", margin: "0 0 0.5rem 0" }}>Work Progress Photos</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <div style={{ flex: 1, position: "relative", height: "80px", borderRadius: "8px", overflow: "hidden" }}>
            <Image src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=300" alt="before" fill style={{ objectFit: "cover" }} />
            <span style={{ position: "absolute", bottom: "4px", left: "4px", background: "rgba(0,0,0,0.6)", color: "white", padding: "1px 4px", fontSize: "0.6rem", borderRadius: "3px" }}>Before</span>
          </div>
          <div style={{ flex: 1, position: "relative", height: "80px", borderRadius: "8px", overflow: "hidden" }}>
            <Image src="https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=300" alt="after" fill style={{ objectFit: "cover" }} />
            <span style={{ position: "absolute", bottom: "4px", left: "4px", background: "rgba(0,0,0,0.6)", color: "white", padding: "1px 4px", fontSize: "0.6rem", borderRadius: "3px" }}>After</span>
          </div>
        </div>
      </div>

      {!otpVerified ? (
        <OtpEntry otp={otp} error={error} onOtpChange={onOtpChange} />
      ) : (
        <div className="flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="rounded-xl px-4 py-3 text-sm bg-green-50 text-green-700" style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
            ✓ Completion verified successfully!
          </div>

          <ContractorReviewPanel
            reviewSubmitted={reviewSubmitted}
            rating={rating}
            setRating={setRating}
            review={review}
            setReview={setReview}
            error={error}
            loading={loading}
            onSubmit={onSubmitFeedback}
          />
        </div>
      )}

      <div className="vsh-receipt-perforated" />

      <div style={{ display: "flex", justifyContent: "space-between", margin: "1rem 0 0.5rem 0", fontSize: "0.85rem" }}>
        <span style={{ color: "#71717a" }}>Total Paid</span>
        <span style={{ fontWeight: 800, color: "var(--color-brand)" }}>{formatPrice(booking.finalAmountPaise)}</span>
      </div>
    </div>
  );
}
