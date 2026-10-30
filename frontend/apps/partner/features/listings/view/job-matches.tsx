"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, EmptyState, useT } from "@vsolve/ui";
import { Lock, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { fetchListingHome } from "../queries";

import {
  fetchJobMatches,
  fetchJobOptions,
  inviteToApply,
  optionLabel,
  type CandidateMatch,
} from "../jobs-queries";

function useLevels() {
  const t = useT();
  return [
    { key: "STRONG", label: t("listings.matches.level.strong"), tone: "success" as const },
    { key: "GOOD", label: t("listings.matches.level.good"), tone: "info" as const },
    { key: "OTHER", label: t("listings.matches.level.others"), tone: "neutral" as const },
  ];
}

/**
 * Candidates for one job, best first, grouped Strong / Good / Others, with why each matches
 * (✓) and what is missing (△). Phone numbers are not shown here: they come with an
 * application. The employer can invite a good match to apply.
 */
export function JobMatches({
  listingId,
  onOpenApplications,
  hiddenMatchCount = 0,
}: {
  listingId: string;
  onOpenApplications: () => void;
  /** Strong and good matches who have not applied (from the job's counts). */
  hiddenMatchCount?: number;
}) {
  const t = useT();
  const LEVELS = useLevels();
  const [level, setLevel] = useState("STRONG");
  const home = useQuery({ queryKey: ["partner-listings", "home"], queryFn: fetchListingHome });
  const locked = home.data ? !home.data.can_see_matches : false;
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const matches = useQuery({ queryKey: ["job-matches", listingId], queryFn: () => fetchJobMatches(listingId) });
  const options = useQuery({ queryKey: ["job-options"], queryFn: fetchJobOptions, staleTime: 3600_000 });
  const invite = useMutation({
    mutationFn: (profileId: string) => inviteToApply(listingId, profileId),
    onSuccess: (_d, profileId) => setInvited((s) => new Set(s).add(profileId)),
  });

  const rows = matches.data ?? [];
  const counts = Object.fromEntries(LEVELS.map((l) => [l.key, rows.filter((r) => r.match.level === l.key).length]));
  const shown = rows.filter((r) => r.match.level === level);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setLevel(l.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${level === l.key ? "bg-navy-900 text-warm-0" : "border border-line bg-surface text-text-secondary"}`}
          >
            {l.label} ({counts[l.key] ?? 0})
          </button>
        ))}
      </div>
      {locked ? (
        <Card className="flex flex-col gap-2 border-action/40 bg-action/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-action" aria-hidden />
            <p className="text-sm text-text">
              {hiddenMatchCount > 0 ? (
                <>
                  <strong>
                    {t(
                      hiddenMatchCount === 1 ? "listings.matches.lockedSingular" : "listings.matches.lockedPlural",
                      { count: hiddenMatchCount },
                    )}
                  </strong>{" "}
                  {t(hiddenMatchCount === 1 ? "listings.matches.notAppliedSingular" : "listings.matches.notAppliedPlural")}
                </>
              ) : (
                <strong>{t("listings.matches.lockedNoMatches")}</strong>
              )}{" "}
              {t("listings.matches.upgradeNote")}
            </p>
          </div>
          <Link
            href="/listings?plans=open"
            className="inline-flex shrink-0 items-center justify-center rounded-control bg-action px-4 py-2 text-xs font-bold text-action-text"
          >
            {t("listings.matches.seePlans")}
          </Link>
        </Card>
      ) : null}
      <p className="text-xs text-text-secondary">
        {t("listings.matches.matchedNote")}
      </p>
      {matches.isLoading ? <p className="text-sm text-text-secondary">{t("listings.matches.finding")}</p> : null}
      {matches.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(matches.error)}</p> : null}
      {invite.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(invite.error)}</p> : null}
      {!matches.isLoading && shown.length === 0 ? (
        <EmptyState
          compact
          title={t("listings.matches.emptyTitle")}
          description={
            locked
              ? t("listings.matches.emptyLocked")
              : t("listings.matches.emptyUnlocked")
          }
        />
      ) : null}
      <ul className="grid gap-3">
        {shown.map((row: CandidateMatch) => {
          const look = LEVELS.find((l) => l.key === row.match.level) ?? LEVELS[2]!;
          return (
            <li key={row.profile_id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-navy-900">{row.display_name}</span>
                    <Badge tone={look.tone}>{t("listings.matches.scorePercent", { score: row.match.score })}</Badge>
                    {row.applied ? <Badge tone="action">{t("listings.matches.applied")}</Badge> : null}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {[
                      optionLabel(options.data?.experience_bands, row.experience_band),
                      row.expected_salary_rupees
                        ? t("listings.matches.expectsPay", { amount: row.expected_salary_rupees.toLocaleString("en-IN") })
                        : "",
                      row.available_from
                        ? t(
                            row.available_from === "IMMEDIATE"
                              ? "listings.matches.joinsImmediately"
                              : "listings.matches.joinsSoon",
                          )
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {row.area || row.city ? (
                    <p className="inline-flex items-center gap-1 text-xs text-text-secondary">
                      <MapPin className="size-3.5" aria-hidden /> {[row.area, row.city].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                    {row.match.matched.map((m) => (
                      <li key={m} className="text-success-text">✓ {m}</li>
                    ))}
                    {row.match.missing.map((m) => (
                      <li key={m} className="text-text-secondary">△ {m}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 gap-2">
                  {row.applied ? (
                    <Button size="sm" variant="secondary" onClick={onOpenApplications}>
                      {t("listings.matches.viewApplication")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={invited.has(row.profile_id) || invite.isPending}
                      onClick={() => invite.mutate(row.profile_id)}
                    >
                      {invited.has(row.profile_id) ? t("listings.matches.invited") : t("listings.matches.inviteToApply")}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
