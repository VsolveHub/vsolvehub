"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, EmptyState } from "@vsolve/ui";
import { MapPin } from "lucide-react";
import { useState } from "react";

import {
  fetchJobMatches,
  fetchJobOptions,
  inviteToApply,
  optionLabel,
  type CandidateMatch,
} from "../jobs-queries";

const LEVELS = [
  { key: "STRONG", label: "Strong", tone: "success" as const },
  { key: "GOOD", label: "Good", tone: "info" as const },
  { key: "OTHER", label: "Others", tone: "neutral" as const },
];

/**
 * Candidates for one job, best first, grouped Strong / Good / Others, with why each matches
 * (✓) and what is missing (△). Phone numbers are not shown here: they come with an
 * application. The employer can invite a good match to apply.
 */
export function JobMatches({ listingId, onOpenApplications }: { listingId: string; onOpenApplications: () => void }) {
  const [level, setLevel] = useState("STRONG");
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
      <p className="text-xs text-text-secondary">
        Matched on the information in each profile. Please interview candidates to check their skills and experience —
        the final choice is yours.
      </p>
      {matches.isLoading ? <p className="text-sm text-text-secondary">Finding candidates…</p> : null}
      {matches.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(matches.error)}</p> : null}
      {invite.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(invite.error)}</p> : null}
      {!matches.isLoading && shown.length === 0 ? (
        <EmptyState compact title="No candidates here yet" description="As job seekers in this city make profiles, they appear here. You'll get a daily summary." />
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
                    <Badge tone={look.tone}>{row.match.score}% match</Badge>
                    {row.applied ? <Badge tone="action">Applied</Badge> : null}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {[
                      optionLabel(options.data?.experience_bands, row.experience_band),
                      row.expected_salary_rupees ? `expects ₹${row.expected_salary_rupees.toLocaleString("en-IN")}` : "",
                      row.available_from ? `joins ${row.available_from === "IMMEDIATE" ? "immediately" : "soon"}` : "",
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
                      View application
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={invited.has(row.profile_id) || invite.isPending}
                      onClick={() => invite.mutate(row.profile_id)}
                    >
                      {invited.has(row.profile_id) ? "Invited" : "Invite to apply"}
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
