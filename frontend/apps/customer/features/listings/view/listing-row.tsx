import Link from "next/link";
import {
  BriefcaseBusiness,
  Building,
  Clock,
  Coins,
  Flame,
  MapPin,
  Users,
} from "lucide-react";

import { listingFields, type Listing } from "../queries";

export interface ListingRowProps {
  listing: Listing;
}

export function ListingRow({ listing }: ListingRowProps) {
  const fields = listingFields(listing.structured_fields);
  const payRange = fields.pay_range || fields.salary_range || fields.compensation;
  const roleType = fields.role_type || fields.employment_type;
  const experience = fields.experience_years || fields.experience;
  const shift = fields.shift || fields.work_mode;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={`group relative rounded-xl border p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        listing.is_premium
          ? "border-amber-300/80 bg-gradient-to-r from-amber-50/40 via-white to-white"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {listing.is_premium && (
        <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <Flame className="h-3.5 w-3.5 text-amber-600" />
          Featured
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2.5 flex-1 pr-16">
          {/* Employer and Location */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <Building className="h-3.5 w-3.5 text-slate-400" />
              {listing.poster_name || "Verified Employer"}
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1 text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {listing.location_text || "Location on application"}
            </span>
            {listing.published_at && (
              <>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Posted {new Date(listing.published_at).toLocaleDateString()}
                </span>
              </>
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold tracking-tight text-slate-950 group-hover:text-indigo-600 transition">
            {listing.title}
          </h2>

          {/* Description */}
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
            {listing.description}
          </p>

          {/* Badges / Structured Fields */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {payRange ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <Coins className="h-3.5 w-3.5 text-emerald-600" />
                {String(payRange)}
              </span>
            ) : null}

            {roleType ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                <BriefcaseBusiness className="h-3.5 w-3.5 text-slate-500" />
                {String(roleType)}
              </span>
            ) : null}

            {experience ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {String(experience)} Exp
              </span>
            ) : null}

            {shift ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {String(shift)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Right side stats */}
        <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-100">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            {listing.application_count}{" "}
            {listing.application_count === 1 ? "applicant" : "applicants"}
          </span>
          <span className="mt-auto hidden md:inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">
            View & Apply &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
