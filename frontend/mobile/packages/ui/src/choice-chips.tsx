// Ported from frontend/packages/ui/src/choice-chips.tsx
import { useId } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface ChoiceChipOption {
  value: string;
  label: string;
  description?: string | null;
}

export interface ChoiceChipsProps {
  label: string;
  name: string;
  options: readonly ChoiceChipOption[];
  value: string | null;
  onChange: (value: string) => void;
  layout?: "wrap" | "bar";
  disabled?: boolean;
  className?: string;
}

const SELECTED = "border-selected bg-selected-surface";
const UNSELECTED = "border-line-strong bg-surface";

export function ChoiceChips({
  label,
  name,
  options,
  value,
  onChange,
  layout = "wrap",
  disabled = false,
  className,
}: ChoiceChipsProps) {
  const labelId = useId();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={cn(layout === "wrap" ? "flex-row flex-wrap gap-2" : "w-full flex-row", className)}
    >
      <Text nativeID={labelId} className="sr-only">
        {label}
      </Text>
      {options.map((option, index) => {
        const checked = value === option.value;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={`${name}-${option.value}`}
            className={cn(
              "min-h-11 items-center justify-center border px-3 py-2",
              checked ? SELECTED : UNSELECTED,
              layout === "wrap"
                ? "rounded-control px-4"
                : cn("flex-1", isFirst && "rounded-l-control", isLast && "rounded-r-control"),
            )}
          >
            <Text className={cn("text-center text-sm", checked ? "font-semibold text-text" : "font-medium text-text-secondary")}>
              {option.label}
            </Text>
            {option.description && layout === "wrap" ? (
              <Text className="text-xs text-text-secondary">{option.description}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
