// Ported from frontend/apps/customer/features/crew/view/occasion-screen.tsx
import { Button, ChoiceChips, Field, Input, Text } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { EVENT_TYPE_CODE, GUEST_BAND_CODE, SERVICE_STYLE_CODE } from "../model/event-flow";
import { PhoneFrame, ScreenHeading } from "./phone-frame";
import { requiredAnswersPresent } from "./preset-questions";

export function occasionAnswered(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return requiredAnswersPresent(questions, answers);
}

export function OccasionFields({
  questions,
  answers,
  onAnswer,
  hiddenCodes = [],
}: {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (code: string, value: unknown) => void;
  hiddenCodes?: readonly string[];
  wide?: boolean;
}) {
  const visible = questions.filter((question) => !hiddenCodes.includes(question.code));
  return (
    <View className="gap-6">
      {visible.map((question) => {
        const value = answers[question.code];
        const options = question.options ?? [];
        if (
          (question.code === EVENT_TYPE_CODE || question.code === GUEST_BAND_CODE || question.code === SERVICE_STYLE_CODE) &&
          question.kind === "choice"
        ) {
          return (
            <View key={question.code} className="gap-2">
              <Text className="text-sm font-bold text-text">{question.label}</Text>
              {question.help ? <Text className="text-xs text-text-secondary">{question.help}</Text> : null}
              <View className="gap-2">
                {options.map((option) => {
                  const checked = option.value === value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: checked }}
                      onPress={() => onAnswer(question.code, option.value)}
                      className={
                        checked
                          ? "min-h-14 flex-row items-center gap-3 rounded-[14px] border border-selected bg-selected-surface px-3.5 py-2.5"
                          : "min-h-14 flex-row items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-2.5"
                      }
                    >
                      <Text className="text-sm text-text">{checked ? "●" : "○"}</Text>
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-semibold text-text">{option.label}</Text>
                        {option.description ? (
                          <Text className="text-[13px] leading-5 text-text-secondary">{option.description}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }
        if (question.kind === "choice" && options.every((option) => !option.description)) {
          return (
            <View key={question.code}>
              <Text className="mb-2 text-sm font-bold text-text">{question.label}</Text>
              <ChoiceChips
                label={question.label}
                name={question.code}
                options={options.map((option) => ({ value: option.value, label: option.label }))}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
              />
            </View>
          );
        }
        return (
          <Field key={question.code} label={question.label} description={question.help} required={question.required}>
            <Input
              value={typeof value === "string" ? value : ""}
              onChangeText={(next) => onAnswer(question.code, next)}
              placeholder="A sentence is enough (e.g. Annual gala dinner for 120 guests)"
            />
          </Field>
        );
      })}
    </View>
  );
}

export function OccasionScreen({
  serviceName,
  questions,
  answers,
  onAnswer,
  hiddenCodes,
  onContinue,
  onBack,
}: {
  serviceName: string;
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (code: string, value: unknown) => void;
  hiddenCodes?: readonly string[];
  onContinue: () => void;
  onBack: () => void;
}) {
  const complete = occasionAnswered(questions, answers);
  return (
    <PhoneFrame
      title="Book event staff"
      onBack={onBack}
      step="Step 1 of 3"
      reassurance="Choosing here creates no request."
      action={
        <Button block disabled={!complete} onPress={onContinue} className="h-[50px] rounded-[11px]">
          {complete ? "Build the crew" : "Tell us about the event to continue"}
        </Button>
      }
    >
      <ScreenHeading eyebrow={serviceName} title="Tell us about the event" />
      <OccasionFields questions={questions} answers={answers} onAnswer={onAnswer} hiddenCodes={hiddenCodes} />
    </PhoneFrame>
  );
}
