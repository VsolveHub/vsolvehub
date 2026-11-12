"use client";

import Link from "next/link";
import { MapPin, Wrench } from "lucide-react";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { rentalHref } from "@/lib/routes";

import { formatPaise, type RentalAsset } from "../model";

interface RentalRowCardProps {
  asset: RentalAsset;
  onQuickBook: (asset: RentalAsset) => void;
}

export function RentalRowCard({ asset, onQuickBook }: RentalRowCardProps) {
  const saved = useSavedItems("rental");
  const hero =
    Array.isArray((asset as { media?: { url?: string }[] }).media) &&
    (asset as { media: { url?: string }[] }).media[0]?.url;
  const detailHref = rentalHref(asset.slug || asset.id);

  return (
    <article className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl sm:rounded-[1.25rem] border border-[#e7e2da] bg-white p-3 sm:p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-xs">
      {/* Mobile Clean Layout (full-width footer row so price & CTA never collide below 400px) */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <div className="flex items-start gap-2.5">
          <Link
            href={detailHref}
            className="relative grid size-14 min-[400px]:size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#F4F1EC] shadow-xs"
          >
            {hero ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={hero}
                alt={asset.title}
                className="size-full bg-white object-contain p-1"
              />
            ) : (
              <Wrench className="size-6 text-text-secondary" strokeWidth={1.6} />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1.5">
              <Link href={detailHref} className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-[13.5px] min-[400px]:text-sm font-bold leading-snug text-navy-900">
                  {asset.title}
                </h3>
              </Link>
              <SaveHeart saved={saved.isSaved(asset.id)} onToggle={() => saved.toggle(asset.id)} />
            </div>

            {asset.description ? (
              <p className="mt-1 line-clamp-2 text-[11.5px] min-[400px]:text-xs leading-relaxed text-text-secondary">
                {asset.description}
              </p>
            ) : asset.location_text ? (
              <p className="mt-1 truncate text-[11.5px] text-text-secondary">{asset.location_text}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line/50 pt-2">
          <div className="min-w-0">
            <span className="block text-[10px] font-medium text-text-muted leading-none">
              Daily rate
            </span>
            <span className="mt-0.5 block text-[13px] font-extrabold text-navy-900 whitespace-nowrap" data-numeric>
              {formatPaise(asset.daily_rate_paise)}
              <span className="text-[11px] font-medium text-text-secondary">/day</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onQuickBook(asset)}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-navy-900 px-3.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-navy-800 active:scale-95"
          >
            Rent Now
          </button>
        </div>
      </div>

      {/* Desktop Left Thumbnail */}
      <Link
        href={detailHref}
        className="relative hidden sm:grid size-[5.5rem] shrink-0 place-items-center overflow-hidden rounded-card bg-[#F4F1EC] shadow-xs"
      >
        {hero ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={hero}
            alt={asset.title}
            className="size-full bg-white object-contain p-1.5"
          />
        ) : (
          <Wrench className="size-7 text-text-secondary" strokeWidth={1.6} />
        )}
      </Link>

      {/* Desktop Middle Details */}
      <div className="hidden sm:block min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={detailHref} className="min-w-0 hover:text-[#EA580C] transition-colors">
            <h3 className="truncate text-[15px] font-extrabold leading-snug text-navy-900">
              {asset.title}
            </h3>
          </Link>
          <SaveHeart saved={saved.isSaved(asset.id)} onToggle={() => saved.toggle(asset.id)} />
        </div>

        <p className="mt-0.5 text-[12px] font-medium text-text-secondary">
          Offered by <span className="font-semibold text-navy-900">{asset.partner_name}</span>
          {typeof asset.quantity_available === "number" && asset.quantity_available > 1
            ? ` · ${asset.quantity_available} available`
            : ""}
        </p>

        {asset.description ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text-secondary">
            {asset.description}
          </p>
        ) : null}

        {asset.location_text ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-secondary">
            <MapPin className="size-3.5 shrink-0 text-text-muted" />
            <span className="truncate">{asset.location_text}</span>
            {asset.distance_km != null ? (
              <span className="shrink-0 font-semibold text-navy-900">
                · {asset.distance_km} km away
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Desktop Right Price + CTA Column */}
      <div className="hidden sm:flex shrink-0 flex-col items-end gap-2 pl-2">
        <div className="text-right">
          <span className="block text-[11px] font-medium text-text-secondary">Daily rate</span>
          <div className="flex items-baseline justify-end gap-1">
            <span
              data-numeric
              className="text-[16px] font-extrabold tabular-nums text-navy-900"
            >
              {formatPaise(asset.daily_rate_paise)}
            </span>
            <span className="text-[11px] font-medium text-text-secondary">/day</span>
          </div>
          {asset.deposit_paise && asset.deposit_paise > 0 ? (
            <span className="block text-[11px] text-text-muted">
              Deposit: {formatPaise(asset.deposit_paise)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={detailHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-navy-900 bg-white px-3.5 text-[13px] font-bold text-navy-900 transition-colors hover:bg-[#FAF9F7]"
          >
            View details
          </Link>
          <button
            type="button"
            onClick={() => onQuickBook(asset)}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-navy-900 px-4 text-[13px] font-bold text-white shadow-xs transition-colors hover:bg-navy-800"
          >
            Rent Now
          </button>
        </div>
      </div>
    </article>
  );
}

