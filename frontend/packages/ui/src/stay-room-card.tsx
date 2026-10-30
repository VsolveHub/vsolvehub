import { ArrowRight, BedDouble, MapPin, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export type StayRoomCardChip = {
  label: string;
  /** neutral: occupancy; brand: who it suits; success: availability; info: other looks. */
  tone: "neutral" | "brand" | "success" | "info";
};

export interface StayRoomCardProps {
  photoUrl?: string | null;
  photoCount: number;
  /** "4.6" — shown on the photo when the property has reviews. */
  rating?: string | number | null;
  reviewCount?: number | null;
  /** "1 BHK" or "1 BHK · With balcony". */
  title: string;
  /** The property's name. */
  subtitle: string;
  location?: string | null;
  chips: StayRoomCardChip[];
  /** "₹18,000". */
  price: string;
  /** "night" or "month". */
  period: string;
  footnote?: ReactNode;
  /** The guest app puts its link over the card through this slot. */
  overlay?: ReactNode;
  className?: string;
}

const CHIP_STYLE: Record<StayRoomCardChip["tone"], string> = {
  neutral: "border-line/60 bg-surface-sunken text-text-secondary",
  brand: "border-navy-200 bg-navy-50 text-navy-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-navy-200 bg-navy-50 text-navy-900",
};

/**
 * One room (one look of a room type) as a guest sees it in stay search.
 *
 * Presentational only, so the guest app's search card and the host's "How guests see it"
 * preview are the same markup and cannot drift apart.
 */
export function StayRoomCard({
  photoUrl,
  photoCount,
  rating,
  reviewCount,
  title,
  subtitle,
  location,
  chips,
  price,
  period,
  footnote,
  overlay,
  className,
}: StayRoomCardProps) {
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-xs transition hover:border-line-strong hover:shadow-raised",
        className,
      )}
    >
      {overlay}
      <div className="pointer-events-none relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-0 size-full object-cover transition duration-slow group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-text-muted">
            <BedDouble className="size-8" />
          </div>
        )}
        {photoCount > 1 ? (
          <span className="absolute bottom-2 right-2 rounded-control bg-navy-900/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {photoCount} photos
          </span>
        ) : null}
        {rating ? (
          <span className="absolute left-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-xs font-bold text-amber-700 shadow-xs">
            ★ {rating}
            {reviewCount ? ` (${reviewCount})` : ""}
          </span>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-lg font-bold text-text group-hover:text-action">{title}</h3>
          <p className="truncate text-sm font-medium text-text-secondary">{subtitle}</p>
        </div>

        {location ? (
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{location}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={`${chip.tone}:${chip.label}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                CHIP_STYLE[chip.tone],
              )}
            >
              {chip.tone === "neutral" ? <Users className="size-3" /> : null}
              {chip.tone === "success" ? <ShieldCheck className="size-3" /> : null}
              {chip.label}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line/70 pt-3">
          <p>
            <span className="text-xl font-extrabold text-text">{price}</span>
            <span className="text-xs font-medium text-text-secondary"> / {period}</span>
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-action">
            View room
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>

        {footnote}
      </div>
    </article>
  );
}
