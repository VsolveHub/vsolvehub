import Link from "next/link";
import {
  Briefcase,
  Calendar,
  Coins,
  Flame,
  Heart,
  MapPin,
  Sun,
} from "lucide-react";
import { Badge, formatMoneyText } from "@vsolve/ui";
import { listingHref } from "@/lib/routes";

import { listingFields, type Listing } from "../queries";
import { getCareerImage } from "../career-images";

export interface ListingRowProps {
  listing: Listing;
}

export function ListingRow({ listing }: ListingRowProps) {
  const fields = listingFields(listing.structured_fields);
  const { url: heroImage, fallback } = getCareerImage(listing);

  // Pay calculation
  const rawPay = fields.pay_range || fields.salary_range || fields.compensation;
  let payText = "Pay on request";
  if (rawPay) {
    payText = formatMoneyText(String(rawPay));
  } else if (listing.salary_display) {
    payText = formatMoneyText(listing.salary_display);
  }

  // Location
  const locationText =
    listing.location_text ||
    (fields.location as string) ||
    (fields.city as string) ||
    "Suryapet";

  // Experience
  const rawExperience =
    fields.experience_years ||
    fields.experience ||
    fields.experience_band ||
    fields.experience_required;
  const experienceText = rawExperience
    ? String(rawExperience)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Experience on request";

  // Role Type
  const rawRoleType =
    fields.role_type ||
    fields.employment_type ||
    fields.job_type ||
    listing.job_type ||
    "Full time";
  const roleTypeText = String(rawRoleType)
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/^full\s*time$/i, "Full time")
    .replace(/^part\s*time$/i, "Part time")
    .replace(/^contract$/i, "Contract")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Shift / Mode
  const rawShift =
    fields.shift ||
    fields.work_mode ||
    listing.shift ||
    listing.work_mode ||
    "Day shift";
  const shiftText = String(rawShift)
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/^day(\s*shift)?$/i, "Day shift")
    .replace(/^night(\s*shift)?$/i, "Night shift")
    .replace(/^rotational(\s*shift)?$/i, "Rotational shift")
    .replace(/^general(\s*shift)?$/i, "General shift")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const employerName = listing.poster_name || "Apex Staffing Solutions";

  return (
    <article className="group relative flex flex-col md:flex-row w-full min-h-[220px] md:h-[230px] rounded-[24px] border border-[#E8E3DE] bg-[#FFFFFF] shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] hover:border-[#ded8d2] transition-all duration-300 overflow-hidden">
      {listing.is_premium && (
        <div className="absolute top-4 right-16 z-10">
          <Badge tone="action" dot>
            <Flame className="size-3.5 text-signal-600" />
            Featured
          </Badge>
        </div>
      )}

      {/* Left Section: Image (~20-21% width, 100% card height, rounded top-left and bottom-left) */}
      <div className="relative w-full md:w-[21%] md:min-w-[200px] md:max-w-[240px] h-52 md:h-auto self-stretch shrink-0 overflow-hidden bg-slate-100">
        <Link href={listingHref(listing.slug)} className="block size-full" tabIndex={-1}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={listing.title}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              if (e.currentTarget.src !== fallback) {
                e.currentTarget.src = fallback;
              }
            }}
          />
        </Link>
      </div>

      {/* Right Section: Job Information (~79-80% width) */}
      <div className="flex-1 flex flex-col justify-between py-6 px-6 md:py-7 md:pl-10 md:pr-8 min-w-0">
        <div>
          {/* Top Row: Job Title & Heart Icon */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link href={listingHref(listing.slug)} className="block focus-visible:outline-none">
                <h2 className="text-[26px] md:text-[28px] font-bold text-[#15264D] tracking-tight leading-tight hover:text-[#FF7900] transition-colors truncate">
                  {listing.title}
                </h2>
              </Link>

              {/* Second Row: Company Name, Separator, Verified Badge, and Label */}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[15px] md:text-[16px] font-semibold text-[#15264D]/90 truncate">
                  {employerName}
                </span>
                <span className="text-slate-400 font-bold" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px] md:text-[14px] text-[#555555] font-normal whitespace-nowrap">
                  <svg
                    className="size-4 shrink-0 text-[#FF7900] fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Verified employer</span>
                </span>
              </div>
            </div>

            {/* Favorite / Heart Icon */}
            <div className="text-[#2D3748] hover:text-rose-500 focus-visible:outline-none transition-colors p-1 shrink-0">
              <Heart className="size-[26px] md:size-[28px] text-[#2D3748] hover:text-rose-500 transition-colors" strokeWidth={1.3} />
            </div>
          </div>

          {/* Third Row: Job Metadata in One Horizontal Row with Subtle Vertical Separators */}
          <div className="mt-3.5 flex flex-wrap md:flex-nowrap items-center gap-x-3.5 gap-y-2 text-[14px] text-[#333333] font-medium">
            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <MapPin className="size-[18px] text-[#2D3748] shrink-0" strokeWidth={1.4} />
              <span>{locationText}</span>
            </div>

            <span
              className="hidden md:inline-block h-4 w-px bg-[#E8E3DE] shrink-0"
              aria-hidden="true"
            />

            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <Coins className="size-[18px] text-[#2D3748] shrink-0" strokeWidth={1.4} />
              <span>{payText}</span>
            </div>

            <span
              className="hidden md:inline-block h-4 w-px bg-[#E8E3DE] shrink-0"
              aria-hidden="true"
            />

            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <Briefcase className="size-[18px] text-[#2D3748] shrink-0" strokeWidth={1.4} />
              <span>{experienceText}</span>
            </div>

            <span
              className="hidden md:inline-block h-4 w-px bg-[#E8E3DE] shrink-0"
              aria-hidden="true"
            />

            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <Calendar className="size-[18px] text-[#2D3748] shrink-0" strokeWidth={1.4} />
              <span>{roleTypeText}</span>
            </div>

            <span
              className="hidden md:inline-block h-4 w-px bg-[#E8E3DE] shrink-0"
              aria-hidden="true"
            />

            <div className="inline-flex items-center gap-2 whitespace-nowrap">
              <Sun className="size-[18px] text-[#2D3748] shrink-0" strokeWidth={1.4} />
              <span>{shiftText}</span>
            </div>
          </div>
        </div>

        {/* Bottom-Right Section: Large Rectangular Orange Apply Button */}
        <div className="mt-2 flex items-center justify-end">
          <Link
            href={`${listingHref(listing.slug)}#apply-panel`}
            className="inline-flex items-center justify-center w-[114px] h-[46px] rounded-xl bg-[#FF7900] hover:bg-[#e66d00] active:bg-[#cc6100] text-[16px] font-bold text-white shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7900] focus-visible:ring-offset-2"
          >
            Apply
          </Link>
        </div>
      </div>
    </article>
  );
}
