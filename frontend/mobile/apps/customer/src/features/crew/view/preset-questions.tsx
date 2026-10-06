// Ported from frontend/apps/customer/features/crew/view/preset-questions.tsx
import { ChoiceChips, Field, Input, QuantityStepper, Text, Textarea } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

const DEFAULT_NUMBER_FLOOR = 1;

export interface PresetQuestionsProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (code: string, value: unknown) => void;
  disabled?: boolean;
  hiddenCodes?: readonly string[];
}

function fitsOnChips(question: RequirementQuestionView): boolean {
  const options = question.options ?? [];
  if (options.length === 0 || options.length > 6) return false;
  return options.every((option) => option.description === undefined && option.label.length <= 28);
}

export function PresetQuestions({
  questions,
  answers,
  onAnswer,
  disabled = false,
  hiddenCodes = [],
}: PresetQuestionsProps) {
  return (
    <View className="gap-5">
      {questions.map((question) => {
        if (hiddenCodes.includes(question.code)) return null;
        const value = answers[question.code];
        if (question.kind === "number") {
          const floor = question.minimum ?? DEFAULT_NUMBER_FLOOR;
          const current = typeof value === "number" ? value : floor;
          const noun = question.label.toLowerCase();
          return (
            <QuantityStepper
              key={question.code}
              label={question.label}
              value={current}
              min={floor}
              onChange={(next) => onAnswer(question.code, next)}
              disabled={disabled}
              hint={question.help}
              unit={noun}
              decrementLabel={`Fewer ${noun}`}
              incrementLabel={`More ${noun}`}
            />
          );
        }
        return (
          <Field key={question.code} label={question.label} description={question.help} required={question.required}>
            {question.kind === "choice" && fitsOnChips(question) ? (
              <ChoiceChips
                label={question.label}
                name={question.code}
                options={(question.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
                disabled={disabled}
              />
            ) : question.kind === "choice" ? (
              <View accessibilityLabel={question.label} className="gap-2">
                {(question.options ?? []).map((option) => {
                  const isSelected = value === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected, disabled }}
                      disabled={disabled}
                      onPress={() => onAnswer(question.code, option.value)}
                      className={
                        isSelected
                          ? "flex-row items-start gap-3 rounded-card border border-selected-line bg-selected-surface p-3"
                          : "flex-row items-start gap-3 rounded-card border border-line bg-surface p-3"
                      }
                    >
                      <Text className="mt-0.5 text-sm text-text">{isSelected ? "●" : "○"}</Text>
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="text-sm font-semibold text-text">{option.label}</Text>
                        {option.description ? (
                          <Text className="text-sm leading-6 text-text-secondary">{option.description}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : question.kind === "multi" ? (
              <View className="flex-row flex-wrap gap-2">
                {(question.options ?? []).map((option) => {
                  const selected = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
                  const checked = selected.includes(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled }}
                      disabled={disabled}
                      onPress={() =>
                        onAnswer(
                          question.code,
                          checked ? selected.filter((entry) => entry !== option.value) : [...selected, option.value],
                        )
                      }
                      className={
                        checked
                          ? "min-h-11 items-center justify-center rounded-control border border-selected bg-selected-surface px-4 py-2"
                          : "min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-4 py-2"
                      }
                    >
                      <Text className={checked ? "text-sm font-semibold text-text" : "text-sm font-medium text-text-secondary"}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : question.kind === "boolean" ? (
              <View className="gap-2">
                {[
                  { value: true, label: "Yes" },
                  { value: false, label: "No" },
                ].map((option) => (
                  <Pressable
                    key={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: value === option.value, disabled }}
                    disabled={disabled}
                    onPress={() => onAnswer(question.code, option.value)}
                    className="flex-row items-center gap-3"
                  >
                    <Text className="text-sm text-text">{value === option.value ? "●" : "○"}</Text>
                    <Text className="text-sm leading-6 text-text">{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Textarea
                rows={3}
                editable={!disabled}
                value={typeof value === "string" ? value : ""}
                onChangeText={(next) => onAnswer(question.code, next)}
              />
            )}
          </Field>
        );
      })}
    </View>
  );
}

export function requiredAnswersPresent(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return questions.every((question) => {
    if (!question.required) return true;
    const value = answers[question.code];
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}
