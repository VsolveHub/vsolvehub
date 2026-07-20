import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { STATUS_LABELS, STATUS_MESSAGES } from "@/lib/constants";
import type { Booking } from "@/lib/booking/types";

type Props = {
  booking: Booking;
  status: string;
  partnerName: string;
};

export function TrackStep({ booking, status, partnerName }: Props) {
  return (
    <>
      {/* Tracking Status Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p style={{ fontSize: "0.75rem", color: "#71717a", margin: 0 }}>Reference Code</p>
            <p style={{ fontWeight: 800, margin: 0, fontSize: "1.05rem" }}>{booking.bookingRef}</p>
          </div>
          <Badge status={status}>{STATUS_LABELS[status] ?? status}</Badge>
        </div>
        <p className="rounded-xl px-4 py-3 text-sm bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]" style={{ margin: "0.5rem 0", fontSize: "0.8rem", padding: "0.5rem 0.75rem" }}>
          {STATUS_MESSAGES[status]}
        </p>

      </div>

      {/* Map View */}
      {["PENDING", "SEARCHING_PROVIDER", "ASSIGNED", "ON_THE_WAY"].includes(status) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" style={{ padding: 0, height: "200px", position: "relative", overflow: "hidden", borderRadius: "16px" }}>
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
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4 text-center" style={{ padding: "1.5rem 1.25rem", border: "2px solid var(--color-brand)", borderRadius: "18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4 text-center" style={{ padding: "2rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.825rem" }}>
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
  );
}
