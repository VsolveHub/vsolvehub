// Ported from frontend/apps/customer/features/booking/view/workspace.tsx
import type { Schemas } from "@vsolve/api-client";
import { Button, Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { cartVersionConflict, duplicateCartItemConflict } from "@/features/checkout/conflicts";
import { useAddCartItem, useCart } from "@/features/checkout/queries";

import { totalTaskQuantity } from "../model/state";
import { DuplicateItemDialog } from "./cart-conflict-dialog";
import { ScopeStage } from "./scope-stage";
import type { TaskOption } from "./task-picker";
import { useWorkspace } from "./workspace-context";

const BLOCK_MESSAGES: Record<string, string> = {
  NO_TASK_SELECTED: "Choose at least one job.",
  REQUIRED_QUESTION_UNANSWERED: "Answer the questions marked required.",
  CONFIGURATION_NOT_LOADED: "Loading this service.",
};

export function BookingWorkspace({
  service,
  variant,
  tasks,
  minimumSubtotalPaise,
}: {
  service: Schemas["ServiceDetail"];
  variant: Schemas["ServiceVariantConfiguration"];
  tasks: readonly TaskOption[];
  minimumSubtotalPaise: number | null;
}) {
  const { state, blocked, canContinue } = useWorkspace();
  const [showScopeErrors, setShowScopeErrors] = useState(false);
  const router = useRouter();
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const duplicate = duplicateCartItemConflict(addItem.error);
  const staleVersion = cartVersionConflict(addItem.error);

  function handleAdd() {
    if (!canContinue) {
      setShowScopeErrors(true);
      return;
    }
    setShowScopeErrors(false);
    const cart = cartQuery.data;
    if (!cart) return;
    addItem.mutate(
      {
        expectedCartVersion: cart.version,
        variantId: variant.id,
        quantity: totalTaskQuantity(state),
        scope: state.answers,
      },
      { onSuccess: () => router.push("/cart") },
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-6">
        <Text className="text-xl font-bold text-text">{service.name}</Text>
        <View className="mt-4">
          <ScopeStage
            questions={variant.questions}
            tasks={tasks}
            minimumSubtotalPaise={minimumSubtotalPaise}
            showErrors={showScopeErrors}
          />
        </View>
        {staleVersion !== null ? (
          <Text className="mt-4 text-sm text-danger">
            Your booking changed in another tab, so this was not added. We have reloaded it — press Add again.
          </Text>
        ) : null}
        {addItem.isError && staleVersion === null && duplicate === null ? (
          <Text className="mt-4 text-sm text-danger">{describeError(addItem.error, "mutation").message}</Text>
        ) : null}
      </ScrollView>
      <View className="flex-row items-center justify-between gap-4 border-t border-line bg-surface px-4 py-4">
        <Button variant="ghost" onPress={() => router.push("/cart")}>
          View booking
        </Button>
        <View className="flex-1 items-end gap-2">
          {blocked && !canContinue ? (
            <Text className="text-right text-sm text-text-secondary">{BLOCK_MESSAGES[blocked] ?? "Complete this step to continue."}</Text>
          ) : null}
          <Button onPress={handleAdd} disabled={!canContinue || cartQuery.isPending} loading={addItem.isPending} loadingLabel="Adding">
            Add to booking
          </Button>
        </View>
      </View>
      <DuplicateItemDialog
        isOpen={duplicate !== null}
        serviceName={service.name}
        onViewBooking={() => router.push("/cart")}
        onDismiss={() => addItem.reset()}
      />
    </View>
  );
}
