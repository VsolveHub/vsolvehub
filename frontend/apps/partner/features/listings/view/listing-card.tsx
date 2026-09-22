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

import { STATUS_BADGES } from "../model";
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
  const cfg = STATUS_BADGES[listing.public_state || listing.status] || {
    label: listing.status,
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-slate-300">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
            >
              {cfg.label}
            </span>

            {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                <CheckCircle2 className="h-3 w-3" /> Moderation Approved
              </span>
            )}

            {listing.service_name && (
              <span className="text-xs text-slate-400">• {listing.service_name}</span>
            )}

            <span className="text-xs text-slate-400">
              • Created {new Date(listing.created_at).toLocaleDateString()}
            </span>
          </div>

          <h2 className="text-lg font-bold text-slate-950">{listing.title}</h2>
          <p className="line-clamp-2 text-sm text-slate-600">{listing.description}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {listing.location_text || "Location on contact"}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              {listing.contact_phone}
            </span>
          </div>

          {listing.moderation_reason && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <span className="font-semibold">Moderation Note:</span> {listing.moderation_reason}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
          <Link
            href={`/listings/${listing.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            View Leads ({listing.application_count})
          </Link>

          {["DRAFT", "PUBLISHED"].includes(listing.status) && (
            <button
              type="button"
              onClick={() => onStartEdit(listing)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5 text-slate-500" /> Edit Opening
            </button>
          )}

          {listing.status === "DRAFT" && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "submit" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              <Send className="h-3.5 w-3.5" /> Submit for Review
            </button>
          )}

          {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "publish" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <Check className="h-3.5 w-3.5" /> Publish Live
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              <XCircle className="h-3.5 w-3.5 text-slate-400" /> Close Listing
            </button>
          )}

          {["CLOSED", "EXPIRED"].includes(listing.status) && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "republish" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Republish
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
