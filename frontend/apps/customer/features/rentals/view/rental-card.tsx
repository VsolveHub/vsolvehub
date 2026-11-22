"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Wrench } from "lucide-react";
import { Badge, buttonStyles } from "@vsolve/ui";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { rentalHref } from "@/lib/routes";

import { formatPaise, type RentalAsset } from "../model";

interface RentalCardProps {
  asset: RentalAsset;
}

export function RentalCard({ asset }: RentalCardProps) {
  const saved = useSavedItems("rental");
  const href = rentalHref(asset.slug || asset.id);
  const hero =
    (Array.isArray((asset as { media?: { url?: string }[] }).media) &&
      (asset as { media: { url?: string }[] }).media[0]?.url);

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card transition duration-fast hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-within:border-line-strong focus-within:shadow-raised">
      {/* Stretched link: the whole card opens the rental. Interactive children sit above it (z-10). */}
      <Link
        href={href}
        aria-label={`View ${asset.title}`}
        className="absolute inset-0 z-[1] rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      />
      {hero ? (
        <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-control border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            alt={asset.title}
            className="h-full w-full object-contain p-3 transition duration-slow group-hover:scale-[1.03]"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <Wrench className="size-3" />
              Verified Tool
            </Badge>
            {typeof asset.quantity_available === "number" && asset.quantity_available > 1 ? (
              <Badge tone="neutral" className="text-xs font-bold">
                Qty {asset.quantity_available}
              </Badge>
            ) : null}
          </div>
          <div className="relative z-10">
            <SaveHeart saved={saved.isSaved(asset.id)} onToggle={() => saved.toggle(asset.id)} />
          </div>
        </div>

        {/* Title and Partner */}
        <div>
          <h3 className="text-lg font-bold text-text group-hover:text-action">
            {asset.title}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-secondary">
            Offered by <span className="font-semibold text-text">{asset.partner_name}</span>
          </p>
        </div>

        {/* Description */}
        {asset.description && (
          <p className="line-clamp-2 text-xs text-text-secondary leading-relaxed">
            {asset.description}
          </p>
        )}

        {/* Location text */}
        {asset.location_text && (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin className="size-3.5 text-text-muted shrink-0" />
            <span className="truncate">{asset.location_text}</span>
          </div>
        )}

        {/* Price and Action */}
        <div className="mt-1 flex items-center justify-between border-t border-line/60 pt-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-text">
                {formatPaise(asset.daily_rate_paise)}
              </span>
              <span className="text-xs text-text-muted font-medium">/day</span>
            </div>
            {asset.deposit_paise && asset.deposit_paise > 0 ? (
              <p className="text-[11px] text-text-muted">
                Deposit: {formatPaise(asset.deposit_paise)}
              </p>
            ) : null}
          </div>
          <Link
            href={href}
            tabIndex={-1}
            className={buttonStyles({
              size: "sm",
              className: "relative z-10 inline-flex items-center gap-1 font-bold shadow-xs",
            })}
          >
            Rent Now
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
