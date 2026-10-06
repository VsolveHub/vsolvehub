// Ported from frontend/apps/partner/features/shift/view/shift-day-screen.tsx
// and features/engagement/view stage evidence composer.
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Input, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { View } from "react-native";

import {
  usePartnerEngagement,
  useStartStage,
  useSubmitStageEvidence,
  useUploadStageEvidence,
} from "@/features/engagement/queries";
import { useConfirmDaySettled } from "@/features/shift/queries";

export function ShiftDayScreen({ engagementId, stageId }: { engagementId: string; stageId: string }) {
  return <StageWork engagementId={engagementId} stageId={stageId} mode="day" />;
}

export function StageScreen({ engagementId, stageId }: { engagementId: string; stageId: string }) {
  return <StageWork engagementId={engagementId} stageId={stageId} mode="stage" />;
}

function StageWork({
  engagementId,
  stageId,
  mode,
}: {
  engagementId: string;
  stageId: string;
  mode: "day" | "stage";
}) {
  const engagement = usePartnerEngagement(engagementId);
  const start = useStartStage(engagementId);
  const upload = useUploadStageEvidence(engagementId);
  const submit = useSubmitStageEvidence(engagementId);
  const settle = useConfirmDaySettled({ engagementId, stageId });
  const [note, setNote] = useState("");

  if (engagement.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-canvas">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading this {mode}…</Text>
      </View>
    );
  }
  const stage = engagement.data?.stages.find((row) => row.id === stageId);
  if (!stage) {
    return <ErrorState title="This stage is not on the job" message="Go back to the job and open it again." />;
  }

  async function addPhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const file = new File([blob], asset.fileName ?? "evidence.jpg", { type: asset.mimeType ?? "image/jpeg" });
    upload.mutate({ stageId, kind: "PHOTO", file });
  }

  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">{stage.label}</Text>
      <Text className="text-sm text-text-secondary">{stage.status}</Text>
      {stage.status === "PENDING" ? (
        <Button loading={start.isPending} loadingLabel="Starting" onPress={() => start.mutate({ stageId })}>
          Start work
        </Button>
      ) : null}
      <Button variant="secondary" loading={upload.isPending} loadingLabel="Uploading" onPress={() => void addPhoto()}>
        Add a photo
      </Button>
      <Input value={note} onChangeText={setNote} placeholder="What you finished" />
      {mode === "day" && stage.shift_summary?.settlement_status === "SETTLED" && stage.shift_summary.settlement_amount_paise !== null ? (
        <Text className="text-sm font-semibold text-text">Paid {formatMoney(stage.shift_summary.settlement_amount_paise)}</Text>
      ) : null}
      {mode === "day" && stage.shift_summary?.settlement_status === "SUPERVISOR_CLAIMED" ? (
        <Text className="text-sm text-text-secondary">You tapped; waiting for the customer.</Text>
      ) : null}
      {mode === "day" &&
      stage.shift_summary?.settlement_status === "CUSTOMER_CLAIMED" &&
      stage.shift_summary.settlement_amount_paise !== null ? (
        <Button loading={settle.isPending} loadingLabel="Recording" onPress={() => settle.mutate()}>
          {`Got paid ${formatMoney(stage.shift_summary.settlement_amount_paise)}`}
        </Button>
      ) : null}
      <Button
        disabled={note.trim() === ""}
        loading={submit.isPending}
        loadingLabel="Sending"
        onPress={() =>
          submit.mutate({
            stageId,
            note: note.trim(),
            submissionOrdinal: stage.evidence.filter((row) => row.kind === "NOTE").length,
          })
        }
      >
        Submit for review
      </Button>
      {start.error ? <Text className="text-sm text-danger-text">{describeError(start.error, "mutation").message}</Text> : null}
      {upload.error ? <Text className="text-sm text-danger-text">{upload.error instanceof Error ? upload.error.message : "The photo did not upload."}</Text> : null}
      {submit.error ? <Text className="text-sm text-danger-text">{describeError(submit.error, "mutation").message}</Text> : null}
    </View>
  );
}
