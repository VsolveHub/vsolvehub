import { describeError } from "@vsolve/query/native";
import { Button, Input, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { useRatings, useSubmitRating, type RatingSubject } from "@/features/ratings/queries";

export function RatingForm({ subject, id }: { subject: RatingSubject; id: string }) {
  const ratings = useRatings(subject, id, true);
  const submit = useSubmitRating(subject, id);
  const [score, setScore] = useState("5");
  const [comment, setComment] = useState("");
  return (
    <View className="gap-2">
      <Text className="text-base font-bold text-text">Rate this work</Text>
      {ratings.data ? <Text className="text-sm text-text-secondary">Saved.</Text> : null}
      <Input value={score} onChangeText={setScore} keyboardType="number-pad" placeholder="Score 1 to 5" />
      <Input value={comment} onChangeText={setComment} placeholder="Comment" />
      {submit.error ? <Text className="text-sm text-danger-text">{describeError(submit.error, "mutation").message}</Text> : null}
      <Button
        onPress={() => {
          const parsed = Number(score);
          if (!Number.isFinite(parsed)) return;
          submit.mutate({ score: parsed, comment });
        }}
      >
        Send rating
      </Button>
    </View>
  );
}
