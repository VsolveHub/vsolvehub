import Link from "next/link";
import { ArrowLeft, Building, Clock, FileCheck2, Flame, MapPin } from "lucide-react";
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to open listings
        </Link>
        <Link
          href="/listings/my-applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
        >
          <FileCheck2 className="h-3.5 w-3.5" /> My Applications
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            <Building className="h-3.5 w-3.5 text-slate-500" />
            {listing.poster_name || "Verified Employer"}
          </span>
          {listing.is_premium && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              <Flame className="h-3.5 w-3.5 text-amber-600" />
              Featured
            </span>
          )}
          {listing.published_at && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              Published {new Date(listing.published_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          {listing.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-slate-400" />
            {listing.location_text || "Location shared upon contact"}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-500">
            {listing.application_count} {listing.application_count === 1 ? "applicant" : "applicants"} applied
          </span>
        </div>
      </div>
    </>
  );
}
