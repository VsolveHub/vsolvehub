"use client";

import { Badge } from "@vsolve/ui";

import type { RetentionView } from "../adapters";

export interface WarrantyPanelProps {
  retention: RetentionView;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
}

export function WarrantyPanel({ retention, engagementNoun }: WarrantyPanelProps) {
  if (retention.phase === "none") {
    return null;
  }

  if (retention.phase === "accruing") {
    return (
      <section aria-labelledby="milestone-signoff-heading" className="mt-8">
        <h2 id="milestone-signoff-heading" className="text-lg font-semibold text-text">
          Milestone sign-off
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          You pay every stage in full. To confirm completion,{" "}
          <strong className="font-semibold">{retention.targetLabel}</strong> of
          the final milestone payout is held until final stage approval.
        </p>
        <dl className="mt-3 rounded-card border border-line bg-surface">
          <Row label="Held so far" value={retention.withheldLabel} />
          <Row label="Held at completion" value={retention.targetLabel} strong />
        </dl>
      </section>
    );
  }

  if (retention.phase === "held") {
    return (
      <section aria-labelledby="milestone-signoff-heading" className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="milestone-signoff-heading" className="text-lg font-semibold text-text">
            Milestone sign-off: final stage approved
          </h2>
          <Badge tone="success">{retention.withheldLabel} held</Badge>
        </div>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          The work is finished and{" "}
          <strong className="font-semibold">{retention.withheldLabel}</strong> of
          the milestone payout is held pending final release.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="milestone-signoff-heading" className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="milestone-signoff-heading" className="text-lg font-semibold text-text">
          Milestone sign-off completed
        </h2>
        <Badge tone="neutral">Closed</Badge>
      </div>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        The {retention.withheldLabel} held has been released and this {engagementNoun} is closed.
      </p>
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}
