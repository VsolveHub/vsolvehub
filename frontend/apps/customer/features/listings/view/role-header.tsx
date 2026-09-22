import Link from "next/link";
import { ArrowLeft, Building, Clock, FileCheck2, Flame, MapPin } from "lucide-react";
import { Badge } from "@vsolve/ui";
import type { ListingDetail } from "../queries";

export interface RoleHeaderProps {
  listing: ListingDetail;
}

export function RoleHeader({ listing }: RoleHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          href="/listings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition hover:text-text"
        >
          <ArrowLeft className="size-4" /> Back to open listings
        </Link>
        <Link
          href="/listings/my-applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-link hover:underline"
        >
          <FileCheck2 className="size-3.5" /> My Applications
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken border border-line px-3 py-1 text-xs font-semibold text-text-secondary">
            <Building className="size-3.5 text-text-muted" />
            {listing.poster_name || "Verified Employer"}
          </span>
          {listing.is_premium && (
            <Badge tone="action" dot>
              <Flame className="size-3.5 text-signal-600" />
              Featured
            </Badge>
          )}
          {listing.published_at && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock className="size-3.5" />
              Published {new Date(listing.published_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
          {listing.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-text-muted" />
            {listing.location_text || "Location shared upon contact"}
          </span>
          <span className="text-line-strong">•</span>
          <span className="text-xs text-text-muted">
            {listing.application_count} {listing.application_count === 1 ? "applicant" : "applicants"} applied
          </span>
        </div>
      </div>
    </>
  );
}
