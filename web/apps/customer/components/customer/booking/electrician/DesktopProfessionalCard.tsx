import Link from "next/link";
import type { BookingParty } from "@/lib/booking/types";

export function DesktopProfessionalCard({ professional }: { professional: BookingParty | null }) {
  if (!professional) {
    return (
      <div className="tracker-partner-searching-v3">
        <p>Searching for available technician near you...</p>
      </div>
    );
  }
  return (
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
  );
}
