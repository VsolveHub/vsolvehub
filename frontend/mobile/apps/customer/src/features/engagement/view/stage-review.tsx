import { describeError } from "@vsolve/query/native";
import { Button, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { useApproveStage, useDisputeStage, useEngagement } from "@/features/engagement/queries";
import { RatingForm } from "@/features/ratings/view/rating-form";

export function StageReview({ engagementId, stageId }: { engagementId: string; stageId: string }) {
  const router = useRouter();
  const engagement = useEngagement(engagementId);
  const approve = useApproveStage();
  const dispute = useDisputeStage();
  const [note, setNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await engagement.refetch();
    setRefreshing(false);
  };

  const stage = engagement.data?.stages.find((row) => row.id === stageId);
  if (engagement.isPending) return <Spinner size="sm" />;
  if (!stage) return <Text className="p-4 text-text-secondary">This stage is not on the job.</Text>;
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-3 px-4 py-6"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Agreement"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push(`/engagements/${engagementId}` as never);
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <Text className="text-2xl font-extrabold text-text">{stage.label}</Text>
      </View>
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
    </ScrollView>
  );
}
