// Ported from frontend/apps/customer/features/ratings/view/completion-rating.tsx
import { Button, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import {
  usePlatformFeedback,
  useRatings,
  type PlatformFeedbackSummary,
  type RatingSubject,
  type RatingSummary,
} from "../queries";
import { ServiceFeedbackDialog, StarRow, scoreLabel } from "./service-feedback-dialog";

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

  if (myRating === null && myFeedback === null && !canRate && !canSubmitFeedback) return null;

  const stillAskable = canRate || canSubmitFeedback;
  const hasRecord = myRating !== null || myFeedback !== null;

  return (
    <>
      {hasRecord ? (
        <View className="rounded-card border border-line bg-surface p-4 gap-3">
          <Text className="text-sm font-extrabold text-text">Your feedback</Text>

          {myRating !== null ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm text-text-secondary">
                You rated {ratingSummary?.counterparty_label}
              </Text>
              <StarRow score={myRating.score} />
              <Text className="text-sm font-semibold text-text">
                {scoreLabel(myRating.score)}
              </Text>
            </View>
          ) : null}

          {myRating?.comment ? (
            <Text className="text-sm leading-6 text-text-secondary">“{myRating.comment}”</Text>
          ) : null}

          {myFeedback !== null && myFeedback.tags.length > 0 ? (
            <Text className="text-sm leading-6 text-text-secondary">
              You told us:{" "}
              <Text className="font-medium text-text">
                {myFeedback.tags.map((code) => tagLabels[code] ?? code).join(" · ")}
              </Text>
            </Text>
          ) : null}

          {stillAskable ? (
            <View className="mt-1">
              <Button
                variant="outline"
                onPress={() => {
                  setDialogKey((current) => current + 1);
                  setDialogOpen(true);
                }}
              >
                {canRate ? `Rate ${ratingSummary?.counterparty_label}` : "Give feedback"}
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

      <ServiceFeedbackDialog
        key={dialogKey}
        subject={subject}
        id={id}
        isComplete={isComplete && dialogOpen}
        onFinished={() => setDialogOpen(false)}
      />
    </>
  );
}

