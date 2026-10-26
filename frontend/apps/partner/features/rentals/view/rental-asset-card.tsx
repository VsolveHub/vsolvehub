"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, formatMoney, useToast } from "@vsolve/ui";
import { Camera, MapPin, Pencil, Play, Power, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { canSubmitAsset } from "@/features/rentals/booking-actions";
import {
  deletePartnerRentalAsset,
  partnerRentalAssetAction,
  type RentalAsset,
} from "@/features/rentals/queries";

export function RentalAssetCard({
  asset,
  onEdit,
}: {
  asset: RentalAsset;
  onEdit: (asset: RentalAsset) => void;
}) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-rentals", "assets"] });
  };

  const act = useMutation({
    mutationFn: (action: "pause" | "resume" | "submit") =>
      partnerRentalAssetAction(asset.id, action),
    onSuccess: (_, action) => {
      setActionError(null);
      invalidate();
      notify(
        action === "pause"
          ? "Ad disabled. It will no longer show in customer search."
          : action === "resume"
            ? "Ad enabled. It is now live for bookings."
            : "Item submitted for review.",
        "success",
      );
    },
    onError: (err: unknown) => setActionError(friendlyErrorMessage(err)),
  });

  const archive = useMutation({
    mutationFn: () => deletePartnerRentalAsset(asset.id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
      notify("Ad archived.", "info");
    },
    onError: (err: unknown) => setActionError(friendlyErrorMessage(err)),
  });

  const photos = asset.media ?? [];
  const thumb = photos[0]?.url || photos[0]?.image_url;
  const qty = asset.quantity_available;
  const isLive = asset.public_state === "PUBLISHED";
  const isPaused = asset.public_state === "PAUSED";
  const isDraft = asset.public_state === "DRAFT";
  const isRejected = asset.public_state === "REJECTED";
  const isPendingReview = asset.public_state === "PENDING_REVIEW";
  const canEdit = asset.moderation_status !== "REMOVED" && asset.public_state !== "RETIRED";

  const locationSummary =
    [asset.pickup_area, asset.pickup_city].filter(Boolean).join(", ") ||
    asset.location_text ||
    asset.pickup_address_line;

  return (
    <Card padding="none" className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] w-full bg-surface-sunken">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-sm text-text-muted">
            <Camera className="size-6 text-text-muted/60" aria-hidden />
            <span>No photos</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          {isLive ? (
            <Badge tone="success">Live</Badge>
          ) : isPaused ? (
            <Badge tone="warning">Paused / Disabled</Badge>
          ) : isRejected ? (
            <Badge tone="danger">Changes requested</Badge>
          ) : isPendingReview ? (
            <Badge tone="neutral">Under review</Badge>
          ) : (
            <Badge tone="neutral">Draft</Badge>
          )}

          {typeof qty === "number" ? <Badge tone="neutral">Qty {qty}</Badge> : null}
        </div>

        {photos.length > 1 ? (
          <div className="absolute bottom-2 left-2 rounded-full bg-navy-900/75 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-xs">
            {photos.length} photos
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-extrabold text-navy-900">
              {formatMoney(asset.daily_rate_paise)}{" "}
              <span className="text-xs font-semibold text-text-secondary">/ day</span>
            </p>
            {asset.deposit_paise > 0 ? (
              <span className="text-xs font-medium text-text-secondary">
                {formatMoney(asset.deposit_paise)} deposit
              </span>
            ) : null}
          </div>

          <h3 className="line-clamp-2 text-base font-bold text-navy-900">{asset.title}</h3>

          {locationSummary ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <MapPin className="size-3.5 shrink-0 text-text-muted" aria-hidden />
              <span className="truncate">{locationSummary}</span>
            </p>
          ) : null}

          {asset.delivery_available ? (
            <div className="pt-0.5">
              <Badge tone="neutral">Delivery on request</Badge>
            </div>
          ) : null}

          {/* Contextual Status Alerts */}
          {isPaused ? (
            <p className="mt-1 rounded-control bg-warning-surface/70 px-2.5 py-1.5 text-xs text-warning-text">
              Disabled by you. Item is hidden from customer search; existing bookings continue as planned.
            </p>
          ) : null}

          {isDraft ? (
            <p className="mt-1 rounded-control bg-surface-sunken px-2.5 py-1.5 text-xs text-text-secondary">
              Draft. Add photos, pickup address and pickup hours to submit for review.
            </p>
          ) : null}

          {isRejected ? (
            <p className="mt-1 rounded-control bg-danger-surface px-2.5 py-1.5 text-xs text-danger-text">
              Admin requested updates before this item can go live. Edit this ad to make updates and submit for review.
            </p>
          ) : null}

          {isPendingReview ? (
            <p className="mt-1 rounded-control bg-surface-sunken px-2.5 py-1.5 text-xs text-text-secondary">
              Submitted for review. It goes live once approved by Operations.
            </p>
          ) : null}

          {actionError ? <p className="mt-1 text-xs text-danger-text">{actionError}</p> : null}
        </div>

        {/* Action Buttons Row */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
          {canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => onEdit(asset)}>
              <Pencil className="mr-1.5 size-3.5" aria-hidden />
              Edit ad
            </Button>
          ) : null}

          {isLive ? (
            <Button
              size="sm"
              variant="outline"
              disabled={act.isPending}
              onClick={() => act.mutate("pause")}
            >
              <Power className="mr-1.5 size-3.5 text-warning-text" aria-hidden />
              {act.isPending ? "Pausing…" : "Disable ad"}
            </Button>
          ) : null}

          {isPaused ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={act.isPending}
              onClick={() => act.mutate("resume")}
            >
              <Play className="mr-1.5 size-3.5 text-action" aria-hidden />
              {act.isPending ? "Resuming…" : "Enable ad"}
            </Button>
          ) : null}

          {canSubmitAsset(asset.moderation_status) ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={act.isPending}
              onClick={() => act.mutate("submit")}
            >
              <Send className="mr-1.5 size-3.5" aria-hidden />
              {act.isPending ? "Submitting…" : "Submit for review"}
            </Button>
          ) : null}

          {asset.public_state !== "RETIRED" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={archive.isPending}
              onClick={() => {
                if (window.confirm("Archive this rental ad? It will be removed from your catalog.")) {
                  archive.mutate();
                }
              }}
              className="ml-auto text-text-muted hover:text-danger-text"
              aria-label="Archive ad"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
