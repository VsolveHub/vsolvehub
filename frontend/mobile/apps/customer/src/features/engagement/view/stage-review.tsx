// Ported from frontend/apps/customer/features/engagement/view/stage-review-screen.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { useApproveStage, useDisputeStage, useEngagement } from "@/features/engagement/queries";
import { RatingForm } from "@/features/ratings/view/rating-form";

export function StageReview({ engagementId, stageId }: { engagementId: string; stageId: string }) {
  const engagement = useEngagement(engagementId);
  const approve = useApproveStage();
  const dispute = useDisputeStage();
  const [note, setNote] = useState("");
  const stage = engagement.data?.stages.find((row) => row.id === stageId);
  if (engagement.isPending) return <Spinner size="sm" />;
  if (!stage) return <Text className="p-4 text-text-secondary">This stage is not on the job.</Text>;
  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">{stage.label}</Text>
      <Text className="text-sm text-text-secondary">{stage.status}</Text>
      {stage.status === "AWAITING_REVIEW" ? (
        <Button loading={approve.isPending} onPress={() => approve.mutate({ engagementId, stageId })}>
          Approve
        </Button>
      ) : null}
      <Input value={note} onChangeText={setNote} placeholder="What is wrong" />
      <Button
        variant="danger"
        loading={dispute.isPending}
        onPress={() => dispute.mutate({ engagementId, stageId, reasonCode: "NOT_DONE", note })}
      >
        Raise an issue
      </Button>
      {approve.error || dispute.error ? (
        <Text className="text-sm text-danger-text">{describeError(approve.error ?? dispute.error, "mutation").message}</Text>
      ) : null}
      <RatingForm subject="engagement" id={engagementId} />
    </View>
  );
}
