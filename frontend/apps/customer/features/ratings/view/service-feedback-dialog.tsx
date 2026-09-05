"use client";

import { describeError } from "@vsolve/query";
import { Button, cn, Dialog, Textarea } from "@vsolve/ui";
import { Shield } from "lucide-react";
import { useState } from "react";

import {
  usePlatformFeedback,
  useRatings,
  useSubmitPlatformFeedback,
  useSubmitRating,
  type PlatformFeedbackTag,
  type RatingSubject,
} from "../queries";

/**
 * The two questions asked after a job, in one sequence.
 *
 * ## Why two, and why they are not one form
 *
 * "How was your partner" and "how was Vsolve" are different questions with different consequences.
 * A five-star crew booked through a confusing checkout is `partner 5 / platform 2`, and a single
 * blended score hides precisely the finding worth having. They are stored apart for that reason
 * and they are asked apart for the same one.
 *
 * ## Why either step can be skipped independently
 *
 * A customer who will not rate their plumber may still tell us the price was unclear, and vice
 * versa. So step 2 is reachable from a skipped step 1, and neither submission is a precondition
 * for the other. The only thing that closes the whole thing is the customer closing it.
 *
 * ## Why the chips carry the weight
 *
 * The honest answer to an open text box is usually nothing. What comes back is a handful of
 * articulate complaints, which is not the truth about a service — the people who did not type are
 * the majority and their silence cannot be read. Eight taps of a fixed vocabulary is a thing you
 * can count per service. The box stays, for the sentence the chips cannot hold, and stays
 * optional.
 *
 * ## Why the thank-you screen is built from local state
 *
 * It used to read `summary.my_rating` back from the server. Contract 1.57.0 pinned that to null,
 * and the confirmation silently stopped appearing — you submitted, the dialog vanished, and
 * nothing acknowledged it. 1.59.0 publishes a rating back to its own author again, but this screen
 * no longer depends on that round trip: what the customer just said is already in this component,
 * and showing it back should not require asking the server what they said.
 */
const MAX_COMMENT = 280;

export interface ServiceFeedbackDialogProps {
  readonly subject: RatingSubject;
  readonly id: string;
  readonly isComplete: boolean;
  /** Called when the customer closes the sequence, however far they got. */
  readonly onFinished?: () => void;
}

interface Submitted {
  readonly partnerScore: number | null;
  readonly partnerComment: string;
  readonly platformScore: number | null;
  readonly platformTags: readonly string[];
}

export function ServiceFeedbackDialog({
  subject,
  id,
  isComplete,
  onFinished,
}: ServiceFeedbackDialogProps) {
  const ratings = useRatings(subject, id, isComplete);
  const feedback = usePlatformFeedback(subject, id, isComplete);
  const submitRating = useSubmitRating(subject, id);
  const submitFeedback = useSubmitPlatformFeedback(subject, id);

  const [step, setStep] = useState<1 | 2 | "done">(1);
  const [closed, setClosed] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted>({
    partnerScore: null,
    partnerComment: "",
    platformScore: null,
    platformTags: [],
  });

  const [partnerScore, setPartnerScore] = useState(0);
  const [partnerComment, setPartnerComment] = useState("");
  const [platformScore, setPlatformScore] = useState(0);
  const [tags, setTags] = useState<readonly PlatformFeedbackTag[]>([]);
  const [platformComment, setPlatformComment] = useState("");

  const ratingSummary = ratings.data;
  const feedbackSummary = feedback.data;
  const canRate = ratingSummary?.can_rate ?? false;
  const canSubmitFeedback = feedbackSummary?.can_submit ?? false;
  const options = feedbackSummary?.available_tags ?? [];

  function finish() {
    setClosed(true);
    onFinished?.();
  }

  if (!isComplete || closed) return null;
  if (ratings.isPending || feedback.isPending) return null;
  // Nothing left to ask and nothing just submitted: stay out of the way entirely.
  if (step !== "done" && !canRate && !canSubmitFeedback) return null;

  /* Derived, not stored. A customer who already rated their partner but was never asked about us
     starts on step 2, and computing that here beats setting state during render to skip past a
     step that was never available. */
  const activeStep = step === 1 && !canRate ? 2 : step;

  if (activeStep === "done") {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) finish();
        }}
        title="Thanks — that's noted."
        footer={
          <Button onClick={finish} className="w-full justify-center sm:w-auto">
            Done
          </Button>
        }
      >
        <div className="divide-y divide-line rounded-card border border-line bg-surface-sunken">
          {submitted.partnerScore !== null ? (
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text">
                  {ratingSummary?.counterparty_label}
                </span>
                <StarRow score={submitted.partnerScore} />
                <span className="text-sm text-text-secondary">
                  {scoreLabel(submitted.partnerScore)}
                </span>
              </div>
              {submitted.partnerComment ? (
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  “{submitted.partnerComment}”
                </p>
              ) : null}
            </div>
          ) : null}
          {submitted.platformScore !== null || submitted.platformTags.length > 0 ? (
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text">Vsolve</span>
                {submitted.platformScore !== null ? (
                  <>
                    <StarRow score={submitted.platformScore} />
                    <span className="text-sm text-text-secondary">
                      {scoreLabel(submitted.platformScore)}
                    </span>
                  </>
                ) : null}
              </div>
              {submitted.platformTags.length > 0 ? (
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {submitted.platformTags
                    .map(
                      (code) => options.find((option) => option.code === code)?.label ?? code,
                    )
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog>
    );
  }

  if (activeStep === 1) {
    const error = submitRating.isError
      ? describeError(submitRating.error, "mutation").message
      : null;

    return (
      <Dialog
        open
        dismissable={!submitRating.isPending}
        onOpenChange={(open) => {
          if (!open && !submitRating.isPending) finish();
        }}
        title={`How was ${ratingSummary?.counterparty_label ?? "your partner"}?`}
        description="Your rating is private and helps other customers."
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <StepDots step={1} />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={submitRating.isPending}
                onClick={() => (canSubmitFeedback ? setStep(2) : finish())}
              >
                Skip
              </Button>
              <Button
                disabled={partnerScore === 0}
                loading={submitRating.isPending}
                loadingLabel="Saving"
                onClick={() =>
                  submitRating.mutate(
                    { score: partnerScore, comment: partnerComment },
                    {
                      onSuccess: () => {
                        setSubmitted((current) => ({
                          ...current,
                          partnerScore,
                          partnerComment: partnerComment.trim(),
                        }));
                        setStep(canSubmitFeedback ? 2 : "done");
                      },
                    },
                  )
                }
              >
                {canSubmitFeedback ? "Next" : "Submit"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <StarPicker
            legend="How was your experience?"
            score={partnerScore}
            disabled={submitRating.isPending}
            onChange={setPartnerScore}
          />
          <CommentBox
            id={`partner-feedback-${id}`}
            label="Tell us more"
            placeholder="What went well, or what didn't?"
            value={partnerComment}
            disabled={submitRating.isPending}
            onChange={setPartnerComment}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    );
  }

  const error = submitFeedback.isError
    ? describeError(submitFeedback.error, "mutation").message
    : null;
  const saidSomething = platformScore > 0 || tags.length > 0 || platformComment.trim() !== "";

  return (
    <Dialog
      open
      dismissable={!submitFeedback.isPending}
      onOpenChange={(open) => {
        if (!open && !submitFeedback.isPending) finish();
      }}
      title="How was Vsolve itself?"
      description="Not the crew — the app, the booking, the price."
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StepDots step={2} />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={submitFeedback.isPending}
              onClick={() => {
                // Skipping the last question closes the sequence — unless something was already
                // submitted, which earns the confirmation rather than a silent disappearance.
                if (submitted.partnerScore !== null) setStep("done");
                else finish();
              }}
            >
              Skip
            </Button>
            <Button
              disabled={!saidSomething}
              loading={submitFeedback.isPending}
              loadingLabel="Sending"
              onClick={() =>
                submitFeedback.mutate(
                  {
                    score: platformScore === 0 ? null : platformScore,
                    tags,
                    comment: platformComment,
                  },
                  {
                    onSuccess: () => {
                      setSubmitted((current) => ({
                        ...current,
                        platformScore: platformScore === 0 ? null : platformScore,
                        platformTags: [...tags],
                      }));
                      setStep("done");
                    },
                  },
                )
              }
            >
              Send
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <StarPicker
          legend="How was your experience?"
          score={platformScore}
          disabled={submitFeedback.isPending}
          onChange={setPlatformScore}
        />

        <fieldset className="m-0 border-0 p-0">
          <legend className="text-sm font-semibold text-text">What could we improve?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => {
              const selected = tags.includes(option.code);
              return (
                <button
                  key={option.code}
                  type="button"
                  aria-pressed={selected}
                  disabled={submitFeedback.isPending}
                  onClick={() => setTags((current) => toggleTag(current, option, options))}
                  className={cn(
                    "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                    "disabled:opacity-60",
                    selected
                      ? "border-action bg-selected-surface text-text"
                      : "border-line-strong bg-surface text-text-secondary hover:border-warm-600",
                  )}
                >
                  {selected ? "✓ " : ""}
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <CommentBox
          id={`platform-feedback-${id}`}
          label="Anything else?"
          placeholder="Tell us what would have made this easier..."
          value={platformComment}
          disabled={submitFeedback.isPending}
          onChange={setPlatformComment}
        />

        <p className="flex items-start gap-1.5 text-xs leading-5 text-text-muted">
          <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>This goes to Vsolve, not to the partner.</span>
        </p>

        {error ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * Selecting the exclusive chip clears the rest, and any other chip clears it.
 *
 * Handled here rather than left to the server's refusal: "All good, and pricing wasn't clear" is a
 * contradiction the customer can see they are making, and a form that lets them build it only to
 * bounce it is a form that wasted their time. The server still refuses it — this is the courtesy,
 * not the rule.
 */
function toggleTag(
  current: readonly PlatformFeedbackTag[],
  option: { code: PlatformFeedbackTag; is_exclusive: boolean },
  options: readonly { code: PlatformFeedbackTag; is_exclusive: boolean }[],
): readonly PlatformFeedbackTag[] {
  if (current.includes(option.code)) return current.filter((code) => code !== option.code);
  if (option.is_exclusive) return [option.code];
  const exclusive = options.filter((entry) => entry.is_exclusive).map((entry) => entry.code);
  return [...current.filter((code) => !exclusive.includes(code)), option.code];
}

function StepDots({ step }: { readonly step: 1 | 2 }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`Step ${step} of 2`}>
      {[1, 2].map((value) => (
        <span
          key={value}
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            value <= step ? "bg-action" : "bg-line-strong",
          )}
        />
      ))}
    </span>
  );
}

function StarPicker({
  legend,
  score,
  disabled,
  onChange,
}: {
  readonly legend: string;
  readonly score: number;
  readonly disabled: boolean;
  readonly onChange: (score: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const visible = hovered || score;

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="text-sm font-semibold text-text">{legend}</legend>
      <div className="mt-2 flex gap-1" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
            aria-pressed={score === value}
            disabled={disabled}
            className="flex size-10 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
            onMouseEnter={() => setHovered(value)}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered(0)}
            onClick={() => onChange(value)}
          >
            <Star filled={value <= visible} />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-text-muted" aria-live="polite">
        {score === 0 ? "(Select rating)" : scoreLabel(score)}
      </p>
    </fieldset>
  );
}

function CommentBox({
  id,
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-text" htmlFor={id}>
        {label} <span className="font-normal text-text-muted">(optional)</span>
      </label>
      <Textarea
        id={id}
        className="mt-2"
        rows={3}
        maxLength={MAX_COMMENT}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <p className="mt-1 text-right text-xs text-text-muted">
        {value.length}/{MAX_COMMENT}
      </p>
    </div>
  );
}

export function StarRow({ score }: { readonly score: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${score} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} filled={value <= score} className="size-4" />
      ))}
    </span>
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

export function scoreLabel(score: number): string {
  return ["", "Needs improvement", "Fair", "Good", "Very good", "Excellent"][score] ?? "";
}
