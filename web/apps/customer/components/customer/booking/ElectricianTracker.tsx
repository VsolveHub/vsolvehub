"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice, formatDate } from "@/lib/format";
import { STATUS_LABELS, STATUS_MESSAGES, normalizeBookingStatus, MARKETPLACE_TIMELINE } from "@/lib/constants";
import {
  useCancelBookingMutation,
  useReviseBookingMutation,
  useReviewBookingMutation,
} from "@/lib/query/hooks";

type Props = {
  booking: any;
  onRefresh: () => void;
};

export function ElectricianTracker({ booking, onRefresh }: Props) {
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.rating != null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const cancelMutation = useCancelBookingMutation(booking.bookingRef);
  const reviseMutation = useReviseBookingMutation(booking.bookingRef);
  const reviewMutation = useReviewBookingMutation(booking.bookingRef);

  const loading = cancelMutation.isPending || reviseMutation.isPending || reviewMutation.isPending;
  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  const professional = booking.provider ?? booking.vendor;
  const isCompleted = status === "COMPLETED";

  const details = booking.archetypeDetails ? JSON.parse(booking.archetypeDetails) : {};
  const isTeam = details.bookingType === "team";

  function cancelBooking() {
    const fee = booking.cancelFeePaise ?? 0;
    const msg =
      fee > 0
        ? `The professional is already on the way, so a ${formatPrice(fee)} visit fee applies. Cancel anyway?`
        : "Cancel this booking? No fee applies.";
    if (!window.confirm(msg)) return;
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        onRefresh();
      },
    });
  }

  function reviseAction(action: "approve" | "decline") {
    reviseMutation.mutate(action, {
      onSuccess: () => {
        onRefresh();
      },
    });
  }

  // Timeline indices to draw completed/active/upcoming states
  const currentStatusIndex = MARKETPLACE_TIMELINE.indexOf(status as any);

  function submitReview() {
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

  function getTimelineStepDetails(stepKey: string, idx: number) {
    const isCompletedStep = idx < currentStatusIndex;
    const isActiveStep = idx === currentStatusIndex;
    const isUpcomingStep = idx > currentStatusIndex;

    const formattedTime = booking.createdAt
      ? new Date(booking.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "10:15 AM";

    switch (stepKey) {
      case "PENDING":
        return {
          label: "Booking Confirmed",
          sublabel: isCompletedStep || isActiveStep ? `Today, ${formattedTime}` : null,
        };
      case "SEARCHING_PROVIDER":
        return {
          label: "Searching for provider",
          sublabel: isActiveStep ? "Finding nearest technician..." : isCompletedStep ? "Search completed" : "Pending acceptance",
        };
      case "ASSIGNED":
        return {
          label: "Provider Accepted",
          sublabel: isCompletedStep || isActiveStep ? `Today, ${formattedTime}` : "Pending acceptance",
        };
      case "PROVIDER_ARRIVING":
        return {
          label: "On the way",
          sublabel: isActiveStep ? "ETA: 12 mins away" : isCompletedStep ? "Arrived at location" : "Pending arrival",
        };
      case "STARTED":
        return {
          label: "Work in progress",
          sublabel: isActiveStep ? "Technician has started work" : null,
        };
      case "COMPLETED":
        return {
          label: "Completed",
          sublabel: isActiveStep || isCompletedStep ? "Job finished successfully" : null,
        };
      default:
        return {
          label: stepKey.replace(/_/g, " "),
          sublabel: null,
        };
    }
  }

  function getTeamTimelineStepDetails(stepKey: string, idx: number) {
    const isCompletedStep = idx < currentStatusIndex;
    const isActiveStep = idx === currentStatusIndex;
    const isUpcomingStep = idx > currentStatusIndex;

    switch (stepKey) {
      case "PENDING":
        return {
          label: "Service Confirmed",
          sublabel: isCompletedStep || isActiveStep ? "10:00 AM" : null,
        };
      case "SEARCHING_PROVIDER":
        return null; // Skip in team list
      case "ASSIGNED":
        return {
          label: "Accepted by Vendor",
          sublabel: isCompletedStep || isActiveStep ? "10:15 AM" : "Pending",
        };
      case "PROVIDER_ARRIVING":
        return {
          label: "On Way",
          sublabel: isActiveStep ? "Arriving in 20 mins" : isCompletedStep ? "Arrived" : "Pending",
        };
      case "STARTED":
        return {
          label: "Work in Progress",
          sublabel: isActiveStep ? "In Progress" : "Pending",
        };
      case "COMPLETED":
        return {
          label: "Completed",
          sublabel: isActiveStep || isCompletedStep ? "Completed" : "Pending",
        };
      default:
        return null;
    }
  }

  function getRatingLabel(val: number) {
    if (val === 5) return "Excellent";
    if (val === 4) return "Good";
    if (val === 3) return "Average";
    if (val === 2) return "Poor";
    return "Very Bad";
  }

  // Render Team-specific tracking layouts
  if (isTeam) {
    const badge = isCompleted ? 12 : 11;
    const title = isCompleted ? "Confirm Completion" : "Live Tracking";
    const teamName = professional?.name || "Raju Electricals";
    const crewTotal = formatPrice(booking.finalAmountPaise ?? booking.quotedAmount);

    return (
      <div className="flow-page-shell">
        <div className="flow-page-shell__inner flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-purple-900 text-white shadow-sm select-none">
          <Link href="/" className="text-xl leading-none text-purple-200 hover:text-white cursor-pointer no-underline">
            ←
          </Link>
          <span className="font-semibold text-sm truncate">Electrician — Team</span>
        </div>

        {/* Numbered Step Progress Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-purple-50 border-b border-purple-100/60 select-none">
          <span className="w-5 h-5 flex items-center justify-center bg-purple-600 text-white font-bold rounded-full text-[10px] shadow-sm">
            {badge}
          </span>
          <span className="font-bold text-xs text-purple-900">{title}</span>
        </div>

        {/* Scrollable Tracker Content */}
        <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4 pb-20">
          {!isCompleted ? (
            <>
              {/* Raju Electricals Info Card */}
              <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-900 flex items-center justify-center font-bold text-sm">
                    ⚡
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-purple-950 m-0">{teamName}</h3>
                    <p className="text-[10px] text-purple-750 font-bold mt-0.5 m-0 flex items-center gap-1 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                      Crew is arriving on site · 20 mins
                    </p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <button type="button" className="flex-1 py-2 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                    📞 Call Team
                  </button>
                  <button type="button" className="flex-1 py-2 border border-purple-900 text-purple-900 hover:bg-purple-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                    💬 Chat
                  </button>
                </div>
              </div>

              {/* 3D Map Card */}
              <div className="relative w-full h-44 bg-white border border-gray-100 rounded-3xl p-2.5 shadow-sm overflow-hidden select-none">
                <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-50 border border-gray-100 shadow-inner">
                  <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=450" alt="map" className="w-full h-full object-cover opacity-80 filter brightness-95" />
                  
                  {/* Overlay Badges */}
                  <div className="absolute top-2.5 left-3 bg-white/95 px-2.5 py-1 rounded-lg text-[9px] font-bold text-slate-700 shadow-md border border-slate-100 flex items-center gap-1">
                    <span>🚩</span> 3.4 km to site
                  </div>
                  <div className="absolute top-2.5 right-3 bg-amber-100/90 text-amber-900 px-2 py-0.5 rounded-full text-[8px] font-black tracking-wide border border-amber-200/50">
                    Fastest Route
                  </div>
                </div>
              </div>

              {/* Crew Details grid */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 select-none">Crew Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Electricians", val: "2 Members", icon: "⚡" },
                    { label: "Wiremen", val: "2 Members", icon: "🔌" },
                    { label: "Helpers", val: "3 Members", icon: "🔧" },
                    { label: "Supervisor", val: "1 Member", icon: "📋" }
                  ].map((cell) => (
                    <div key={cell.label} className="bg-white border border-gray-150 rounded-2xl p-3 flex items-center gap-2.5 shadow-sm">
                      <span className="text-lg">{cell.icon}</span>
                      <div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">{cell.label}</span>
                        <span className="text-xs font-bold text-gray-800 mt-0.5 block">{cell.val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline status checklist */}
              <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm flex flex-col gap-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-2 m-0 select-none">Timeline</p>
                <div className="flex flex-col relative pl-6 border-l border-gray-200 ml-2 gap-5 py-1">
                  {MARKETPLACE_TIMELINE.map((stepKey, idx) => {
                    const isCompletedStep = idx < currentStatusIndex;
                    const isActiveStep = idx === currentStatusIndex;
                    const isUpcomingStep = idx > currentStatusIndex;

                    const details = getTeamTimelineStepDetails(stepKey, idx);
                    if (!details) return null;

                    let nodeBg = "border-gray-200 bg-white";
                    if (isCompletedStep) {
                      nodeBg = "bg-purple-900 border-purple-900 text-white text-[9px] font-bold";
                    } else if (isActiveStep) {
                      nodeBg = "bg-purple-50 border-purple-900 ring-2 ring-purple-100";
                    }

                    return (
                      <div key={stepKey} className="relative flex flex-col gap-0.5">
                        {/* Node circle/badge */}
                        {isCompletedStep ? (
                          <span className={`absolute -left-[27px] top-0.5 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`}>
                            ✓
                          </span>
                        ) : isActiveStep ? (
                          <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`}>
                            <span className="w-1.5 h-1.5 bg-purple-900 rounded-full" />
                          </span>
                        ) : (
                          <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`} />
                        )}
                        
                        <p className={`text-xs font-bold m-0 ${isActiveStep ? "text-purple-900 text-sm" : isUpcomingStep ? "text-gray-400" : "text-gray-700"}`}>
                          {details.label}
                        </p>
                        {details.sublabel && (
                          <p className={`text-[10px] m-0 ${isActiveStep ? "text-purple-700 font-semibold" : "text-gray-400"}`}>
                            {details.sublabel}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Confirm Completion View matching Screen 5 */
            <div className="flex flex-col gap-4">
              {/* Completed Banner */}
              <div className="bg-white border border-gray-150 rounded-3xl p-4 shadow-sm flex justify-between items-center select-none">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏗️</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-extrabold text-sm text-purple-950 m-0">Work Completed!</h2>
                      <span className="bg-amber-400 text-purple-950 text-[7px] font-black px-1.5 py-0.5 rounded uppercase">
                        Paid
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-semibold mt-0.5 m-0">ID: #{booking.bookingRef}</p>
                  </div>
                </div>
                <p className="font-black text-sm text-purple-950 m-0">₹{crewTotal}</p>
              </div>

              {/* Visual Verification */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 select-none">Visual Verification</p>
                <div className="grid grid-cols-2 gap-3.5">
                  {/* BEFORE picture card */}
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-200 border border-gray-100 shadow-inner">
                    <img src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=250" alt="before" className="w-full h-full object-cover" />
                    <span className="absolute top-2 left-2 bg-black/75 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Before
                    </span>
                  </div>
                  {/* AFTER picture card */}
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-200 border border-gray-100 shadow-inner">
                    <img src="https://images.unsplash.com/photo-1558223180-113b869c647c?w=250" alt="after" className="w-full h-full object-cover" />
                    <span className="absolute top-2 left-2 bg-purple-700 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                      After
                    </span>
                  </div>
                </div>
              </div>

              {/* Completion OTP Card */}
              <div className="bg-purple-100/30 border border-dashed border-purple-300 rounded-3xl p-5 flex flex-col items-center gap-3.5 select-none">
                <p className="text-[10px] font-bold text-purple-950 uppercase tracking-wide m-0">Completion OTP</p>
                <p className="text-[9px] text-gray-500 m-0">Ask your professional for the 4-digit code</p>
                <div className="flex gap-2.5 mt-0.5">
                  {["7", "1", "•", "•"].map((char, index) => (
                    <div
                      key={index}
                      className="w-9 h-11 bg-white border border-gray-250 rounded-xl flex items-center justify-center font-extrabold text-sm text-purple-950 shadow-sm"
                    >
                      {char}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rate Service & Professional */}
              <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm text-center flex flex-col items-center gap-3">
                <p className="text-xs font-bold text-purple-955 m-0 uppercase tracking-wide">Rate Service & Professional</p>
                
                {/* Clickable Star Ratings */}
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="text-3xl cursor-pointer focus:outline-none transition-transform hover:scale-110 active:scale-95"
                      onClick={() => setRating(star)}
                    >
                      {star <= rating ? "★" : "☆"}
                    </button>
                  ))}
                </div>

                <div className="w-full flex flex-col gap-1 pt-1 text-left">
                  <textarea
                    placeholder="Optional: How was your experience with the team?"
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    className="w-full min-h-[80px] p-3 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:border-purple-600 text-gray-800 bg-purple-50/10"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Component Footer Bar (inside simulator frame) */}
        {!isCompleted ? (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3.5 z-40 select-none items-center justify-between">
            <div className="flex gap-2">
              <button type="button" className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-800 flex items-center justify-center text-lg border border-purple-100/50">
                📞
              </button>
              <button type="button" className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-800 flex items-center justify-center text-lg border border-purple-100/50">
                💬
              </button>
            </div>
            <button type="button" onClick={cancelBooking} disabled={loading} className="border border-red-500 hover:bg-red-50 text-red-500 font-extrabold text-xs rounded-2xl py-3 flex-grow text-center cursor-pointer transition-all disabled:opacity-50">
              Cancel
            </button>
          </div>
        ) : (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex justify-between items-center gap-4 z-40 select-none">
            <div>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Total Amount Paid</span>
              <p className="font-black text-purple-955 text-sm m-0">₹{crewTotal}</p>
            </div>
            <Link
              href="/"
              className="py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-full px-8 text-center cursor-pointer transition-all no-underline shadow"
            >
              Back to Home
            </Link>
          </div>
        )}

      </div>
      </div>
    );
  }

  // Standard Individual Electrical tracker
  const badge = isCompleted ? 12 : 11;
  const title = isCompleted ? "Job Completed" : "Live Tracking";

  return (
    <div className="flow-page-shell tracker-page-shell-v3">
      {/* Desktop view */}
      <div className="tracker-split-layout-v3">
        {/* Left Side: Floating Card */}
        <div className="tracker-floating-card-v3">
          <div className="live-tracking-header-v3">
            <span className="live-tag-v3">LIVE TRACKING</span>
            <span className="live-status-badge-v3">On the way</span>
          </div>

          <h2 className="tracker-service-title-v3">{booking.service.name}</h2>
          <p className="tracker-booking-id-v3">ID: #{booking.bookingRef}</p>

          {/* Professional Card */}
          {professional ? (
            <div className="tracker-partner-card-v3">
              <img
                src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
                alt={professional.name}
                className="partner-avatar-v3"
              />
              <div className="partner-info-v3">
                <h4 className="partner-name-v3">{professional.name}</h4>
                <p className="partner-rating-v3">★ {professional.rating?.toFixed(1) || "4.9"} (128 reviews)</p>
              </div>
              <div className="partner-actions-v3">
                <Link href="/profile/messages" className="action-btn-v3 chat no-underline">💬</Link>
                <a href={`tel:${professional.phone || "9876543210"}`} className="action-btn-v3 call">📞</a>
              </div>
            </div>
          ) : (
            <div className="tracker-partner-searching-v3">
              <p>Searching for available technician near you...</p>
            </div>
          )}

          {/* Start code — read aloud to the technician to start the job (desktop) */}
          {booking.startOtp && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(status) && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-purple-300 bg-purple-100/30 p-4">
              <div>
                <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-purple-950">Start code</p>
                <p className="m-0 text-[10px] text-gray-500">Share with your technician to begin</p>
              </div>
              <p className="m-0 text-2xl font-extrabold tracking-[0.3em] text-purple-800">{booking.startOtp}</p>
            </div>
          )}

          {/* Tracking Updates */}
          <div className="tracker-updates-section-v3">
            <h3>TRACKING UPDATES</h3>
            
            <div className="tracker-timeline-v3">
              {MARKETPLACE_TIMELINE.map((stepKey, idx) => {
                const isCompletedStep = idx < currentStatusIndex;
                const isActiveStep = idx === currentStatusIndex;
                const isUpcomingStep = idx > currentStatusIndex;

                const { label, sublabel } = getTimelineStepDetails(stepKey, idx);
                
                let statusClass = "upcoming";
                let icon = "○";
                if (isCompletedStep) {
                  statusClass = "completed";
                  icon = "✓";
                } else if (isActiveStep) {
                  statusClass = "active";
                  icon = "🛵";
                }

                if (stepKey === "PENDING" && isActiveStep) {
                  icon = "✓";
                }

                return (
                  <div key={stepKey} className={`timeline-item-v3 ${statusClass}`}>
                    <div className="timeline-node-v3">{icon}</div>
                    <div className="timeline-content-v3">
                      <h4 className="timeline-label-v3">{label}</h4>
                      {sublabel && <p className="timeline-sublabel-v3">{sublabel}</p>}
                      {isActiveStep && <span className="timeline-time-v3">Just now</span>}
                      {isCompletedStep && <span className="timeline-time-v3">12:15 PM</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="tracker-actions-footer-v3">
            <button type="button" onClick={() => setShowDetailsModal(true)} className="footer-btn-secondary-v3">
              Booking Details
            </button>
            <Link href="/profile/messages" className="footer-btn-primary-v3 flex items-center justify-center no-underline">
              Chat with Partner
            </Link>
          </div>
        </div>

        {/* Right Side: Map Container */}
        <div className="tracker-map-container-v3">
          <img
            src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200"
            alt="Tracking Map"
            className="tracker-map-bg-v3"
          />
          <div className="tracker-map-overlay-v3">
            {/* User Location Pin */}
            <div className="map-pin-v3 user-pin" style={{ top: "60%", left: "55%" }}>
              <div className="pin-dot"></div>
              <div className="pin-label">My Location</div>
            </div>

            {/* Provider Location Pin */}
            {professional && (
              <div className="map-pin-v3 partner-pin" style={{ top: "45%", left: "33%" }}>
                <div className="pin-dot pulse-blue"></div>
                <div className="pin-label">Expert: {professional.name.split(" ")[0]} J.</div>
              </div>
            )}

            {/* Route Line overlay using SVG */}
            <svg className="map-route-svg-v3" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M 33,45 L 40,45 L 40,60 L 55,60" fill="none" stroke="#1e3a8a" strokeWidth="0.5" strokeDasharray="1" />
            </svg>
          </div>

          {/* Map Controls */}
          <div className="map-controls-v3">
            <button type="button" className="control-btn-v3">+</button>
            <button type="button" className="control-btn-v3">−</button>
            <button type="button" className="control-btn-v3 target">🎯</button>
          </div>
        </div>
      </div>

      {/* Mobile view wrapped */}
      <div className="tracker-mobile-view-v3 flex flex-col h-full">
        {/* Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-900 text-white shadow-sm select-none">
          <Link href="/" className="text-xl leading-none text-blue-200 hover:text-white cursor-pointer no-underline">
            ←
          </Link>
          <span className="font-semibold text-sm truncate">Booking Status</span>
        </div>

        {/* Numbered Step Progress Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100/60 select-none">
          <span className="w-5 h-5 flex items-center justify-center bg-blue-600 text-white font-bold rounded-full text-[10px] shadow-sm">
            {badge}
          </span>
          <span className="font-bold text-xs text-blue-900">{title}</span>
        </div>

        {/* Scrollable Tracker Content */}
        <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4 pb-20">
        {/* Revised quote — provider found extra work; customer approves the extra charge */}
        {booking.revisedAmountPaise ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-extrabold text-amber-900 m-0">Revised quote from your professional</p>
            <p className="text-xs text-amber-800 mt-1 mb-0">{booking.revisedReason ?? "Extra work found on site."}</p>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-gray-600">Extra charge</span>
              <span className="font-extrabold text-amber-900">+{formatPrice(booking.revisedAmountPaise)}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => reviseAction("decline")} disabled={loading} className="flex-1 py-2 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold disabled:opacity-50">
                Decline
              </button>
              <button type="button" onClick={() => reviseAction("approve")} disabled={loading} className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-extrabold disabled:opacity-50">
                Approve +{formatPrice(booking.revisedAmountPaise)}
              </button>
            </div>
          </div>
        ) : null}

        {!isCompleted ? (
          <>
            {/* Provider Details Card at the top */}
            {professional ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
                    alt={professional.name}
                    className="w-10 h-10 rounded-full object-cover border border-purple-100"
                  />
                  <div>
                    <p className="font-bold text-xs text-gray-800 m-0">{professional.name}</p>
                    <p className="text-[10px] text-purple-700 font-bold mt-0.5 m-0 flex items-center gap-1">
                      🛵 {status === "PROVIDER_ARRIVING" ? "is on the way" : STATUS_MESSAGES[status] || "is active"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center justify-center text-xs border border-purple-100/50">
                    💬
                  </button>
                  <a href={`tel:${professional.phone || "9876543210"}`} className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center justify-center text-xs border border-purple-100/50 no-underline">
                    📞
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-center">
                <p className="text-xs font-semibold text-purple-950 m-0 animate-pulse">Searching for available technician near you...</p>
              </div>
            )}

            {/* Start code — read aloud to the technician to start the job */}
            {booking.startOtp && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(status) && (
              <div className="bg-purple-100/30 border border-dashed border-purple-300 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-purple-950 uppercase tracking-wide m-0">Start code</p>
                  <p className="text-[10px] text-gray-500 m-0">Share with your technician to begin</p>
                </div>
                <p className="font-extrabold text-2xl tracking-[0.3em] text-purple-800 m-0">{booking.startOtp}</p>
              </div>
            )}

            {/* Live Tracking Map Card */}
            <div className="relative w-full h-44 bg-white border border-gray-100 rounded-2xl p-2 shadow-sm overflow-hidden">
              <div className="relative w-full h-full rounded-xl overflow-hidden bg-slate-50 border border-gray-100/60 shadow-inner">
                {/* 12 mins away badge */}
                {professional && status === "PROVIDER_ARRIVING" && (
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-white/95 px-3 py-1 rounded-full text-[10px] font-bold text-slate-700 shadow-md border border-slate-100 flex items-center gap-1.5 z-10 select-none">
                    <span className="w-1.5 h-1.5 bg-purple-600 rounded-full" />
                    12 mins away
                  </div>
                )}
                
                <svg className="absolute inset-0 w-full h-full text-slate-200" xmlns="http://www.w3.org/2000/svg">
                  {/* Simulated streets */}
                  <line x1="0" y1="50" x2="500" y2="50" stroke="currentColor" strokeWidth="6" />
                  <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="6" />
                  <line x1="140" y1="0" x2="140" y2="250" stroke="currentColor" strokeWidth="6" />
                  <line x1="300" y1="0" x2="300" y2="250" stroke="currentColor" strokeWidth="6" />
                  
                  {/* Route path */}
                  <path d="M 140,120 L 220,120 L 220,50 L 300,50" fill="none" stroke="#7c3aed" strokeWidth="4" strokeDasharray="6" className="animate-[dash_2s_linear_infinite]" />
                </svg>
                
                {/* Scooter animation */}
                <div className="absolute top-[38px] left-[200px] text-2xl animate-pulse">🛵</div>
                {/* Target House */}
                <div className="absolute top-[30px] left-[285px] text-2xl drop-shadow-md">🏠</div>
                {/* Provider Position pin */}
                <div className="absolute top-[102px] left-[125px] text-2xl drop-shadow-md">👤</div>
                
                <div className="absolute bottom-2 left-2 bg-white/95 px-2 py-0.5 rounded-md text-[8px] font-bold text-slate-500 shadow-sm border border-slate-100">
                  Live Tracking Map
                </div>
              </div>
            </div>

            {/* Booking Details Card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Booking ID</span>
                  <p className="font-mono font-bold text-gray-800 mt-0.5 m-0">#{booking.bookingRef}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Total Amount</span>
                  <p className="font-bold text-sm text-purple-900 mt-0.5 m-0">₹{formatPrice(booking.finalAmountPaise ?? booking.quotedAmount)}</p>
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Service Address</span>
                <p className="text-xs font-semibold text-gray-700 mt-0.5 m-0 leading-relaxed">{booking.address}</p>
              </div>
            </div>

            {/* Service Status Timeline */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-2 m-0">Service Status</p>
              <div className="flex flex-col relative pl-6 border-l border-gray-200 ml-2 gap-5 py-1">
                {MARKETPLACE_TIMELINE.map((stepKey, idx) => {
                  const isCompletedStep = idx < currentStatusIndex;
                  const isActiveStep = idx === currentStatusIndex;
                  const isUpcomingStep = idx > currentStatusIndex;

                  const { label, sublabel } = getTimelineStepDetails(stepKey, idx);

                  let nodeBg = "border-gray-200 bg-white";
                  if (isCompletedStep) {
                    nodeBg = "bg-purple-900 border-purple-900 text-white text-[9px] font-bold";
                  } else if (isActiveStep) {
                    nodeBg = "bg-purple-50 border-purple-900 ring-2 ring-purple-100";
                  }

                  return (
                    <div key={stepKey} className="relative flex flex-col gap-0.5">
                      {/* Node circle/badge */}
                      {isCompletedStep ? (
                        <span className={`absolute -left-[27px] top-0.5 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`}>
                          ✓
                        </span>
                      ) : isActiveStep ? (
                        <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`}>
                          <span className="w-1.5 h-1.5 bg-purple-900 rounded-full" />
                        </span>
                      ) : (
                        <span className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border ${nodeBg} flex items-center justify-center select-none`} />
                      )}
                      
                      <p className={`text-xs font-bold m-0 ${isActiveStep ? "text-purple-900 text-sm" : isUpcomingStep ? "text-gray-400" : "text-gray-700"}`}>
                        {label}
                      </p>
                      {sublabel && (
                        <p className={`text-[10px] m-0 ${isActiveStep ? "text-purple-700 font-semibold" : "text-gray-400"}`}>
                          {sublabel}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Job Completed Screen */
          <div className="flex flex-col gap-4">
            {/* Completed Card Banner */}
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-6 text-center flex flex-col items-center gap-3 relative overflow-hidden select-none">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-2xl shadow-inner">
                ✓
              </div>
              <h2 className="font-black text-gray-900 text-lg m-0">Job Completed!</h2>
              <p className="text-xs text-gray-500 font-semibold m-0">Order #{booking.bookingRef}</p>
            </div>

            {/* Experience / rating card — submits to the real /review API which
                refreshes the partner's aggregate rating on their dashboard. */}
            <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm text-center flex flex-col items-center gap-3">
              <p className="text-xs font-bold text-purple-955 m-0 uppercase tracking-wide">
                {reviewSubmitted ? "Your rating" : "How was your experience?"}
              </p>

              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    disabled={reviewSubmitted}
                    className="text-3xl focus:outline-none transition-transform hover:scale-110 active:scale-95 disabled:cursor-default"
                    onClick={() => setRating(star)}
                  >
                    {star <= rating ? "★" : "☆"}
                  </button>
                ))}
              </div>

              <span className="bg-amber-100 border border-amber-200/50 text-amber-800 text-[10px] font-extrabold px-3 py-1 rounded-full mt-1">
                {getRatingLabel(rating)}
              </span>

              {reviewSubmitted ? (
                <p className="text-[11px] text-emerald-600 font-bold m-0">
                  ✓ Thanks! Your feedback is shared with the professional.
                </p>
              ) : (
                <div className="w-full flex flex-col gap-2 mt-1">
                  <textarea
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="Add a few words about the professional (optional)"
                    className="w-full min-h-[60px] p-2.5 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:border-purple-500 text-left"
                  />
                  {error && <p className="text-[11px] text-red-600 m-0">{error}</p>}
                  <button
                    type="button"
                    onClick={submitReview}
                    disabled={loading}
                    className="w-full py-2.5 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-full disabled:opacity-60"
                  >
                    {loading ? "Submitting…" : "Submit rating"}
                  </button>
                </div>
              )}
            </div>

            {/* Paid Amount Card */}
            <div className="bg-purple-100/40 border border-purple-200/40 rounded-3xl p-4 flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-sm">💵</span>
                <p className="text-xs font-bold text-purple-955 m-0">
                  Paid Amount ₹{formatPrice(booking.finalAmountPaise ?? booking.quotedAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsModal(true)}
                className="text-xs font-bold text-purple-700 hover:text-purple-950 underline decoration-2 cursor-pointer"
              >
                View Details
              </button>
            </div>

            {/* Real invoice — opens a print/save-as-PDF invoice built from DB data */}
            <a
              href={`/booking/invoice/${booking.bookingRef}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-white border border-purple-200 text-purple-800 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 no-underline hover:bg-purple-50"
            >
              ⬇ Download invoice
            </a>

            {/* Refer & Earn Card */}
            <div className="bg-gradient-to-r from-amber-400 to-amber-500 rounded-3xl p-4 text-purple-955 shadow-sm relative overflow-hidden flex justify-between items-center select-none">
              <div>
                <p className="font-extrabold text-xs m-0">Refer & Earn</p>
                <p className="text-[9px] font-medium opacity-90 mt-0.5 m-0">Get ₹50 for every friend you invite</p>
              </div>
              <span className="text-2xl opacity-60">🎉</span>
            </div>
          </div>
        )}
      </div>

      {/* Component Footer Bar (inside simulator frame, only when not completed) */}
      {!isCompleted && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 z-40 select-none">
          <button type="button" onClick={cancelBooking} disabled={loading} className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-full text-center cursor-pointer transition-all disabled:opacity-50">
            Cancel Booking
          </button>
          <button type="button" className="flex-1 py-2.5 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-full flex items-center justify-center gap-1.5 cursor-pointer transition-all">
            💬 Chat with {professional?.name.split(" ")[0] || "Partner"}
          </button>
        </div>
      )}

      {/* Booking Details Modal Popup */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 transition-all duration-300 select-none">
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-5 shadow-2xl relative flex flex-col gap-4 animate-[slideUp_0.2s_ease-out]">
            {/* Modal style override */}
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}} />
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="font-extrabold text-sm text-purple-955">Booking Details</span>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Partner Details */}
            {professional ? (
              <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-3 flex items-center gap-3">
                <img
                  src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
                  alt={professional.name}
                  className="w-10 h-10 rounded-full object-cover border border-purple-250"
                />
                <div>
                  <p className="font-bold text-xs text-gray-800 m-0">{professional.name}</p>
                  <p className="text-[10px] text-purple-700 font-bold mt-0.5 m-0">
                    ★ {professional.rating?.toFixed(1) || "4.9"} · Assigned Partner
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-purple-700 m-0">No partner details available</p>
              </div>
            )}

            {/* Booking Stats List */}
            <div className="flex flex-col gap-3.5 my-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-400">Service Booked:</span>
                <span className="font-extrabold text-purple-955">{booking.service.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-400">Booking Reference:</span>
                <span className="font-mono font-bold text-gray-800">#{booking.bookingRef}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-400">Booked On:</span>
                <span className="font-bold text-gray-800">{formatDate(booking.createdAt)}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="font-bold text-gray-400 flex-shrink-0 mr-4">Service Address:</span>
                <span className="font-semibold text-gray-800 text-right leading-snug">{booking.address}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                <span className="font-bold text-gray-400">Total Paid Amount:</span>
                <span className="font-black text-purple-955 text-sm">₹{formatPrice(booking.finalAmountPaise ?? booking.quotedAmount)}</span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowDetailsModal(false)}
              className="w-full py-2.5 bg-purple-900 hover:bg-purple-955 text-white font-bold text-xs rounded-full text-center cursor-pointer transition-all shadow"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
