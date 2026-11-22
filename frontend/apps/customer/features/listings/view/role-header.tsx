import Link from "next/link";
import { ArrowLeft, Clock, FileCheck2, Flame, MapPin } from "lucide-react";
import { Badge, formatDate } from "@vsolve/ui";
import type { ListingDetail } from "../queries";
import {
  EmployerMark,
  VerifiedBadge,
  employerDetailLine,
  employerName,
  listingEmployer,
} from "./employer-identity";

export interface RoleHeaderProps {
  listing: ListingDetail;
}

export function RoleHeader({ listing }: RoleHeaderProps) {
  const employer = listingEmployer(listing);
  const employerDetail = employerDetailLine(employer);

  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          href="/listings"
          className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-text-muted transition hover:text-text"
        >
          <ArrowLeft className="size-4" /> Back to open listings
        </Link>
        <Link
          href="/listings/my-applications"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-text-link hover:underline"
        >
          <FileCheck2 className="size-3.5" /> My Applications
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-sunken border border-line py-1 pl-1 pr-3 text-xs font-semibold text-text-secondary">
            <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-[11px] font-extrabold text-text">
              <EmployerMark employer={employer} />
            </span>
            {employerName(employer)}
          </span>
          <VerifiedBadge employer={employer} className="text-xs font-semibold text-success-text" />
          {employerDetail ? <span className="text-xs text-text-muted">{employerDetail}</span> : null}
          {listing.is_premium && (
            <Badge tone="action" dot>
              <Flame className="size-3.5 text-signal-600" />
              Featured
            </Badge>
          )}
          {listing.published_at && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock className="size-3.5" />
              Published {formatDate(listing.published_at)}
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
