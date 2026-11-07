import { useId } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";
import type { ChoiceChipOption } from "./choice-chips";

export interface MultiChoiceChipsProps {
  label: string;
  name: string;
  options: readonly ChoiceChipOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
  allowEmpty?: boolean;
}

const SELECTED = "border-selected bg-selected-surface";
const UNSELECTED = "border-line bg-surface";

export function MultiChoiceChips({
  label,
  name,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: MultiChoiceChipsProps) {
  const labelId = useId();
  const selectedSet = new Set(value);

  const toggle = (optVal: string) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(optVal)) {
      next.delete(optVal);
    } else {
      next.add(optVal);
    }
    onChange(Array.from(next));
  };

  return (
    <View
      accessibilityLabel={label}
      className={cn("flex-row flex-wrap gap-2", className)}
    >
      <Text nativeID={labelId} className="sr-only">
        {label}
      </Text>
      {options.map((option) => {
        const checked = selectedSet.has(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => toggle(option.value)}
            testID={`${name}-${option.value}`}
            className={cn(
              "min-h-10 items-center justify-center rounded-control border px-3.5 py-2",
              checked ? SELECTED : UNSELECTED,
            )}
          >
            <Text
              className={cn(
                "text-center text-xs font-semibold",
                checked ? "text-text font-bold" : "text-text-secondary",
              )}
            >
              {checked ? "✓ " : ""}
              {option.label}
            </Text>
            {option.description ? (
              <Text className="text-[10px] text-text-muted mt-0.5">{option.description}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
