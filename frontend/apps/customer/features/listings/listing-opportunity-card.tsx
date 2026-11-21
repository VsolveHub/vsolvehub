"use client";

import Link from "next/link";
import { Check, Heart, MapPin } from "lucide-react";

import { useSavedItems } from "@/features/part-a";
import { listingHref } from "@/lib/routes";
import { formatMoneyText } from "@vsolve/ui";
import { listingFields, type Listing } from "./queries";
import { resolveCategoryTone } from "./view/career-tones";
import {
  EmployerMark,
  VerifiedBadge,
  employerDetailLine,
  employerName,
  listingEmployer,
} from "./view/employer-identity";
import { MATCH_LOOK, type JobMatch } from "./seeker-queries";

export interface ListingOpportunityCardProps {
  listing: Listing;
  density?: "comfortable" | "compact";
  isApplied?: boolean;
  onApply?: (listing: Listing) => void;
  match?: JobMatch;
}

export function ListingOpportunityCard({
  listing,
  density = "comfortable",
  isApplied = false,
  onApply,
  match,
}: ListingOpportunityCardProps) {
  const saved = useSavedItems("listing");
  const isSaved = saved.isSaved(listing.id);
  const fields = listingFields(listing.structured_fields);
  const matchLook = match ? ((match.level ? MATCH_LOOK[match.level] : null) ?? MATCH_LOOK.OTHER!) : null;

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
    listing.city ||
    "Hyderabad, Telangana";

  // Experience
  const rawExperience =
    fields.experience_years ||
    fields.experience ||
    fields.experience_band ||
    listing.experience_band;
  const experienceText = rawExperience
    ? String(rawExperience)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Experience on request";

  // Employment Type (e.g. Full time)
  const rawRoleType =
    fields.role_type ||
    fields.employment_type ||
    fields.job_type ||
    listing.job_type ||
    "Full time";
  const roleTypeText = String(rawRoleType)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Shift (e.g. Day shift)
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

  const employer = listingEmployer(listing);
  const employerDetail = employerDetailLine(employer);
  const toneConfig = resolveCategoryTone(listing.job_category || (fields.category as string), listing.title);

  const isUrgent = Boolean(listing.urgency === "URGENT" || fields.urgent || fields.is_featured);
  const isRemoteOrHybrid =
    listing.work_mode === "HYBRID" ||
    listing.work_mode === "REMOTE" ||
    listing.work_mode === "WORK_FROM_HOME" ||
    String(fields.work_mode || "").toLowerCase().includes("hybrid") ||
    String(fields.work_mode || "").toLowerCase().includes("remote");

  const workModeLabel =
    listing.work_mode === "HYBRID" || String(fields.work_mode || "").toLowerCase().includes("hybrid")
      ? "Hybrid"
      : isRemoteOrHybrid
      ? "Remote"
      : null;

  const isCompact = density === "compact";
  const detailHref = listingHref(listing.slug);

  return (
    <article
      data-card={listing.id}
      className={`group relative flex flex-col md:flex-row items-start justify-between gap-4 rounded-[16px] border border-[#E8E3DE] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(21,38,77,.05),0_4px_14px_rgba(21,38,77,.05)] hover:border-[#FF7900]/60 hover:shadow-[0_6px_20px_rgba(21,38,77,.09)] transition-all duration-200 cursor-pointer ${
        isCompact ? "p-3.5 md:p-4 gap-3.5" : "p-4 md:p-5 gap-4"
      }`}
    >
      {/* Stretched Link: clicking anywhere on the card navigates to /listings/[slug] */}
      <Link
        href={detailHref}
        prefetch={false}
        aria-label={`View ${listing.title} details`}
        className="absolute inset-0 z-0 rounded-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF7900]"
      />

      {/* Left: the employer's logo, or the first letter of its name */}
      <div
        className={`rounded-[13px] grid place-items-center overflow-hidden font-extrabold border shrink-0 relative z-1 pointer-events-none ${
          toneConfig.badgeClass
        } ${isCompact ? "size-10 text-xs" : "size-12 text-sm"}`}
      >
        <EmployerMark employer={employer} />
      </div>

      {/* Middle: Job Details */}
      <div className="flex-1 min-w-0 relative z-1 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-extrabold text-[#15264D] group-hover:text-[#FF7900] tracking-tight leading-snug transition-colors line-clamp-1 ${
              isCompact ? "text-[16px]" : "text-[17px] md:text-[18px]"
            }`}
          >
            {listing.title}
          </span>

          {match && matchLook ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
              <span className="font-black text-[#1E1B4B]">{match.score}%</span>
              <span className="text-[#4338CA]">{matchLook.label}</span>
            </span>
          ) : null}

          {isUrgent ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#FFF1E6] text-[#B54700] border border-[#FFD1A8]">
              Urgent hiring
            </span>
          ) : null}

          {workModeLabel ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
              {workModeLabel}
            </span>
          ) : null}
        </div>

        {/* Company and Verified Badge */}
        <p className="mt-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-[#15264D]">
          <span className="truncate">{employerName(employer)}</span>
          <VerifiedBadge
            employer={employer}
            className="text-[12px] font-bold text-[#047857] shrink-0 ml-1"
          />
        </p>
        {employerDetail ? (
          <p className="mt-0.5 text-[12.5px] text-[#5F6B7E] font-medium truncate">{employerDetail}</p>
        ) : null}

        {/* Location Row */}
        <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-[#15264D]">
          <MapPin className="size-3.5 text-[#B54700] shrink-0" />
          <span className="truncate">{locationText}</span>
        </p>

        {/* Metadata: Type, Shift, Experience */}
        <p className="mt-1 text-[13px] text-[#5F6B7E] font-medium truncate">
          {roleTypeText} · {shiftText} · {experienceText}
        </p>
      </div>

      {/* Right: Pay & Action Controls */}
      <div className="w-full md:w-auto flex md:flex-col items-center md:items-end justify-between md:justify-start gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-[#E8E3DE] shrink-0 relative z-10">
        <div className="text-left md:text-right pointer-events-none">
          <strong className="block text-[16px] md:text-[17px] font-extrabold text-[#047857] tracking-tight leading-tight whitespace-nowrap">
            {payText}
          </strong>
          <span className="text-[12px] text-[#5F6B7E] font-medium">per month</span>
        </div>

        {/* Action Controls: Heart Save Button + Primary Apply Button */}
        <div className="flex items-center gap-2">
          {/* Heart Save Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              saved.toggle(listing.id);
            }}
            aria-label={isSaved ? "Remove from saved" : "Save this job"}
            className={`size-[38px] rounded-xl grid place-items-center border transition relative z-20 ${
              isSaved
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-[#E8E3DE] bg-white text-[#5F6B7E] hover:border-rose-300 hover:text-rose-600"
            }`}
          >
            <Heart className={`size-4 ${isSaved ? "fill-current" : ""}`} />
          </button>

          {/* Apply Button (Opens Drawer) */}
          {isApplied ? (
            <button
              type="button"
              disabled
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[13.5px] font-bold text-[#047857] cursor-default whitespace-nowrap relative z-20"
            >
              <Check className="size-4" />
              Applied
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onApply) {
                  onApply(listing);
                }
              }}
              className="inline-flex items-center justify-center h-[38px] px-5 rounded-xl bg-[#FF7900] hover:bg-[#ff8a1f] active:bg-[#e66d00] text-[13.5px] font-extrabold text-[#15264D] transition shadow-xs whitespace-nowrap relative z-20"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
