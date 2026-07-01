"use client";

import { useEffect, useState } from "react";
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

export function BeauticianTracker({ booking, onRefresh }: Props) {
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [tip, setTip] = useState<number>(0);
  const [step, setStep] = useState<"track" | "completed" | "invoice">(booking.status === "COMPLETED" ? "completed" : "track");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  const professional = booking.provider ?? booking.vendor;
  const partnerName = professional?.name ?? "Assigned Partner";

  // Status is driven by the partner (in the partner app). The customer tracker
  // only reflects the real status it polls — it never advances the booking.
  useEffect(() => {
    if (booking.status === "COMPLETED" && step === "track") {
      setStep("completed");
    }
  }, [booking.status, step]);

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
    setStep("invoice");
  }

  // Resolve step badge and title
  function getStepInfo(): { badge: number; title: string } {
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

  const { badge, title } = getStepInfo();

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
        {step === "track" && (
          <>
            {/* Tracking Status Card */}
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
              
            </div>

            {/* Map View */}
            {["PENDING", "SEARCHING_PROVIDER", "ASSIGNED", "ON_THE_WAY"].includes(status) && (
              <div className="vsh-card" style={{ padding: 0, height: "200px", position: "relative", overflow: "hidden", borderRadius: "16px" }}>
                <div className="mock-map-bg" style={{ width: "100%", height: "100%", background: "#fdf4ff", backgroundImage: "radial-gradient(#d8b4fe 1px, transparent 1px)", backgroundSize: "12px 12px", position: "absolute" }} />
                <svg style={{ position: "absolute", width: "100%", height: "100%" }}>
                  <path d="M 60 40 Q 140 180 200 120 T 320 180" fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 3" />
                  <circle cx="60" cy="40" r="7" fill="red" />
                  <circle cx="320" cy="180" r="8" fill="var(--color-brand)" />
                </svg>
                <div style={{ position: "absolute", bottom: "0.75rem", left: "0.75rem", right: "0.75rem", background: "white", padding: "0.75rem", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: "0.85rem" }}>{partnerName}</p>
                    <p style={{ fontSize: "0.7rem", color: "#666", margin: 0 }}>Beautician is arriving</p>
                  </div>
                  <span style={{ fontWeight: 800, color: "var(--color-brand)", fontSize: "1rem" }}>12 mins</span>
                </div>
              </div>
            )}

            {/* Beautician Arrived State Card */}
            {status === "PROVIDER_ARRIVING" && (
              <div className="vsh-card stack text-center" style={{ padding: "1.5rem 1.25rem", border: "2px solid var(--color-brand)", borderRadius: "18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", overflow: "hidden", border: "2px solid var(--color-brand)" }}>
                  <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100" alt={partnerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <h4 style={{ fontWeight: 700, marginTop: "0.75rem", marginBottom: "0.125rem", fontSize: "0.95rem" }}>{partnerName}</h4>
                <p style={{ color: "#059669", fontWeight: 700, fontSize: "0.8rem", margin: "0 0 0.5rem 0" }}>Beautician Arrived!</p>
                <p style={{ color: "#555", fontSize: "0.75rem", margin: "0 0 1rem 0", lineHeight: 1.4 }}>
                  Your beautician has arrived. Share the start code below to begin the session.
                </p>
                <div style={{ background: "#faf5ff", border: "1px dashed var(--color-brand)", borderRadius: "12px", padding: "0.75rem 1rem", width: "100%" }}>
                  <p style={{ fontSize: "0.7rem", color: "#71717a", margin: 0 }}>Start code</p>
                  <p style={{ fontWeight: 800, fontSize: "1.6rem", letterSpacing: "0.3rem", margin: 0, color: "var(--color-brand)" }}>
                    {booking.startOtp ?? "----"}
                  </p>
                </div>
              </div>
            )}

            {/* Service In Progress State Card */}
            {status === "STARTED" && (
              <div className="vsh-card stack text-center" style={{ padding: "2rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="facial-pulse-animation" style={{ display: "inline-block", position: "relative", marginBottom: "1rem", width: "18px", height: "18px" }}>
                  <div style={{ width: "18px", height: "18px", background: "var(--color-brand)", borderRadius: "50%", transform: "scale(1.5)", opacity: 0.2, position: "absolute", animation: "ping 1.5s infinite" }} />
                  <div style={{ width: "18px", height: "18px", background: "var(--color-brand)", borderRadius: "50%", position: "relative" }} />
                </div>
                <h4 style={{ fontWeight: 800, margin: 0, fontSize: "1rem" }}>Service in progress</h4>
                <p style={{ color: "#666", fontSize: "0.75rem", marginTop: "0.375rem", marginBottom: "1rem", lineHeight: 1.4 }}>
                  Your facial service session is currently active. Your beautician will mark it complete when finished.
                </p>
                <style jsx>{`
                  @keyframes ping {
                    75%, 100% { transform: scale(2.5); opacity: 0; }
                  }
                `}</style>
              </div>
            )}

            {/* Standard Details */}
            <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.825rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Service</span>
                <span style={{ fontWeight: 600 }}>{booking.service.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Schedule</span>
                <span>{formatDate(booking.slot)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Address</span>
                <span style={{ maxWidth: "12rem", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{booking.address}</span>
              </div>
            </div>
          </>
        )}

        {step === "completed" && (
          <div className="vsh-card stack text-center" style={{ padding: "1.5rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "2.5rem" }}>🌸</span>
            <h3 style={{ fontWeight: 800, marginTop: "0.5rem", marginBottom: "0.25rem", fontSize: "1.15rem" }}>Service Completed!</h3>
            <p style={{ color: "#666", fontSize: "0.75rem", marginBottom: "1.25rem" }}>
              How was your facial session with {partnerName}?
            </p>

            <div style={{ textAlign: "left", width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Rating */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "0.375rem" }}>
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
              </div>

              {/* Tip */}
              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "0.875rem" }}>
                <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#3f3f46", margin: "0 0 0.5rem 0", textAlign: "center" }}>Add tip for {partnerName}</p>
                <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
                  {[30, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`btn ${tip === val ? "btn-primary" : "btn-secondary"}`}
                      style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem", borderRadius: "8px" }}
                      onClick={() => setTip(tip === val ? 0 : val)}
                    >
                      + ₹{val}
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                placeholder="Write a review (optional)..."
                value={review}
                onChange={(e: any) => setReview(e.target.value)}
              />
              {error && <p style={{ color: "red", fontSize: "0.75rem", margin: 0 }}>{error}</p>}
              <Button onClick={submitFeedback} loading={loading} block style={{ borderRadius: "12px", height: "42px" }}>
                Submit & View Invoice
              </Button>
            </div>
          </div>
        )}

        {step === "invoice" && (
          <div className="vsh-receipt-notch-container" style={{ padding: "1.5rem" }}>
            <div className="vsh-receipt-notch-left" />
            <div className="vsh-receipt-notch-right" />
            
            <div className="text-center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "2rem" }}>🧾</span>
              <h3 style={{ fontWeight: 800, margin: "0.5rem 0 0 0", fontSize: "1.1rem" }}>Invoice</h3>
              <p style={{ color: "#71717a", fontSize: "0.75rem", margin: 0 }}>Reference: {booking.bookingRef}</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.85rem", marginTop: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Service</span>
                <span style={{ fontWeight: 600 }}>{booking.service.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Date</span>
                <span>{formatDate(booking.slot)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Beautician</span>
                <span>{partnerName}</span>
              </div>
              
              <div className="vsh-receipt-perforated" />
              
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Service Charge</span>
                <span>{formatPrice(booking.finalAmountPaise)}</span>
              </div>
              {tip > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#71717a" }}>Tip Added</span>
                  <span>₹{tip}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.05rem", borderTop: "1px solid #e4e4e7", paddingTop: "0.625rem", color: "var(--color-brand)" }}>
                <span>Paid Amount</span>
                <span>{formatPrice(booking.finalAmountPaise + tip * 100)}</span>
              </div>
            </div>

            {/* Refer & Earn Banner */}
            <div style={{ background: "linear-gradient(to right, #fdf4ff, #fae8ff)", border: "1px solid #f5d0fe", borderRadius: "12px", display: "flex", gap: "0.75rem", alignItems: "center", padding: "0.75rem", marginTop: "1.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>🎁</span>
              <div>
                <p style={{ fontWeight: 700, margin: 0, fontSize: "0.75rem" }}>Refer & Earn</p>
                <p style={{ fontSize: "0.65rem", color: "#666", margin: 0 }}>Get ₹100 for each friend who signs up!</p>
              </div>
            </div>
          </div>
        )}
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
