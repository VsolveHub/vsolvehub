"use client";

import { Calendar, CheckCircle2, Clock, ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@vsolve/ui";

import {
  formatPaise,
  getDepositStatusBadge,
  getRentalStatusBadge,
  type RentalBooking,
} from "../model";

interface RentalBookingCardProps {
  booking: RentalBooking;
}

export function RentalBookingCard({ booking }: RentalBookingCardProps) {
  const statusInfo = getRentalStatusBadge(booking.status);
  const depositInfo = getDepositStatusBadge(booking.deposit?.status ?? "PENDING");

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xs transition hover:shadow-raised">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusInfo.tone} className="font-bold text-xs">
              {statusInfo.label}
            </Badge>
            <Badge tone={depositInfo.tone} className="font-semibold text-xs">
              {depositInfo.label}
            </Badge>
          </div>

          <h3 className="pt-1 text-lg font-bold text-text">
            {booking.asset?.title ?? "Rental Equipment"}
          </h3>

          {booking.asset?.partner_name && (
            <p className="text-xs text-text-secondary">
              Equipment Partner: <span className="font-semibold text-text">{booking.asset.partner_name}</span>
            </p>
          )}
        </div>

        {/* Price Breakdown block */}
        <div className="rounded-control bg-surface-sunken p-3 text-right sm:min-w-40 border border-line/60">
          <div className="text-xs text-text-secondary">Total Rental Fee</div>
          <div className="text-lg font-extrabold text-action">
            {formatPaise(booking.price_paise)}
          </div>
          <div className="mt-0.5 text-[11px] text-text-secondary">
            Deposit: {formatPaise(booking.deposit?.amount_paise ?? 0)}
          </div>
        </div>
      </div>

      {/* Dates and Details bar */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line/70 pt-4 text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-action shrink-0" />
          <span>
            Rental Window: <strong className="text-text font-bold">{booking.start_date}</strong> to{" "}
            <strong className="text-text font-bold">{booking.end_date}</strong>
          </span>
        </div>

        {booking.pickup_or_delivery_mode && (
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-action shrink-0" />
            <span>
              Mode: <strong className="text-text font-bold capitalize">{booking.pickup_or_delivery_mode.toLowerCase()}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Lifecycle progress helper */}
      <div className="mt-4 rounded-control bg-navy-950/5 p-3.5 text-xs text-text-secondary border border-line/50">
        <div className="flex items-start gap-2">
          <ShieldCheck className="size-4 text-action shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-text">Handover & Protection Protocol:</span>
            <p className="text-[11px] leading-relaxed">
              Verify equipment condition with the partner upon receiving it. When your project is completed, return the tool in good working order to trigger immediate security deposit release.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
