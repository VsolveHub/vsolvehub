"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ShieldCheck, Wrench, X } from "lucide-react";
import { Badge, Skeleton } from "@vsolve/ui";

import { StayImageGallery } from "@/features/stays/view/stay-image-gallery";
import { rentalHref } from "@/lib/routes";

import { formatPaise, type RentalAsset } from "../model";
import { fetchRentalAsset } from "../queries";
import { RentalBookPanel, type RentalSubmitState } from "./rental-book-panel";

const RENTAL_DRAWER_FORM_ID = "rental-drawer-book-form";

export function RentalDetailDrawer({
  asset,
  onClose,
}: {
  asset: RentalAsset;
  onClose: () => void;
}) {
  const key = asset.slug || asset.id;
  const detailQuery = useQuery({
    queryKey: ["rental-asset", key],
    queryFn: () => fetchRentalAsset(key),
    enabled: Boolean(key),
  });

  const resolvedAsset = detailQuery.data ?? asset;
  const detailHref = rentalHref(key);
  const [submitState, setSubmitState] = useState<RentalSubmitState>({
    showSubmit: true,
    label: "Confirm booking",
    disabled: false,
    loading: false,
    loadingLabel: "Creating rental booking…",
  });

  return (
    <aside
      aria-labelledby="rental-drawer-heading"
      className="flex h-full min-h-0 w-full lg:w-[400px] shrink-0 flex-col overflow-hidden rounded-t-3xl sm:rounded-[1.25rem] border border-[#e7e2da] bg-white shadow-xl xl:shadow-sm"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e7e2da] px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge tone="brand" className="inline-flex items-center gap-1 text-[10px] font-bold">
              <Wrench className="size-3" />
              Verified Tool
            </Badge>
            <Badge tone="success" className="inline-flex items-center gap-1 text-[10px] font-bold">
              <ShieldCheck className="size-3" />
              Deposit Protected
            </Badge>
          </div>
          <h2
            id="rental-drawer-heading"
            className="text-base font-extrabold leading-snug tracking-tight text-navy-900 line-clamp-2"
          >
            {resolvedAsset.title}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Offered by <strong className="text-navy-900">{resolvedAsset.partner_name}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close rental details"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition-colors hover:bg-[#FAF9F7] hover:text-navy-900"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      {/* Scrollable Gallery + Booking Panel */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        {resolvedAsset.media && resolvedAsset.media.length > 0 ? (
          <StayImageGallery
            media={resolvedAsset.media}
            title={resolvedAsset.title}
            fit="contain"
          />
        ) : null}

        {resolvedAsset.location_text ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#e7e2da] bg-[#FAF9F7] px-3 py-2 text-[12px] text-text-secondary">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#EA580C]" />
            <span>
              Pickup from <strong className="text-navy-900">{resolvedAsset.location_text}</strong>
              {resolvedAsset.delivery_available ? " · Delivery available" : ""}
            </span>
          </div>
        ) : null}

        {resolvedAsset.description ? (
          <div>
            <h3 className="text-[13px] font-extrabold text-navy-900">About this equipment</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-text-secondary line-clamp-4">
              {resolvedAsset.description}
            </p>
          </div>
        ) : null}

        {detailQuery.isLoading ? (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : (
          <RentalBookPanel
            asset={resolvedAsset}
            formId={RENTAL_DRAWER_FORM_ID}
            hideSubmitButton
            onSubmitStateChange={setSubmitState}
          />
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[#e7e2da] bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 shrink-0">
            <span className="block text-[11px] font-semibold text-text-secondary">
              Daily rate
            </span>
            <span data-numeric className="mt-0.5 block whitespace-nowrap text-xl font-extrabold tabular-nums text-navy-900">
              {formatPaise(resolvedAsset.daily_rate_paise)}/day
            </span>
          </div>
          {!detailQuery.isLoading && submitState.showSubmit ? (
            <button
              type="submit"
              form={RENTAL_DRAWER_FORM_ID}
              disabled={submitState.disabled}
              className="inline-flex min-h-11 min-w-[8.5rem] max-w-[60%] cursor-pointer items-center justify-center rounded-xl bg-navy-900 px-4 py-2 text-center text-[13px] sm:text-sm font-bold leading-tight text-white shadow-xs transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitState.loading ? submitState.loadingLabel : submitState.label}
            </button>
          ) : null}
        </div>
        <Link
          href={detailHref}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-navy-800 hover:text-action"
        >
          See full equipment details
          <span aria-hidden>→</span>
        </Link>
      </div>
    </aside>
  );
}

