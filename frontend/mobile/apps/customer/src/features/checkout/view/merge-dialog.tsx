// Ported from frontend/apps/customer/features/checkout/view/merge-dialog.tsx
import { Button, Dialog, ErrorState, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { MERGE_ACTIONS, type CartMergeConflict, type MergeAction } from "@/features/checkout/conflicts";

const ACTION_LABELS: Record<MergeAction, string> = {
  KEEP_CUSTOMER: "Keep the one in my account",
  KEEP_SESSION: "Keep the one I just set up",
  KEEP_BOTH: "Keep both",
};

const ACTION_HINTS: Record<MergeAction, string> = {
  KEEP_CUSTOMER: "Discards the copy from this browser session.",
  KEEP_SESSION: "Discards the copy saved to your account.",
  KEEP_BOTH: "Books the same service twice.",
};

export function MergeDialog({
  conflict,
  isMerging,
  errorMessage,
  onConfirm,
  onRefresh,
  onDismiss,
}: {
  conflict: CartMergeConflict | null;
  isMerging: boolean;
  errorMessage: string | null;
  onConfirm: (decisions: { sessionItemId: string; action: MergeAction }[]) => void;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, MergeAction>>({});
  if (conflict === null) return null;

  const decidable = conflict.duplicates.length > 0;
  const allDecided = decidable && conflict.duplicates.every((duplicate) => decisions[duplicate.sessionItemId]);
  const canSend = allDecided && conflict.customerCartVersion !== null && conflict.sessionCartVersion !== null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title="You already had a booking started"
      description={
        decidable
          ? "Some of what you set up before logging in is already in your account. Choose what to keep — nothing is discarded until you do."
          : undefined
      }
      footer={
        decidable ? (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-3">
              <Button
                disabled={!canSend}
                loading={isMerging}
                loadingLabel="Merging"
                onPress={() =>
                  onConfirm(
                    conflict.duplicates.map((duplicate) => ({
                      sessionItemId: duplicate.sessionItemId,
                      action: decisions[duplicate.sessionItemId] as MergeAction,
                    })),
                  )
                }
              >
                Merge my bookings
              </Button>
              <Button variant="outline" disabled={isMerging} onPress={onRefresh}>
                Reload my cart
              </Button>
            </View>
            {!allDecided ? <Text className="text-sm text-text-secondary">Choose an option for every duplicate to continue.</Text> : null}
          </View>
        ) : null
      }
    >
      {conflict.versionChanged ? (
        <ErrorState
          title="Your cart changed while we were merging"
          message="Someone — probably you, in another tab — edited this cart. Reload it and we will ask again against what is actually there."
          actionLabel="Reload my cart"
          onAction={onRefresh}
        />
      ) : null}
      {conflict.limit !== null ? (
        <ErrorState
          title="That would be too many services in one booking"
          message={
            conflict.limit.combinedItemCount !== null && conflict.limit.maximumItemCount !== null
              ? `Together they come to ${conflict.limit.combinedItemCount} services and a single booking holds ${conflict.limit.maximumItemCount}. Book some of them separately.`
              : "Together they exceed what a single booking can hold. Book some of them separately."
          }
          actionLabel="Reload my cart"
          onAction={onRefresh}
        />
      ) : null}
      {decidable
        ? conflict.duplicates.map((duplicate, index) => (
            <View key={duplicate.sessionItemId} className="mt-4 gap-2">
              <Text className="text-sm font-semibold text-text">
                Duplicate request {index + 1} of {conflict.duplicates.length}
              </Text>
              {MERGE_ACTIONS.map((action) => {
                const selected = decisions[duplicate.sessionItemId] === action;
                return (
                  <Pressable
                    key={action}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: isMerging }}
                    disabled={isMerging}
                    onPress={() => setDecisions((current) => ({ ...current, [duplicate.sessionItemId]: action }))}
                    className={selected ? "rounded-plate border border-action bg-signal-50 p-3" : "rounded-plate border border-line-strong p-3"}
                  >
                    <Text className="text-sm font-medium text-text">{ACTION_LABELS[action]}</Text>
                    <Text className="text-sm text-text-secondary">{ACTION_HINTS[action]}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))
        : null}
      {errorMessage ? <Text className="mt-3 text-sm text-danger">{errorMessage}</Text> : null}
    </Dialog>
  );
}
