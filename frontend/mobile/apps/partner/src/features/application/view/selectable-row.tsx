// Ported from frontend/apps/partner/features/application/view/selectable-row.tsx
import { cn, Text } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

export function SelectableRow({
  checked,
  disabled,
  onChange,
  label,
  caption,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
  caption?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onChange}
      className={cn(
        "min-h-11 flex-row items-start gap-3 rounded-control border p-3",
        checked ? "border-action bg-selected-surface" : "border-line bg-surface",
        disabled && "opacity-60",
      )}
    >
      <View
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 items-center justify-center rounded border",
          checked ? "border-action bg-action" : "border-line-strong bg-surface",
        )}
      >
        {checked ? <Text className="text-xs font-bold text-action-text">✓</Text> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-text">{label}</Text>
        {caption ? <Text className="text-sm text-text-secondary">{caption}</Text> : null}
      </View>
    </Pressable>
  );
}
