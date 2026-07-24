import Link from "next/link";
import Image from "next/image";
import type { BookingParty } from "@/lib/booking/types";

export function DesktopProfessionalCard({ professional }: { professional: BookingParty | null }) {
  if (!professional) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
        Searching for an available technician near you…
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
      <Image
        src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
        alt={professional.name}
        width={56}
        height={56}
        className="h-14 w-14 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-black text-gray-900">{professional.name}</h4>
        <p className="text-xs font-semibold text-gray-500">
          <span className="text-[var(--color-brand-accent)]">★</span>{" "}
          {professional.rating?.toFixed(1) || "4.9"} (128 reviews)
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          href="/profile/messages"
          aria-label="Chat with partner"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white"
        >
          💬
        </Link>
        <a
          href={`tel:${professional.phone || "9876543210"}`}
          aria-label="Call partner"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 transition-colors hover:bg-green-600 hover:text-white"
        >
          📞
        </a>
      </div>
    </div>
  );
}
