"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Wrench } from "lucide-react";
import { Badge, Button } from "@vsolve/ui";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { rentalHref } from "@/lib/routes";

import { formatPaise, type RentalAsset } from "../model";

interface RentalCardProps {
  asset: RentalAsset;
}

export function RentalCard({ asset }: RentalCardProps) {
  const saved = useSavedItems("rental");
  const hero =
    Array.isArray((asset as { media?: { url?: string }[] }).media) &&
    (asset as { media: { url?: string }[] }).media[0]?.url
      ? (asset as { media: { url: string }[] }).media[0].url
      : null;

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:border-line-strong hover:shadow-raised">
      {hero ? (
        <div className="-mx-5 -mt-5 mb-3 aspect-[16/10] overflow-hidden bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt="" className="h-full w-full object-cover transition duration-slow group-hover:scale-[1.03]" />
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
          <SaveHeart saved={saved.isSaved(asset.id)} onToggle={() => saved.toggle(asset.id)} />
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
            <MapPin className="size-3.5 shrink-0 text-text-secondary" />
            <span className="truncate">{asset.location_text}</span>
          </div>
        )}
      </div>

      {/* Pricing and Action Footer */}
      <div className="mt-5 border-t border-line/70 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-text">
                {formatPaise(asset.daily_rate_paise)}
              </span>
              <span className="text-xs font-medium text-text-secondary">/ day</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-text-secondary">
              Deposit: <span className="font-semibold text-text">{formatPaise(asset.deposit_paise)}</span> (100% refundable)
            </p>
          </div>

          <Link href={rentalHref(asset.slug)}>
            <Button size="sm" className="inline-flex items-center gap-1.5 font-bold">
              Rent Now
              <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}
