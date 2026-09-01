"use client";

import { describeError } from "@vsolve/query";
import { Button, cn, Dialog, Textarea } from "@vsolve/ui";
import { Shield } from "lucide-react";
import { useEffect, useState } from "react";

import type { FulfilmentUnit } from "@/features/bookings/queries";

import { useRatings, useSubmitRating } from "../queries";

const MAX_COMMENT = 280;

const COMPLETED_VISIT_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);

export function isVisitWorkComplete(status: string | null | undefined): boolean {
  return status != null && COMPLETED_VISIT_STATUSES.has(status);
}

export function canShowVisitFeedback({
  bookingId,
  isPaid,
  unitStatus,
  bookingStatus,
}: {
  readonly bookingId: string | null;
  readonly isPaid: boolean;
  readonly unitStatus: string;
  readonly bookingStatus: string | null;
}): bookingId is string {
  return (
    isPaid &&
    bookingId !== null &&
    unitStatus !== "CANCELLED" &&
    bookingStatus !== "CANCELLED" &&
    isVisitWorkComplete(bookingStatus)
  );
}

/**
 * Feedback for a catalog visit.
 *
 * Nothing is shown in the visit layout. When the visit is complete and the
 * server still accepts a rating, the form opens as a dialog. Closing it or
 * submitting it removes it; a completed visit that is already rated stays quiet.
 */
export function VisitFeedbackForm({
  bookingId,
  isComplete,
  onFinished,
}: {
  readonly bookingId: string;
  readonly isComplete: boolean;
  readonly onFinished?: () => void;
}) {
  const ratings = useRatings("booking", bookingId, isComplete);
  const submit = useSubmitRating("booking", bookingId);
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const summary = ratings.data;
  const visibleScore = hovered || score;
  const errorMessage = submit.isError ? describeError(submit.error, "mutation").message : null;
  const canSubmit = summary?.can_rate ?? false;
  const myRating = summary?.my_rating;

  useEffect(() => {
    if (!isComplete || dismissed || justSubmitted) return;
    if (ratings.isPending || ratings.isLoading) return;
    if (summary != null && !summary.can_rate) onFinished?.();
  }, [
    isComplete,
    dismissed,
    justSubmitted,
    ratings.isPending,
    ratings.isLoading,
    summary,
    onFinished,
  ]);

  function finish() {
    setDismissed(true);
    onFinished?.();
  }

  if (!isComplete || dismissed) return null;
  if (ratings.isPending || ratings.isLoading || summary === undefined) return null;

  if (justSubmitted && myRating) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) finish();
        }}
        title="We value your feedback"
        description="Thank you for sharing your experience."
        footer={
          <Button onClick={finish} className="w-full justify-center sm:w-auto">
            Done
          </Button>
        }
      >
        <div className="rounded-card border border-line bg-surface-sunken p-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1" aria-label={`${myRating.score} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Star key={value} filled={value <= myRating.score} className="size-5" />
              ))}
            </span>
            <span className="text-sm font-semibold text-text">{ratingLabel(myRating.score)}</span>
          </div>
          {myRating.comment ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">{myRating.comment}</p>
          ) : null}
        </div>
      </Dialog>
    );
  }

  if (!canSubmit) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submit.isPending) finish();
      }}
      dismissable={!submit.isPending}
      title="We value your feedback"
      description="Help us improve your experience by sharing your feedback."
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-xs leading-5 text-text-muted">
            <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Your feedback is private and helps us improve our services.</span>
          </p>
          <Button
            disabled={score === 0}
            loading={submit.isPending}
            loadingLabel="Submitting feedback"
            onClick={() =>
              submit.mutate(
                { score, comment },
                { onSuccess: () => setJustSubmitted(true) },
              )
            }
          >
            Submit feedback
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold text-text">How was your experience?</legend>
          <div className="mt-2 flex gap-1" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                aria-pressed={score === value}
                disabled={submit.isPending}
                className="flex size-10 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
                onMouseEnter={() => setHovered(value)}
                onFocus={() => setHovered(value)}
                onBlur={() => setHovered(0)}
                onClick={() => setScore(value)}
              >
                <Star filled={value <= visibleScore} />
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-text-muted" aria-live="polite">
            {score === 0 ? "(Select rating)" : ratingLabel(score)}
          </p>
        </fieldset>

        <div>
          <label className="text-sm font-semibold text-text" htmlFor={`visit-feedback-${bookingId}`}>
            Tell us more <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <Textarea
            id={`visit-feedback-${bookingId}`}
            className="mt-2"
            rows={4}
            maxLength={MAX_COMMENT}
            value={comment}
            disabled={submit.isPending}
            placeholder="Share your experience, suggestions or any feedback..."
            onChange={(event) => setComment(event.currentTarget.value)}
          />
          <p className="mt-1 text-right text-xs text-text-muted">
            {comment.length}/{MAX_COMMENT}
          </p>
        </div>

        {errorMessage ? (
          <p role="alert" className="text-sm text-critical">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Prompts for the next completed visit that still needs a rating. */
export function CompletedVisitsFeedback({
  units,
  isPaid,
}: {
  readonly units: readonly FulfilmentUnit[];
  readonly isPaid: boolean;
}) {
  const [skipIds, setSkipIds] = useState<readonly string[]>([]);
  const next = units.find((unit) => {
    if (unit.booking_id === null || skipIds.includes(unit.booking_id)) return false;
    return canShowVisitFeedback({
      bookingId: unit.booking_id,
      isPaid,
      unitStatus: unit.status,
      bookingStatus: unit.booking_status,
    });
  });

  if (next?.booking_id == null) return null;

  const bookingId = next.booking_id;
  return (
    <VisitFeedbackForm
      bookingId={bookingId}
      isComplete
      onFinished={() =>
        setSkipIds((ids) => (ids.includes(bookingId) ? ids : [...ids, bookingId]))
      }
    />
  );
}

function Star({ filled, className }: { readonly filled: boolean; readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        "size-7 transition-colors",
        filled ? "fill-amber-400 text-amber-500" : "fill-transparent text-warm-400",
        className,
      )}
    >
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="m12 2.8 2.75 5.58 6.16.9-4.46 4.34 1.05 6.13L12 16.86l-5.5 2.89 1.05-6.13-4.46-4.34 6.16-.9L12 2.8Z"
      />
    </svg>
  );
}

function ratingLabel(score: number): string {
  return ["", "Needs improvement", "Fair", "Good", "Very good", "Excellent"][score] ?? "";
}
