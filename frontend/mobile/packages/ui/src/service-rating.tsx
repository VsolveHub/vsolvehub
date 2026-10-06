// Ported from frontend/packages/ui/src/service-rating.tsx
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "./button";
import { Dialog } from "./dialog";
import { Textarea } from "./input";
import { Text } from "./text";

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

function ratingLabel(score: number): string {
  return ["", "Needs improvement", "Fair", "Good", "Very good", "Excellent"][score] ?? "";
}

export function ServiceRatingDialog({
  open,
  counterpartyLabel,
  isSubmitting,
  errorMessage = null,
  onOpenChange,
  onSubmit,
}: ServiceRatingDialogProps) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissable={!isSubmitting}
      title={`How was ${counterpartyLabel}?`}
      description="Choose a rating for this completed booking."
      footer={
        <Button block disabled={score === 0} loading={isSubmitting} loadingLabel="Saving your rating" onPress={() => onSubmit(score, comment)}>
          Submit rating
        </Button>
      }
    >
      <View className="flex-row justify-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} ${value === 1 ? "star" : "stars"}`}
            onPress={() => setScore(value)}
            className="size-12 items-center justify-center"
          >
            <Text className={value <= score ? "text-2xl text-signal-500" : "text-2xl text-warm-400"}>★</Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-1 min-h-6 text-center text-sm font-semibold text-text-secondary">{ratingLabel(score)}</Text>
      <Text className="mt-4 text-sm font-semibold text-text">
        Add a short note <Text className="font-normal text-text-muted">(optional)</Text>
      </Text>
      <Textarea className="mt-2" numberOfLines={3} maxLength={280} value={comment} placeholder="What went well?" onChangeText={setComment} />
      <Text className="mt-1 text-right text-xs text-text-muted">{comment.length}/280</Text>
      {errorMessage ? <Text className="mt-3 text-sm text-danger-text">{errorMessage}</Text> : null}
    </Dialog>
  );
}

export function ServiceRatingList({ ratings }: { readonly ratings: readonly ListedServiceRating[] }) {
  if (ratings.length === 0) return null;
  return (
    <View className="rounded-card border border-line bg-surface p-4">
      <Text className="text-sm font-semibold text-text">Ratings</Text>
      {ratings.map((rating) => (
        <View key={rating.id} className="border-t border-line py-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-text">
              {rating.is_mine ? "Your rating" : rating.rater_role === "CUSTOMER" ? "Customer rating" : "Partner rating"}
            </Text>
            <Text className="text-sm font-semibold text-text">{rating.score}/5</Text>
          </View>
          {rating.comment ? <Text className="mt-1 text-sm text-text-secondary">{rating.comment}</Text> : null}
        </View>
      ))}
    </View>
  );
}
