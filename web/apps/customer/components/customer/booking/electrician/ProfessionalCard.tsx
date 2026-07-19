import Link from "next/link";
import { STATUS_MESSAGES } from "@/lib/constants";
import type { BookingParty } from "@/lib/booking/types";

type Props = {
  professional: BookingParty | null;
  variant: "desktop" | "mobileTop";
  status?: string;
};

export function ProfessionalCard({ professional, variant, status }: Props) {
  if (variant === "desktop") {
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

  if (!professional) {
    return (
      <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-center">
        <p className="text-xs font-semibold text-purple-950 m-0 animate-pulse">Searching for available technician near you...</p>
      </div>
    );
  }

  return (
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
            🛵 {status === "PROVIDER_ARRIVING" ? "is on the way" : STATUS_MESSAGES[status ?? ""] || "is active"}
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
  );
}
