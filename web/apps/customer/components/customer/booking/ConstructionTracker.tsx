"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice, formatDate } from "@/lib/format";
import { STATUS_LABELS, STATUS_MESSAGES, normalizeBookingStatus } from "@/lib/constants";

type Props = {
  booking: any;
  onRefresh: () => void;
};

export function ConstructionTracker({ booking, onRefresh }: Props) {
  const [otp, setOtp] = useState<string[]>(["", "", "", ""]);
  const [otpVerified, setOtpVerified] = useState(false);
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.rating != null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  
  // Parse details from archetypeDetails JSON string
  type WorkerLine = { label: string; count: number; icon?: string };
  let workers: WorkerLine[] = [
    { label: "Masons", count: 2, icon: "🧱" },
    { label: "Helpers", count: 4, icon: "👷" },
    { label: "Bar Benders", count: 2, icon: "🦾" },
    { label: "Shuttering Carpenters", count: 1, icon: "🪵" },
  ];
  let bookingType: "individual" | "team" = "team";
  let selectedQuoteName = "Raju Construction";
  let duration = 2;

  try {
    const details = JSON.parse(booking.archetypeDetails);
    if (details.bookingType) bookingType = details.bookingType;
    if (Array.isArray(details.workers) && details.workers.length) {
      workers = details.workers.map((w: any) => ({ label: w.label, count: w.count, icon: w.icon }));
    } else if (details.crew) {
      workers = [
        { label: "Masons", count: details.crew.masons ?? 0, icon: "🧱" },
        { label: "Helpers", count: details.crew.helpers ?? 0, icon: "👷" },
        { label: "Bar Benders", count: details.crew.barBenders ?? 0, icon: "🦾" },
        { label: "Shuttering Carpenters", count: details.crew.shutteringCarpenters ?? 0, icon: "🪵" },
      ].filter((w) => w.count > 0);
    }
    if (details.selectedTeam?.name) selectedQuoteName = details.selectedTeam.name;
    else if (details.selectedQuote?.name) selectedQuoteName = details.selectedQuote.name;
    if (details.durationDays) duration = details.durationDays;
  } catch {}

  const isCompleted = status === "COMPLETED";

  async function updateStatus(nextStatus: string) {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.bookingRef}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setLoading(false);
    if (res.ok) {
      onRefresh();
    }
  }

  // Simulated status progression
  async function simulateNextStatus() {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.bookingRef}/status`);
    const data = await res.json();
    if (data.nextStatus) {
      await updateStatus(data.nextStatus);
    }
    setLoading(false);
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

  async function submitFeedback() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/bookings/${booking.bookingRef}/review`, {
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
    setReviewSubmitted(true);
    onRefresh();
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
          <>
            {/* Status Card */}
            <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="flex-between">
                <div>
                  <p style={{ fontSize: "0.75rem", color: "#71717a", margin: 0 }}>Reference Code</p>
                  <p style={{ fontWeight: 800, margin: 0, fontSize: "1.05rem" }}>{booking.bookingRef}</p>
                </div>
                <Badge status={status}>{STATUS_LABELS[status] ?? status}</Badge>
              </div>
              <p className="alert alert-info" style={{ margin: "0.5rem 0", fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}>
                {STATUS_MESSAGES[status]}
              </p>
              
              <Button size="sm" variant="secondary" onClick={simulateNextStatus} loading={loading} style={{ alignSelf: "flex-start", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: "8px" }}>
                Simulate Next Step →
              </Button>
            </div>

            {/* Map and ETA */}
            <div className="vsh-card" style={{ padding: 0, height: "200px", position: "relative", overflow: "hidden", borderRadius: "16px" }}>
              <div className="mock-map-bg" style={{ width: "100%", height: "100%", background: "#f4f4f5", backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)", backgroundSize: "12px 12px", position: "absolute" }} />
              <svg style={{ position: "absolute", width: "100%", height: "100%" }}>
                <path d="M 120 180 Q 180 70 240 100 T 320 140" fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 3" />
                <circle cx="120" cy="180" r="8" fill="var(--color-brand)" />
                <circle cx="240" cy="100" r="7" fill="red" />
              </svg>
              <div style={{ position: "absolute", bottom: "0.75rem", left: "0.75rem", right: "0.75rem", background: "white", padding: "0.75rem", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                <div>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: "0.85rem" }}>{selectedQuoteName}</p>
                  <p style={{ fontSize: "0.7rem", color: "#666", margin: 0 }}>Crew is arriving on site</p>
                </div>
                <span style={{ fontWeight: 800, color: "var(--color-brand)", fontSize: "1rem" }}>20 mins</span>
              </div>
            </div>

            {/* Crew Details */}
            <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
                {bookingType === "individual" ? "Worker" : "Crew Requirements"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.625rem", background: "#fdfbfe", padding: "0.75rem", borderRadius: "10px", fontSize: "0.75rem", border: "1px solid #f1f0f5" }}>
                {workers.map((w, i) => (
                  <span key={i}>{w.icon ?? "🛠️"} {w.label}{bookingType === "team" ? `: ${w.count}` : ""}</span>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", fontSize: "0.825rem", marginTop: "0.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#71717a" }}>Start Date</span>
                  <span>{formatDate(booking.slot)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#71717a" }}>Duration</span>
                  <span>{duration} Days</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #f1f0f5", paddingTop: "0.5rem" }}>
                  <span style={{ color: "#71717a" }}>Total Amount</span>
                  <span style={{ fontWeight: 700, color: "var(--color-brand)" }}>{formatPrice(booking.finalAmountPaise)}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Completed slip with OTP code verification */
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
                  <img src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=300" alt="before" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", bottom: "4px", left: "4px", background: "rgba(0,0,0,0.6)", color: "white", padding: "1px 4px", fontSize: "0.6rem", borderRadius: "3px" }}>Before</span>
                </div>
                <div style={{ flex: 1, position: "relative", height: "80px", borderRadius: "8px", overflow: "hidden" }}>
                  <img src="https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=300" alt="after" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", bottom: "4px", left: "4px", background: "rgba(0,0,0,0.6)", color: "white", padding: "1px 4px", fontSize: "0.6rem", borderRadius: "3px" }}>After</span>
                </div>
              </div>
            </div>

            {!otpVerified ? (
              <div style={{ background: "#fdf4ff", border: "1px solid #f5d0fe", padding: "1rem", borderRadius: "12px", textAlign: "center" }}>
                <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#6d28d9", margin: "0 0 0.25rem 0" }}>Enter Verification OTP</p>
                <p style={{ fontSize: "0.75rem", color: "#666", margin: "0 0 0.75rem 0" }}>Enter the completion code sent to your phone</p>
                
                <div style={{ display: "flex", gap: "0.375rem", justifyContent: "center" }}>
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-input-${idx}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      style={{ width: "38px", height: "38px", textAlign: "center", fontSize: "1.1rem", fontWeight: 800, border: "1.5px solid #d4d4d8", borderRadius: "8px", background: "white" }}
                    />
                  ))}
                </div>
                {error && <p style={{ color: "red", fontSize: "0.75rem", margin: "0.375rem 0 0 0" }}>{error}</p>}
                <p style={{ fontSize: "0.7rem", color: "#888", margin: "0.5rem 0 0 0" }}>Hint: Use code 2 8 4 7</p>
              </div>
            ) : (
              <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="alert alert-success" style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  ✓ Completion verified successfully!
                </div>

                {!reviewSubmitted ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#3f3f46", textAlign: "center", margin: 0 }}>Rate the Contractor Team</p>
                    <div style={{ display: "flex", justifyContent: "center", gap: "0.375rem" }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          style={{ background: "none", border: "none", fontSize: "1.75rem", color: n <= rating ? "#ca8a04" : "#d4d4d8", cursor: "pointer" }}
                          onClick={() => setRating(n)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <Textarea
                      placeholder="Write a review (optional)..."
                      value={review}
                      onChange={(e: any) => setReview(e.target.value)}
                    />
                    {error && <p style={{ color: "red", fontSize: "0.75rem", margin: 0 }}>{error}</p>}
                    <Button onClick={submitFeedback} loading={loading} block style={{ borderRadius: "12px", height: "42px" }}>
                      Submit Feedback
                    </Button>
                  </div>
                ) : (
                  <div className="alert alert-success" style={{ fontSize: "0.8rem" }}>
                    Thanks for your rating and feedback!
                  </div>
                )}
              </div>
            )}

            <div className="vsh-receipt-perforated" />

            <div style={{ display: "flex", justifyContent: "space-between", margin: "1rem 0 0.5rem 0", fontSize: "0.85rem" }}>
              <span style={{ color: "#71717a" }}>Total Paid</span>
              <span style={{ fontWeight: 800, color: "var(--color-brand)" }}>{formatPrice(booking.finalAmountPaise)}</span>
            </div>
          </div>
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
