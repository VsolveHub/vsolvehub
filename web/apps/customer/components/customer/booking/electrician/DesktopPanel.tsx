import Link from "next/link";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { BookingTimeline } from "./BookingTimeline";
import { ProfessionalCard } from "./ProfessionalCard";
import type { StepDetails } from "./steps";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  status: string;
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails;
  onShowDetails: () => void;
};

export function DesktopPanel({ booking, professional, status, currentStatusIndex, getStepDetails, onShowDetails }: Props) {
  return (
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
        <ProfessionalCard professional={professional} variant="desktop" />

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

          <BookingTimeline currentStatusIndex={currentStatusIndex} getStepDetails={getStepDetails} variant="desktop" />
        </div>

        {/* Footer Actions */}
        <div className="tracker-actions-footer-v3">
          <button type="button" onClick={onShowDetails} className="footer-btn-secondary-v3">
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
  );
}
