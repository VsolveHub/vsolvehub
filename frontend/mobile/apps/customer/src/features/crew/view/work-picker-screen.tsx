// Ported from frontend/apps/customer/features/crew/view/work-picker-screen.tsx
import { Button, ErrorState, Text } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { PhoneFrame, ScreenHeading } from "./phone-frame";

export function WorkPickerScreen({
  serviceName,
  question,
  value,
  onSelect,
  onContinue,
  onBack,
}: {
  serviceName: string;
  question: RequirementQuestionView | null;
  value: string | null;
  isWide?: boolean;
  onSelect: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const selected = question?.options?.find((option) => option.value === value) ?? null;
  const actionLabel = selected === null ? "Choose work to continue" : "Continue with this work";
  return (
    <PhoneFrame
      title="Choose the work"
      onBack={onBack}
      step="Step 1 of 3"
      reassurance="Choosing here creates no request."
      action={
        <Button block onPress={onContinue} disabled={selected === null} className="h-[50px] rounded-[11px]">
          {actionLabel}
        </Button>
      }
    >
      <ScreenHeading eyebrow={serviceName} title="What will they be doing?" />
      <Text className="mt-2 text-sm leading-6 text-text-secondary">
        <Text className="text-sm font-bold text-text">Required.</Text> Pick the closest match. You can change it before you see the rate.
      </Text>
      <View className="mt-5">
        {question === null || question.options === undefined || question.options.length === 0 ? (
          <ErrorState
            title="Work choices are not available"
            message="This crew service is missing its work list. Nothing has been sent; choose another service while we fix it."
            severity="error"
            inline
          />
        ) : (
          <View accessibilityLabel={question.label} className="gap-3">
            {question.options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelect(option.value)}
                  className={
                    isSelected
                      ? "min-h-[112px] flex-row items-start gap-3 rounded-[18px] border border-selected bg-selected-surface p-4"
                      : "min-h-[112px] flex-row items-start gap-3 rounded-[18px] border border-line bg-surface p-4 shadow-sm"
                  }
                >
                  <View className={isSelected ? "size-[52px] items-center justify-center rounded-[14px] bg-navy-900" : "size-[52px] items-center justify-center rounded-[14px] bg-action-surface"}>
                    <Text className={isSelected ? "text-lg font-bold text-signal-300" : "text-lg font-bold text-navy-700"}>
                      {option.label.charAt(0)}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-bold leading-5 text-text">{option.label}</Text>
                    {option.description ? (
                      <Text className="mt-1.5 text-[13px] leading-5 text-text-secondary">{option.description}</Text>
                    ) : null}
                  </View>
                  <Text className={isSelected ? "text-selected" : "text-transparent"}>✓</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </PhoneFrame>
  );
}
