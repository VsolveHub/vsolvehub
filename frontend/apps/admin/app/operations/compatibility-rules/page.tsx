"use client";

import { useState } from "react";

import { OperationsShell } from "@/features/session/operations-shell";
import { ProposeRule } from "@/features/compatibility-rules/view/propose-rule";
import { RuleDetail } from "@/features/compatibility-rules/view/rule-detail";
import { RuleQueue } from "@/features/compatibility-rules/view/rule-queue";

/**
 * Service compatibility rules.
 *
 * List and detail side by side on a wide screen, stacked on a narrow one — the
 * same shape as Partner application review, because it is the same job: find the
 * thing waiting on you, read it, decide.
 *
 * The selected id lives in component state rather than the URL, following the
 * review queue. A rule id in a shareable link is an invitation to send someone
 * straight to a decision without the queue context that says whether it is
 * theirs to take.
 */
export default function CompatibilityRulesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Compatibility rules</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Rules decide which services can be booked together, and in what order.
        One person proposes a rule and a different person activates it — you
        cannot do both halves yourself.
      </p>

      <div className="mt-6">
        <ProposeRule onProposed={setSelectedId} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <RuleQueue selectedId={selectedId} onSelect={setSelectedId} />
        <RuleDetail ruleId={selectedId} />
      </div>
    </OperationsShell>
  );
}
