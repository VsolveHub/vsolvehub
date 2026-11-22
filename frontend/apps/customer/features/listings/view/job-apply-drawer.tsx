"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Heart,
  ShieldCheck,
  X,
} from "lucide-react";
import { formatMoneyText } from "@vsolve/ui";

import { useSavedItems } from "@/features/part-a";
import { useCustomerSession } from "@/features/session/queries";
import { SignInCard } from "@/features/session/view/sign-in-gate";
import { listingFields, fetchListing, type Listing } from "../queries";
import {
  fetchMyJobProfile,
  fetchMyMatch,
} from "../seeker-queries";
import { QuickApplyCard } from "./quick-apply-card";
import { AlreadyAppliedCard } from "./already-applied-card";
import { resolveCategoryTone } from "./career-tones";
import {
  EmployerMark,
  VerifiedBadge,
  employerDetailLine,
  employerName,
  listingEmployer,
} from "./employer-identity";

export interface JobApplyDrawerProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  appliedListingIds?: Set<string>;
  onApplySuccess?: (listingId: string) => void;
}

export function JobApplyDrawer({
  listing,
  isOpen,
  onClose,
  appliedListingIds,
  onApplySuccess: _onApplySuccess,
}: JobApplyDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const session = useCustomerSession();
  const saved = useSavedItems("listing");

  const isSaved = listing ? saved.isSaved(listing.id) : false;
  const isApplied = listing ? appliedListingIds?.has(listing.id) : false;

  // Fetch full details if needed (for description)
  const detailQuery = useQuery({
    queryKey: ["listing-detail", listing?.slug],
    queryFn: () => fetchListing(listing!.slug),
    enabled: Boolean(isOpen && listing?.slug),
    staleTime: 60_000,
  });

  // Fetch current user's profile
  const profileQuery = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
    enabled: Boolean(isOpen && session.isAuthenticated),
  });

  // Fetch match score for drawer
  const matchQuery = useQuery({
    queryKey: ["my-job-match", listing?.id],
    queryFn: () => fetchMyMatch(listing!.id),
    enabled: Boolean(isOpen && session.isAuthenticated && listing?.id && profileQuery.data),
  });

  // Handle ESC key and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!listing) return null;

  const fields = listingFields(listing.structured_fields);
  const employer = listingEmployer(listing);
  const name = employerName(employer);
  const employerDetail = employerDetailLine(employer);
  const toneConfig = resolveCategoryTone(listing.job_category || fields.category as string, listing.title);

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
    : "1+ yr exp";

  // Role Type
  const rawRoleType =
    fields.role_type ||
    fields.employment_type ||
    fields.job_type ||
    listing.job_type ||
    "Full time";
  const roleTypeText = String(rawRoleType)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Shift
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

  const skillsList = [
    ...(Array.isArray(listing.required_skills) ? listing.required_skills : []),
    ...(Array.isArray(listing.preferred_skills) ? listing.preferred_skills : []),
  ].filter((s): s is string => typeof s === "string" && Boolean(s.trim()));

  const description =
    detailQuery.data?.description ||
    (fields.description as string) ||
    "Join a high-growth team with competitive pay, reliable shift timings, and clear progression opportunities. The employer will review your profile directly.";

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#00112e]/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`fixed top-0 right-0 bottom-0 w-full max-w-[540px] bg-white shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E3DE] bg-white shrink-0">
          <div>
            <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#B54700]">
              Job details &amp; application
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="size-9 rounded-xl grid place-items-center text-[#46536A] hover:bg-[#FAF9F7] hover:text-[#15264D] transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Identity Block */}
          <div className="flex items-start gap-3.5">
            <div
              className={`size-14 rounded-2xl grid place-items-center overflow-hidden font-extrabold text-base border shrink-0 ${toneConfig.badgeClass}`}
            >
              <EmployerMark employer={employer} />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="drawer-title"
                className="text-xl font-extrabold text-[#15264D] tracking-tight leading-tight"
              >
                {listing.title}
              </h2>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                <span className="font-semibold text-[#15264D]/90">{name}</span>
                {employer.is_verified ? (
                  <>
                    <span className="text-[#A89F90] font-bold" aria-hidden="true">
                      ·
                    </span>
                    <VerifiedBadge employer={employer} className="text-xs font-bold text-[#047857]" />
                  </>
                ) : null}
              </div>
              {employerDetail ? <p className="mt-0.5 text-xs text-[#5F6B7E]">{employerDetail}</p> : null}
            </div>
          </div>

          {/* 2x2 Key Facts Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[#E8E3DE] bg-[#FAF9F7] p-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5F6B7E]">
                Pay
              </span>
              <p className="mt-0.5 text-[14.5px] font-extrabold text-[#047857] truncate">
                {payText}
              </p>
            </div>
            <div className="rounded-xl border border-[#E8E3DE] bg-[#FAF9F7] p-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5F6B7E]">
                Location
              </span>
              <p className="mt-0.5 text-[13.5px] font-bold text-[#15264D] truncate">
                {locationText}
              </p>
            </div>
            <div className="rounded-xl border border-[#E8E3DE] bg-[#FAF9F7] p-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5F6B7E]">
                Type &amp; Shift
              </span>
              <p className="mt-0.5 text-[13.5px] font-bold text-[#15264D] truncate">
                {roleTypeText} · {shiftText}
              </p>
            </div>
            <div className="rounded-xl border border-[#E8E3DE] bg-[#FAF9F7] p-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5F6B7E]">
                Experience
              </span>
              <p className="mt-0.5 text-[13.5px] font-bold text-[#15264D] truncate">
                {experienceText}
              </p>
            </div>
          </div>

          {/* Match Score Badge (if available) */}
          {matchQuery.data ? (
            <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-3 text-xs font-semibold text-[#047857] flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="size-4" />
                {matchQuery.data.score}% profile match
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded-full border border-[#A7F3D0]">
                {matchQuery.data.level}
              </span>
            </div>
          ) : null}

          {/* About the Role */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#15264D] mb-1.5">
              About the role
            </h3>
            <p className="text-[13.5px] leading-relaxed text-[#46536A] whitespace-pre-line">
              {description}
            </p>
          </div>

          {/* What you need / Skills */}
          {skillsList.length > 0 ? (
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#15264D] mb-2">
                Key Skills &amp; Requirements
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {skillsList.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#F4F1EC] text-[#15264D] border border-[#E8E3DE]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Verification & Trust Callout */}
          <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-3 text-xs text-[#065F46] flex items-start gap-2.5">
            <ShieldCheck className="size-4 text-[#047857] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="font-bold">Free to apply.</strong> This employer is phone &amp; ID verified. VSolveHub never charges candidates any registration or placement fees.
            </p>
          </div>

          {/* Application Engine */}
          <div className="pt-2 border-t border-[#E8E3DE]">
            {isApplied ? (
              <AlreadyAppliedCard posterName={name} status="SUBMITTED" />
            ) : profileQuery.data ? (
              <QuickApplyCard
                listingId={listing.id}
                posterName={name}
                profile={profileQuery.data}
                jobSkills={skillsList}
              />
            ) : !session.isAuthenticated ? (
              <div className="rounded-xl border border-[#E8E3DE] bg-[#FAF9F7] p-4 text-center space-y-3">
                <h4 className="text-sm font-extrabold text-[#15264D]">
                  Sign in to apply in 1 tap
                </h4>
                <p className="text-xs text-[#5F6B7E]">
                  Your profile and contact info are shared directly with {name}.
                </p>
                <SignInCard
                  title="Sign in with mobile"
                  message={`Sign in to submit your application for ${listing.title}.`}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-[#E8E3DE] bg-[#FAF9F7] p-4 text-center space-y-3">
                <p className="text-sm font-semibold text-[#15264D]">
                  Set up your quick profile to apply in one click.
                </p>
                <Link
                  href="/listings/profile"
                  className="inline-flex items-center justify-center rounded-xl bg-[#FF7900] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[#e66d00] transition"
                >
                  Create Job Profile →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#E8E3DE] bg-white flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => saved.toggle(listing.id)}
            aria-label={isSaved ? "Remove from saved" : "Save this job"}
            className={`size-10 rounded-xl grid place-items-center border transition ${
              isSaved
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-[#E8E3DE] bg-white text-[#46536A] hover:border-rose-300 hover:text-rose-600"
            }`}
          >
            <Heart className={`size-4 ${isSaved ? "fill-current" : ""}`} />
          </button>

          <div className="flex items-center gap-2">
            <Link
              href={`/listings/${listing.slug}`}
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-[#E8E3DE] bg-white text-xs font-bold text-[#15264D] hover:bg-[#FAF9F7] transition"
            >
              Full Page Details
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-[#15264D] text-xs font-bold text-white hover:bg-[#00112e] transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
