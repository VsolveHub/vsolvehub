"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "@vsolve/ui";
import { MapPin, Sparkles, UserRound } from "lucide-react";

import { fetchJobsForYou, fetchMyJobProfile, MATCH_LOOK } from "../seeker-queries";
import { getCareerImage } from "../career-images";

/** "Jobs for you" for a seeker with a profile, or a nudge to make one. */
export function JobsForYou() {
  const profile = useQuery({ queryKey: ["my-job-profile"], queryFn: fetchMyJobProfile });
  const jobs = useQuery({
    queryKey: ["jobs-for-you"],
    queryFn: fetchJobsForYou,
    enabled: Boolean(profile.data),
  });

  if (profile.isLoading) return null;
  if (!profile.data) {
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
        <Link href="/listings/profile" className="inline-flex min-h-11 items-center justify-center rounded-control bg-action px-5 text-sm font-bold text-action-text">
          Create profile
        </Link>
      </Card>
    );
  }
  const rows = jobs.data ?? [];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-lg font-extrabold text-navy-900">
          <Sparkles className="size-5 text-action" aria-hidden /> Jobs for you
        </h2>
        <Link href="/listings/profile" className="text-sm font-bold text-text-link">
          Edit profile
        </Link>
      </div>
      {rows.length === 0 && !jobs.isLoading ? (
        <p className="text-sm text-text-secondary">No close matches yet. We&apos;ll notify you when one is posted.</p>
      ) : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {rows.slice(0, 10).map(({ listing, match }) => {
          const look = (match.level ? MATCH_LOOK[match.level] : null) ?? MATCH_LOOK.OTHER!;
          const { url: heroImage, fallback } = getCareerImage(listing);
          return (
            <Link key={listing.id} href={`/listings/${listing.slug || listing.id}`} className="w-64 shrink-0 group">
              <Card className="flex h-full flex-col gap-2.5 p-4 hover:border-action transition duration-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-line bg-surface-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={heroImage}
                      alt=""
                      className="size-full object-cover transition duration-300 group-hover:scale-105"
                      onError={(e) => {
                        if (e.currentTarget.src !== fallback) {
                          e.currentTarget.src = fallback;
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold text-navy-900">{match.score}%</span>
                    <Badge tone={look.tone}>{look.label}</Badge>
                  </div>
                </div>
                <div>
                  <p className="font-bold text-navy-900 line-clamp-1 group-hover:text-action transition-colors">
                    {listing.title}
                  </p>
                  <p className="text-xs text-text-secondary truncate mt-0.5">{listing.poster_name}</p>
                </div>
                <p className="inline-flex items-center gap-1 text-xs text-text-secondary mt-auto pt-1">
                  <MapPin className="size-3.5 shrink-0 text-text-muted" aria-hidden />{" "}
                  <span className="truncate">{listing.location_text}</span>
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
