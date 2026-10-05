"use client";

import { Badge } from "@vsolve/ui";

import { MATCH_LOOK, type JobMatch } from "../seeker-queries";

/** "92% match" with what fits (✓) and what doesn't (△). */
export function MatchCard({ match }: { match: JobMatch }) {
  const look = MATCH_LOOK[match.level] ?? MATCH_LOOK.OTHER!;
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-extrabold text-navy-900">{match.score}% match</p>
        <Badge tone={look.tone}>{look.label}</Badge>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {match.matched.map((m) => (
          <li key={m} className="text-success-text">✓ {m}</li>
        ))}
        {match.missing.map((m) => (
          <li key={m} className="text-text-secondary">△ {m}</li>
        ))}
      </ul>
      <p className="text-[11px] text-text-secondary">
        Based on your profile and the job details. Please read the full job before applying.
      </p>
    </section>
  );
}
