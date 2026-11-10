import { ErrorState, Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { useCaptainStatus } from "../queries";

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
}

/** The captain's Wallet: the pass that lets them drive. Buying a pass is added in Phase 6C. */
export function CaptainWallet() {
  const status = useCaptainStatus();

  if (status.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (status.isError) {
    return (
      <ErrorState
        title="We couldn't load your pass"
        message={describeError(status.error).message}
        actionLabel="Try again"
        onAction={() => void status.refetch()}
      />
    );
  }

  const { active_pass: active, queued_pass: queued } = status.data;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View className="rounded-2xl bg-surface p-4 gap-1">
        <Text className="text-xs font-semibold uppercase text-text-muted">Your pass</Text>
        {active ? (
          <>
            <Text className="text-base font-bold text-text">{active.plan.name}</Text>
            <Text className="text-sm text-text">Ends {when(active.ends_at)}</Text>
          </>
        ) : (
          <Text className="text-sm text-text-muted">No active pass. You need one to go on duty.</Text>
        )}
        {queued ? (
          <Text className="text-sm text-text-muted">Next: {queued.plan.name}, starts when this one ends</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
