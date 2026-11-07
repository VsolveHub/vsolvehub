// Ported from frontend/apps/customer/features/ratings/view/service-feedback-dialog.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Dialog, Text, Textarea, cn } from "@vsolve/mobile-ui";
import { Shield, Star } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import {
  usePlatformFeedback,
  useRatings,
  useSubmitPlatformFeedback,
  useSubmitRating,
  type PlatformFeedbackTag,
  type RatingSubject,
} from "../queries";

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
  if (step !== "done" && !canRate && !canSubmitFeedback) return null;

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
          <Button block onPress={finish}>
            Done
          </Button>
        }
      >
        <View className="divide-y divide-line rounded-card border border-line bg-surface-sunken">
          {submitted.partnerScore !== null ? (
            <View className="p-4 gap-2">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm font-semibold text-text">
                  {ratingSummary?.counterparty_label}
                </Text>
                <StarRow score={submitted.partnerScore} />
                <Text className="text-sm text-text-secondary">
                  {scoreLabel(submitted.partnerScore)}
                </Text>
              </View>
              {submitted.partnerComment ? (
                <Text className="text-sm leading-6 text-text-secondary">
                  “{submitted.partnerComment}”
                </Text>
              ) : null}
            </View>
          ) : null}
          {submitted.platformScore !== null || submitted.platformTags.length > 0 ? (
            <View className="p-4 gap-2">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm font-semibold text-text">Vsolve</Text>
                {submitted.platformScore !== null ? (
                  <>
                    <StarRow score={submitted.platformScore} />
                    <Text className="text-sm text-text-secondary">
                      {scoreLabel(submitted.platformScore)}
                    </Text>
                  </>
                ) : null}
              </View>
              {submitted.platformTags.length > 0 ? (
                <Text className="text-sm leading-6 text-text-secondary">
                  {submitted.platformTags
                    .map(
                      (code) => options.find((option) => option.code === code)?.label ?? code,
                    )
                    .join(" · ")}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
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
          <View className="w-full gap-3">
            <View className="flex-row items-center justify-between">
              <StepDots step={1} />
              <View className="flex-row gap-2">
                <Button
                  variant="ghost"
                  disabled={submitRating.isPending}
                  onPress={() => (canSubmitFeedback ? setStep(2) : finish())}
                >
                  Skip
                </Button>
                <Button
                  disabled={partnerScore === 0}
                  loading={submitRating.isPending}
                  loadingLabel="Saving"
                  onPress={() =>
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
              </View>
            </View>
          </View>
        }
      >
        <View className="gap-5">
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
            <Text role="alert" className="text-sm text-danger-text">
              {error}
            </Text>
          ) : null}
        </View>
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
        <View className="w-full gap-3">
          <View className="flex-row items-center justify-between">
            <StepDots step={2} />
            <View className="flex-row gap-2">
              <Button
                variant="ghost"
                disabled={submitFeedback.isPending}
                onPress={() => {
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
                onPress={() =>
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
            </View>
          </View>
        </View>
      }
    >
      <View className="gap-5">
        <StarPicker
          legend="How was your experience?"
          score={platformScore}
          disabled={submitFeedback.isPending}
          onChange={setPlatformScore}
        />

        <View>
          <Text className="text-sm font-semibold text-text">What could we improve?</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {options.map((option) => {
              const selected = tags.includes(option.code);
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  aria-pressed={selected}
                  disabled={submitFeedback.isPending}
                  onPress={() => setTags((current) => toggleTag(current, option, options))}
                  className={cn(
                    "min-h-11 rounded-full border px-3.5 py-2 justify-center",
                    selected
                      ? "border-action bg-orange-50 text-text"
                      : "border-line-strong bg-surface text-text-secondary active:bg-surface-hover",
                    submitFeedback.isPending && "opacity-60",
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm font-medium",
                      selected ? "text-action" : "text-text-secondary",
                    )}
                  >
                    {selected ? "✓ " : ""}
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <CommentBox
          id={`platform-feedback-${id}`}
          label="Anything else?"
          placeholder="Tell us what would have made this easier..."
          value={platformComment}
          disabled={submitFeedback.isPending}
          onChange={setPlatformComment}
        />

        <View className="flex-row items-center gap-1.5">
          <Shield size={14} color="#64748B" />
          <Text className="text-xs leading-5 text-text-muted">
            This goes to Vsolve, not to the partner.
          </Text>
        </View>

        {error ? (
          <Text role="alert" className="text-sm text-danger-text">
            {error}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}

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
    <View className="flex-row items-center gap-1.5" accessibilityLabel={`Step ${step} of 2`}>
      {[1, 2].map((value) => (
        <View
          key={value}
          className={cn(
            "size-1.5 rounded-full",
            value <= step ? "bg-action" : "bg-line-strong",
          )}
        />
      ))}
    </View>
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
  return (
    <View>
      <Text className="text-sm font-semibold text-text">{legend}</Text>
      <View className="mt-2 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} ${value === 1 ? "star" : "stars"}`}
            aria-pressed={score === value}
            disabled={disabled}
            onPress={() => onChange(value)}
            className="size-11 items-center justify-center rounded-full active:bg-surface-hover"
          >
            <Star
              size={26}
              color={value <= score ? "#F59E0B" : "#CBD5E1"}
              fill={value <= score ? "#FBBF24" : "transparent"}
            />
          </Pressable>
        ))}
      </View>
      <Text className="mt-1 text-xs text-text-muted">
        {score === 0 ? "(Select rating)" : scoreLabel(score)}
      </Text>
    </View>
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
    <View>
      <Text className="text-sm font-semibold text-text">
        {label} <Text className="font-normal text-text-muted">(optional)</Text>
      </Text>
      <Textarea
        id={id}
        className="mt-2"
        rows={3}
        maxLength={MAX_COMMENT}
        value={value}
        editable={!disabled}
        placeholder={placeholder}
        onChangeText={onChange}
      />
      <Text className="mt-1 text-right text-xs text-text-muted">
        {value.length}/{MAX_COMMENT}
      </Text>
    </View>
  );
}

export function StarRow({ score }: { readonly score: number }) {
  return (
    <View className="flex-row items-center gap-0.5" accessibilityLabel={`${score} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={16}
          color={value <= score ? "#F59E0B" : "#CBD5E1"}
          fill={value <= score ? "#FBBF24" : "transparent"}
        />
      ))}
    </View>
  );
}

export function scoreLabel(score: number): string {
  return ["", "Needs improvement", "Fair", "Good", "Very good", "Excellent"][score] ?? "";
}

