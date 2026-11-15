"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@vsolve/ui";
import { Sparkles, UserRound } from "lucide-react";

import {
  fetchJobsForYou,
  fetchMyJobProfile,
  type JobForYou,
  type JobProfile,
} from "../seeker-queries";
import { ListingOpportunityCard } from "../listing-opportunity-card";
import type { Listing } from "../queries";

export interface JobsForYouProps {
  profile?: JobProfile | null;
  isLoadingProfile?: boolean;
  jobs?: JobForYou[];
  isLoadingJobs?: boolean;
  density?: "comfortable" | "compact";
  appliedListingIds?: Set<string>;
  onApply?: (listing: Listing) => void;
}

/** "Jobs for you" for a seeker with a profile, or a nudge to make one. */
export function JobsForYou({
  profile: propProfile,
  isLoadingProfile: propIsLoadingProfile,
  jobs: propJobs,
  isLoadingJobs: propIsLoadingJobs,
  density = "comfortable",
  appliedListingIds,
  onApply,
}: JobsForYouProps = {}) {
  const profileQuery = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
    enabled: propProfile === undefined,
  });

  const profile = propProfile !== undefined ? propProfile : profileQuery.data;
  const isProfileLoading =
    propIsLoadingProfile !== undefined ? propIsLoadingProfile : profileQuery.isLoading;

  const jobsQuery = useQuery({
    queryKey: ["jobs-for-you"],
    queryFn: fetchJobsForYou,
    enabled: propJobs === undefined && Boolean(profile),
  });

  const rows = propJobs !== undefined ? propJobs : (jobsQuery.data ?? []);
  const isJobsLoading =
    propIsLoadingJobs !== undefined ? propIsLoadingJobs : jobsQuery.isLoading;

  if (isProfileLoading) return null;

  if (!profile) {
    return (
      <Card className="flex flex-col gap-3 border-action/40 bg-action-surface/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 size-5 shrink-0 text-action" aria-hidden />
          <div>
            <p className="font-bold text-navy-900">Make your job profile once</p>
            <p className="text-sm text-text-secondary">
              Tap the jobs and skills you have. We&apos;ll show matching jobs and you can apply in one tap.
            </p>
          </div>
        </div>
        <Link
          href="/listings/profile"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-action px-5 text-sm font-bold text-action-text"
        >
          Create profile
        </Link>
      </Card>
    );
  }

  if (rows.length === 0 && !isJobsLoading) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-base sm:text-lg font-extrabold text-[#15264D]">
          <Sparkles className="size-5 text-[#FF7900]" aria-hidden /> Jobs for you
        </h2>
        <Link
          href="/listings/profile"
          className="text-xs sm:text-sm font-bold text-[#15264D] hover:text-[#FF7900] transition"
        >
          Edit profile
        </Link>
      </div>

      <div className="grid gap-3.5">
        {rows.map(({ listing, match }) => (
          <ListingOpportunityCard
            key={listing.id}
            listing={listing as unknown as Listing}
            density={density}
            isApplied={appliedListingIds?.has(listing.id)}
            onApply={onApply}
            match={match}
          />
        ))}
      </div>
    </section>
  );
}
