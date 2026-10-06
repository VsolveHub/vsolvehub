// Ported from frontend/apps/partner/features/capability/view/business-type-choice.tsx
import { Card, cn, Text } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import type { BusinessType } from "../adapters/business-type";
import type { BusinessTypeChoice } from "../adapters/capability-options";

export interface BusinessTypeChoiceProps {
  readonly choices: readonly BusinessTypeChoice[];
  readonly value: BusinessType | null;
  readonly onChange: (value: BusinessType) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function BusinessTypeChoiceGroup({
  choices,
  value,
  onChange,
  disabled = false,
  className,
}: BusinessTypeChoiceProps) {
  return (
    <View className={cn(className)}>
      <Text className="text-base font-semibold text-text">How do you work?</Text>
      <Text className="mt-1 text-sm text-text-secondary">
        This decides who pays you and how tax is handled. You can change it later.
      </Text>
      <View className="mt-4 flex-col gap-2">
        {choices.map((choice) => {
          const isSelected = value === choice.value;
          return (
            <Card key={choice.value} padding="none" className={cn("p-0", isSelected && "border-action")}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled }}
                disabled={disabled}
                onPress={() => onChange(choice.value)}
                className="flex-row items-start gap-3 p-4"
              >
                <View
                  className={cn(
                    "mt-1 h-5 w-5 items-center justify-center rounded-full border",
                    isSelected ? "border-action" : "border-line-strong",
                  )}
                >
                  {isSelected ? <View className="h-2.5 w-2.5 rounded-full bg-action" /> : null}
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-text">{choice.label}</Text>
                  <Text className="mt-1 text-sm leading-6 text-text-secondary">{choice.consequence}</Text>
                </View>
              </Pressable>
            </Card>
          );
        })}
      </View>
    </View>
  );
}
