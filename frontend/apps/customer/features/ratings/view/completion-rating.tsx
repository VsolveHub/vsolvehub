"use client";

import { Button } from "@vsolve/ui";
import { useState } from "react";

import {
  usePlatformFeedback,
  useRatings,
  type PlatformFeedbackSummary,
  type RatingSubject,
  type RatingSummary,
} from "../queries";
import { ServiceFeedbackDialog, StarRow, scoreLabel } from "./service-feedback-dialog";

/**
 * Feedback on a finished job: the prompt, and the record it leaves behind.
 *
 * ## What was here before
 *
 * A bare rating dialog and `ServiceRatingList`. Contract 1.57.0 emptied that list and pinned
 * `my_rating` to null, so a job you had already rated and a job you had dismissed unrated rendered
 * **identically — as nothing**. Submitting produced no confirmation and left no trace, which reads
 * exactly like a broken feature rather than a completed one.
 *
 * ## What replaces it
 *
 * The prompt is the two-step dialog (partner, then platform). Once there is nothing left to ask,
 * this leaves a small record instead of vanishing: what you said, and a way back in if you
 * answered one question and skipped the other.
 *
 * The counterparty's rating is still never shown. That is the part of 1.57.0 that was right, and
 * it is untouched: `ratings` stays empty and only the caller's own submission comes back.
 */
export function CompletionRating({
  subject,
  id,
  isComplete,
}: {
  readonly subject: RatingSubject;
  readonly id: string;
  readonly isComplete: boolean;
}) {
  const ratings = useRatings(subject, id, isComplete);
  const feedback = usePlatformFeedback(subject, id, isComplete);

  if (!isComplete) return null;
  if (ratings.isPending || feedback.isPending) return null;

  return (
    <CompletionRatingReady
      key={`${subject}:${id}`}
      subject={subject}
      id={id}
      isComplete={isComplete}
      ratingSummary={ratings.data}
      feedbackSummary={feedback.data}
    />
  );
}

/**
 * The ready-state boundary also owns the lifetime of one feedback-dialog session.
 *
 * Submitting step one updates the rating cache before the dialog's mutation callback advances to
 * step two. If visibility were derived from `hasRecord`, that cache update would unmount the
 * dialog between those two events. Initialising this state only after both summaries are ready
 * preserves the session until the customer explicitly finishes it, while an existing record
 * still stays quietly collapsed on a later page load.
 */
function CompletionRatingReady({
  subject,
  id,
  isComplete,
  ratingSummary,
  feedbackSummary,
}: {
  readonly subject: RatingSubject;
  readonly id: string;
  readonly isComplete: boolean;
  readonly ratingSummary: RatingSummary | undefined;
  readonly feedbackSummary: PlatformFeedbackSummary | undefined;
}) {
  const initialHasRecord =
    (ratingSummary?.my_rating ?? null) !== null ||
    (feedbackSummary?.my_feedback ?? null) !== null;
  const [dialogOpen, setDialogOpen] = useState(() => !initialHasRecord);
  const [dialogKey, setDialogKey] = useState(0);

  const myRating = ratingSummary?.my_rating ?? null;
  const myFeedback = feedbackSummary?.my_feedback ?? null;
  const canRate = ratingSummary?.can_rate ?? false;
  const canSubmitFeedback = feedbackSummary?.can_submit ?? false;
  const tagLabels = (feedbackSummary?.available_tags ?? []).reduce<Record<string, string>>(
    (labels, option) => ({ ...labels, [option.code]: option.label }),
    {},
  );

  // Nothing said and nothing left to ask: this job predates feedback, or was rated elsewhere.
  if (myRating === null && myFeedback === null && !canRate && !canSubmitFeedback) return null;

  const stillAskable = canRate || canSubmitFeedback;
  const hasRecord = myRating !== null || myFeedback !== null;

  return (
    <>
      {hasRecord ? (
        <section
          aria-labelledby={`feedback-record-${id}`}
          className="rounded-card border border-line bg-surface p-4 shadow-card"
        >
          <h2 id={`feedback-record-${id}`} className="text-sm font-extrabold text-text">
            Your feedback
          </h2>

          {myRating !== null ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-secondary">
                You rated {ratingSummary?.counterparty_label}
              </span>
              <StarRow score={myRating.score} />
              <span className="text-sm font-semibold text-text">
                {scoreLabel(myRating.score)}
              </span>
            </div>
          ) : null}

          {myRating?.comment ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">“{myRating.comment}”</p>
          ) : null}

          {myFeedback !== null && myFeedback.tags.length > 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              You told us:{" "}
              <span className="font-medium text-text">
                {myFeedback.tags.map((code) => tagLabels[code] ?? code).join(" · ")}
              </span>
            </p>
          ) : null}

          {stillAskable ? (
            <div className="mt-4">
              {/* One question answered and the other skipped. Offered rather than nagged: the
                  dialog does not reopen on its own once it has been closed. */}
              <Button
                variant="outline"
                onClick={() => {
                  setDialogKey((current) => current + 1);
                  setDialogOpen(true);
                }}
              >
                {canRate ? `Rate ${ratingSummary?.counterparty_label}` : "Give feedback"}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <ServiceFeedbackDialog
        // Remounts on reopen so the sequence starts fresh rather than resuming a closed one.
        key={dialogKey}
        subject={subject}
        id={id}
        isComplete={isComplete && dialogOpen}
        onFinished={() => setDialogOpen(false)}
      />
    </>
  );
}
