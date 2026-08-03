"use client";

import { useState } from "react";

import { OperationsShell } from "@/features/session/operations-shell";
import { ReviewDetail } from "@/features/partner-review/view/review-detail";
import { ReviewQueue } from "@/features/partner-review/view/review-queue";

/**
 * Partner application review.
 *
 * Queue and detail side by side on a wide screen, stacked on a narrow one. The
 * selected id lives in component state rather than the URL for now: a reviewer's
 * queue position is not something to share or bookmark, and putting an
 * application id in a shareable link is a small invitation to pass one around
 * outside the audited reveal flow.
 */
export default function ReviewsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Partner applications</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Claim an application before deciding on it. Documents stay hidden until
        you open them, and every reveal is recorded.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ReviewQueue selectedId={selectedId} onSelect={setSelectedId} />
        <ReviewDetail applicationId={selectedId} />
      </div>
    </OperationsShell>
  );
}
