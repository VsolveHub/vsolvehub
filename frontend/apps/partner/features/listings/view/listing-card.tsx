import Link from "next/link";
import {
  Check,
  CheckCircle2,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import { Badge, Card, StatusChip } from "@vsolve/ui";

import type { PartnerListing } from "../queries";

export interface ListingCardProps {
  listing: PartnerListing;
  onStartEdit: (listing: PartnerListing) => void;
  onAction: (params: {
    id: string;
    next: "submit" | "publish" | "republish" | "close";
    reason?: string;
  }) => void;
  isActionPending: boolean;
}

export function ListingCard({
  listing,
  onStartEdit,
  onAction,
  isActionPending,
}: ListingCardProps) {
  return (
    <Card className="p-5 transition duration-fast hover:border-line-strong hover:shadow-raised">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={listing.status} category="listing" />

            {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
              <Badge tone="info">
                <CheckCircle2 className="size-3" /> Moderation Approved
              </Badge>
            )}

            {listing.service_name && (
              <span className="text-xs text-text-muted">• {listing.service_name}</span>
            )}

            <span className="text-xs text-text-muted">
              • Created {new Date(listing.created_at).toLocaleDateString()}
            </span>
          </div>

          <h2 className="text-lg font-bold text-text">{listing.title}</h2>
          <p className="line-clamp-2 text-sm text-text-secondary">{listing.description}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5 text-text-muted" />
              {listing.location_text || "Location on contact"}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="size-3.5 text-text-muted" />
              {listing.contact_phone}
            </span>
          </div>

          {listing.moderation_reason && (
            <div className="mt-2 rounded-control border border-warning-line bg-warning-surface p-2.5 text-xs text-warning-text">
              <span className="font-semibold">Moderation Note:</span> {listing.moderation_reason}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
          <Link
            href={`/listings/${listing.id}`}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text transition hover:border-line-strong hover:bg-surface-hover"
          >
            <Users className="size-3.5 text-text-muted" />
            View Leads ({listing.application_count})
          </Link>

          {["DRAFT", "PUBLISHED"].includes(listing.status) && (
            <button
              type="button"
              onClick={() => onStartEdit(listing)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text-secondary transition hover:border-line-strong hover:bg-surface-hover"
            >
              <Pencil className="size-3.5 text-text-muted" /> Edit Opening
            </button>
          )}

          {listing.status === "DRAFT" && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "submit" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control bg-action px-3.5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
            >
              <Send className="size-3.5" /> Submit for Review
            </button>
          )}

          {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "publish" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control bg-navy-900 px-3.5 py-2 text-xs font-semibold text-warm-0 transition hover:bg-navy-800 disabled:opacity-50"
            >
              <Check className="size-3.5" /> Publish Live
            </button>
          )}

          {listing.status === "PUBLISHED" && (
            <button
              type="button"
              onClick={() =>
                onAction({
                  id: listing.id,
                  next: "close",
                  reason: "Filled position or partner closed",
                })
              }
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-danger-line hover:text-danger-text hover:bg-danger-surface/20 disabled:opacity-50"
            >
              <XCircle className="size-3.5 text-text-muted" /> Close Listing
            </button>
          )}

          {["CLOSED", "EXPIRED"].includes(listing.status) && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "republish" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              <RotateCcw className="size-3.5 text-text-muted" /> Republish
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
