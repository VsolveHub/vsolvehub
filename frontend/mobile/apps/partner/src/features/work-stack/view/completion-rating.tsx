// Ported from frontend/apps/partner/features/ratings/view/completion-rating.tsx
import { describeError } from "@vsolve/query/native";
import { ServiceRatingDialog, ServiceRatingList } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { useRatings, useSubmitRating, type RatingSubject } from "@/features/ratings/queries";

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
  const submit = useSubmitRating(subject, id);
  const [dismissed, setDismissed] = useState(false);
  const summary = ratings.data;
  const errorMessage = submit.isError ? describeError(submit.error, "mutation").message : null;

  if (!isComplete) return null;

  return (
    <View>
      {summary ? <ServiceRatingList ratings={summary.ratings} /> : null}
      {summary ? (
        <ServiceRatingDialog
          open={summary.can_rate && !dismissed}
          counterpartyLabel={summary.counterparty_label}
          isSubmitting={submit.isPending}
          errorMessage={errorMessage}
          onOpenChange={(open) => {
            if (!open) setDismissed(true);
          }}
          onSubmit={(score, comment) => submit.mutate({ score, comment })}
        />
      ) : null}
    </View>
  );
}
