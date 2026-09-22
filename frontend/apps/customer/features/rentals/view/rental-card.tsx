"use client";

import Link from "next/link";
import { ArrowRight, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { Badge, Button } from "@vsolve/ui";

import { formatPaise, type RentalAsset } from "../model";

interface RentalCardProps {
  asset: RentalAsset;
}

export function RentalCard({ asset }: RentalCardProps) {
  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:border-line-strong hover:shadow-raised">
      <div className="flex flex-col gap-3">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <Wrench className="size-3" />
            Verified Tool
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Protected Deposit
          </span>
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

          <Link href={`/rentals/${asset.id}`}>
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
