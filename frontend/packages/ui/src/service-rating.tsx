"use client";

import { useState } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { Dialog } from "./dialog";
import { Textarea } from "./input";

export interface ListedServiceRating {
  readonly id: string;
  readonly rater_role: "CUSTOMER" | "PARTNER";
  readonly score: number;
  readonly comment: string;
  readonly created_at: string;
  readonly is_mine: boolean;
}

export interface ServiceRatingDialogProps {
  readonly open: boolean;
  readonly counterpartyLabel: string;
  readonly isSubmitting: boolean;
  readonly errorMessage?: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (score: number, comment: string) => void;
}

/** A short post-completion prompt shared by the Customer and Partner apps. */
export function ServiceRatingDialog({
  open,
  counterpartyLabel,
  isSubmitting,
  errorMessage = null,
  onOpenChange,
  onSubmit,
}: ServiceRatingDialogProps) {
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const visibleScore = hovered || score;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissable={!isSubmitting}
      title={`How was ${counterpartyLabel}?`}
      description="Choose a rating for this completed booking."
      footer={
        <Button
          block
          disabled={score === 0}
          loading={isSubmitting}
          loadingLabel="Saving your rating"
          onClick={() => onSubmit(score, comment)}
        >
          Submit rating
        </Button>
      }
    >
      <div className="pb-4">
        <fieldset>
          <legend className="sr-only">Rating out of five</legend>
          <div className="flex justify-center gap-1" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                aria-pressed={score === value}
                className="flex size-12 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                onMouseEnter={() => setHovered(value)}
                onFocus={() => setHovered(value)}
                onBlur={() => setHovered(0)}
                onClick={() => setScore(value)}
              >
                <Star filled={value <= visibleScore} />
              </button>
            ))}
          </div>
          <p className="mt-1 min-h-6 text-center text-sm font-semibold text-text-secondary" aria-live="polite">
            {ratingLabel(score)}
          </p>
        </fieldset>

        <label className="mt-4 block text-sm font-semibold text-text" htmlFor="service-rating-note">
          Add a short note <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <Textarea
          id="service-rating-note"
          className="mt-2"
          rows={3}
          maxLength={280}
          value={comment}
          placeholder="What went well?"
          onChange={(event) => setComment(event.currentTarget.value)}
        />
        <p className="mt-1 text-right text-xs text-text-muted">{comment.length}/280</p>

        {errorMessage ? (
          <p role="alert" className="mt-3 text-sm text-critical">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export function ServiceRatingList({ ratings }: { readonly ratings: readonly ListedServiceRating[] }) {
  if (ratings.length === 0) return null;
  return (
    <section aria-labelledby="service-ratings-title" className="rounded-card border border-line bg-surface p-4">
      <h2 id="service-ratings-title" className="text-sm font-semibold text-text">
        Ratings
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {ratings.map((rating) => (
          <li key={rating.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-text">
                {rating.is_mine ? "Your rating" : rating.rater_role === "CUSTOMER" ? "Customer rating" : "Partner rating"}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-text" aria-label={`${rating.score} out of 5 stars`}>
                <Star filled className="size-4" /> {rating.score}/5
              </span>
            </div>
            {rating.comment ? <p className="mt-1 text-sm leading-6 text-text-secondary">{rating.comment}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Star({ filled, className }: { readonly filled: boolean; readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-8 transition-colors", filled ? "fill-amber-400 text-amber-500" : "fill-transparent text-warm-400", className)}
    >
      <path stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="m12 2.8 2.75 5.58 6.16.9-4.46 4.34 1.05 6.13L12 16.86l-5.5 2.89 1.05-6.13-4.46-4.34 6.16-.9L12 2.8Z" />
    </svg>
  );
}

function ratingLabel(score: number): string {
  return ["", "Needs improvement", "Fair", "Good", "Very good", "Excellent"][score] ?? "";
}
