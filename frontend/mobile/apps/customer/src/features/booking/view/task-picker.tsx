// Ported from frontend/apps/customer/features/booking/view/task-picker.tsx
import { Text, formatMoney } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import { useWorkspace } from "./workspace-context";

export interface TaskOption {
  code: string;
  label: string;
  unitPricePaise: number;
  description?: string;
}

function Stepper({
  label,
  quantity,
  onChange,
}: {
  label: string;
  quantity: number;
  onChange: (next: number) => void;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove one ${label}`}
        disabled={quantity === 0}
        onPress={() => onChange(quantity - 1)}
        className="h-11 w-11 items-center justify-center rounded-control border border-line-strong"
      >
        <Text className={quantity === 0 ? "text-lg font-semibold text-text-muted" : "text-lg font-semibold text-text"}>−</Text>
      </Pressable>
      <Text accessibilityLabel={`${quantity} ${label}`} className="w-8 text-center text-base font-semibold text-text">
        {quantity}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add one ${label}`}
        onPress={() => onChange(quantity + 1)}
        className="h-11 w-11 items-center justify-center rounded-control border border-line-strong"
      >
        <Text className="text-lg font-semibold text-text">+</Text>
      </Pressable>
    </View>
  );
}

export function TaskPicker({
  tasks,
  minimumSubtotalPaise,
}: {
  tasks: readonly TaskOption[];
  minimumSubtotalPaise: number | null;
}) {
  const { state, dispatch } = useWorkspace();
  const quantityOf = (code: string) => state.taskLines.find((line) => line.taskCode === code)?.quantity ?? 0;
  const selectedTotalPaise = state.taskLines.reduce((sum, line) => {
    const task = tasks.find((candidate) => candidate.code === line.taskCode);
    return sum + (task?.unitPricePaise ?? 0) * line.quantity;
  }, 0);
  const belowMinimum =
    minimumSubtotalPaise !== null && selectedTotalPaise > 0 && selectedTotalPaise < minimumSubtotalPaise;

  return (
    <View>
      <Text className="text-sm font-semibold text-text">What do you need done?</Text>
      <Text className="mt-1 text-sm text-text-secondary">Choose how many of each. You are charged per job, not by the hour.</Text>
      <View className="mt-3 gap-2">
        {tasks.map((task) => {
          const quantity = quantityOf(task.code);
          return (
            <View key={task.code} className="min-h-16 flex-row items-center justify-between gap-4 rounded-plate border border-line-strong px-4 py-3">
              <View className="min-w-0 flex-1">
                <Text className="font-medium text-text">{task.label}</Text>
                {task.description ? <Text className="text-sm text-text-secondary">{task.description}</Text> : null}
                <Text className="text-sm text-text-secondary">{formatMoney(task.unitPricePaise)} each</Text>
              </View>
              <Stepper
                label={task.label}
                quantity={quantity}
                onChange={(next) => dispatch({ type: "SET_TASK_QUANTITY", taskCode: task.code, quantity: next })}
              />
            </View>
          );
        })}
      </View>
      {belowMinimum ? (
        <Text className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
          A minimum visit charge of {formatMoney(minimumSubtotalPaise)} applies. Add more work to this visit at no extra call-out cost.
        </Text>
      ) : null}
    </View>
  );
}
