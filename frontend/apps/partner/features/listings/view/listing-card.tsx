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
  Briefcase,
  IndianRupee,
} from "lucide-react";
import { Badge, Card, StatusChip, formatMoney } from "@vsolve/ui";

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
  let displayPay = "";
  if (listing.salary_min_paise && listing.salary_min_paise > 0) {
    const minStr = formatMoney(listing.salary_min_paise);
    if (listing.salary_max_paise && listing.salary_max_paise > listing.salary_min_paise) {
      displayPay = `${minStr} - ${formatMoney(listing.salary_max_paise)}`;
    } else {
      displayPay = minStr;
    }
    if (listing.salary_period) {
      displayPay += ` / ${listing.salary_period.toLowerCase()}`;
    }
  } else if (listing.salary_display) {
    displayPay = listing.salary_display;
  } else if (listing.structured_fields?.salary_range) {
    displayPay = String(listing.structured_fields.salary_range);
  }

  const exp = listing.structured_fields?.experience_years 
    ? String(listing.structured_fields.experience_years) 
    : "";

  return (
    <Card className="p-5 transition duration-fast hover:border-line-strong hover:shadow-raised">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-navy-900">{listing.title}</h2>
          </div>
          
          {listing.service_name && (
            <div className="text-sm font-semibold text-text-secondary">
              {listing.service_name} {listing.poster_name ? `· ${listing.poster_name}` : ""}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            {listing.location_text && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-text-muted" />
                {listing.location_text}
              </span>
            )}
            {exp && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="size-4 text-text-muted" />
                {exp}
              </span>
            )}
            {displayPay && (
              <span className="flex items-center gap-1.5">
                <IndianRupee className="size-4 text-text-muted" />
                {displayPay}
              </span>
            )}
          </div>

          <p className="line-clamp-2 text-sm text-text-secondary mt-2">
            {listing.description}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <StatusChip status={listing.status} category="listing" />
            
            {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
              <Badge tone="info">
                <CheckCircle2 className="size-3" /> Moderation Approved
              </Badge>
            )}
            
            <span className="text-xs text-text-muted">
              Created {new Date(listing.created_at).toLocaleDateString()}
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
            <Users className="size-3.5 text-action" />
            View Applicants ({listing.application_count})
          </Link>

          {["DRAFT", "PUBLISHED"].includes(listing.status) && (
            <button
              type="button"
              onClick={() => onStartEdit(listing)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text-secondary transition hover:border-line-strong hover:bg-surface-hover"
            >
              <Pencil className="size-3.5 text-text-muted" /> Edit Job
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
