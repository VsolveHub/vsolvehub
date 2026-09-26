"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

import {
  useCustomItemReviews,
  useResolveCustomItemReview,
  useSkillOptions,
  type CustomWorkItemReview,
} from "../queries";

/**
 * Phase A: the custom-item review queue (contract 1.46.0).
 *
 * The escape hatch's other half. A Partner may price a job the catalog does
 * not cover, inside a capped share of the quote, screened for contact
 * details — none of which this screen re-checks, because `submit_proposal`
 * already refused anything that failed. What lands here already passed
 * every server-side guard; this is purely the judgement call "does the
 * platform want this item in its catalog going forward".
 *
 * Approving creates a real `WorkItem` — the same catalog `WorkItemCatalog`
 * manages — with **no reference rate published yet**. That is deliberate:
 * the rate a lone Partner charged is one data point, not a market survey,
 * and publishing it as the reference would let one aggressive quote set the
 * band for everyone. Operations publishes a rate for it separately, from
 * the catalog screen, once ready.
 */
function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function CustomItemReviewQueue() {
  const reviews = useCustomItemReviews();
  const skills = useSkillOptions();

  return (
    <div className="space-y-4">
      {reviews.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading the review queue…
        </p>
      ) : null}

      {reviews.isError ? (
        <ErrorState
          title="We could not load the review queue"
          message="Nothing has changed. Try again."
          actionLabel="Try again"
          onAction={() => void reviews.refetch()}
        />
      ) : null}

      {!reviews.isPending &&
      !reviews.isError &&
      (reviews.data?.reviews.length ?? 0) === 0 ? (
        <EmptyState
          title="Nothing waiting for review"
          description="No Partner has priced a custom (unlisted) item since the last review. This is the normal state, not a sign the feature is unused — most quotes are made entirely from the catalog."
        />
      ) : null}

      {(reviews.data?.reviews ?? []).map((review) => (
        <ReviewCard key={review.id} review={review} skills={skills.data ?? []} />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  skills,
}: {
  review: CustomWorkItemReview;
  skills: readonly { id: string; name: string }[];
}) {
  const resolve = useResolveCustomItemReview();
  const [skillId, setSkillId] = useState("");

  const errorMessage = resolve.isError ? describeError(resolve.error, "mutation").message : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-text">{review.title}</p>
          <p className="text-sm text-text-secondary">
            {formatRupees(review.rate_paise)} · per {review.unit.replaceAll("_", " ")}
          </p>
        </div>
        <Badge tone="warning">Pending</Badge>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Submitted {new Date(review.created_at).toLocaleDateString("en-IN")}
        {review.proposal ? ` · on quote ${review.proposal.slice(0, 8)}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Add to catalog under" className="min-w-[10rem]">
          <Select value={skillId} onChange={(event) => setSkillId(event.target.value)}>
            <option value="">Choose a trade…</option>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          size="sm"
          disabled={skillId === "" || resolve.isPending}
          loading={resolve.isPending}
          loadingLabel="Approving"
          onClick={() => resolve.mutate({ reviewId: review.id, approve: true, skillId })}
        >
          Approve into catalog
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ reviewId: review.id, approve: false })}
        >
          Reject
        </Button>
      </div>

      {errorMessage ? (
        <ErrorState inline className="mt-3" title="Could not resolve this item" message={errorMessage} />
      ) : null}
    </Card>
  );
}
