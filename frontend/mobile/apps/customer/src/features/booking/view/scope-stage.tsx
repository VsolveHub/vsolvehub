// Ported from frontend/apps/customer/features/booking/view/scope-stage.tsx
import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, Text, Textarea } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import { isAnswered } from "../model/state";
import { TaskPicker, type TaskOption } from "./task-picker";
import { useWorkspace } from "./workspace-context";

type Question = Schemas["ServiceQuestion"];

function QuestionControl({
  question,
  value,
  onChange,
  showError,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
  showError: boolean;
}) {
  const error = showError && question.is_required && !isAnswered(value) ? "Please answer this to continue." : undefined;

  if (question.kind === "BOOLEAN") {
    return (
      <Field label={question.prompt} description={question.help_text || undefined} required={question.is_required} error={error}>
        <Select
          placeholder="Choose one"
          value={value === undefined ? "" : String(value)}
          options={[
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          onChange={(event) => onChange(event.target.value === "true")}
        />
      </Field>
    );
  }

  if (question.kind === "SINGLE_CHOICE") {
    return (
      <Field label={question.prompt} description={question.help_text || undefined} required={question.is_required} error={error}>
        <Select
          placeholder="Choose one"
          value={typeof value === "string" ? value : ""}
          options={question.options.map((option) => ({ value: option.code, label: option.label }))}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  }

  if (question.kind === "MULTIPLE_CHOICE") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <View>
        <Text className="text-sm font-semibold text-text">
          {question.prompt}
          {question.is_required ? " *" : " (optional)"}
        </Text>
        {question.help_text ? <Text className="mt-1 text-sm text-text-secondary">{question.help_text}</Text> : null}
        <View className="mt-2 gap-2">
          {question.options.map((option) => {
            const checked = selected.includes(option.code);
            return (
              <Pressable
                key={option.code}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() =>
                  onChange(checked ? selected.filter((code) => code !== option.code) : [...selected, option.code])
                }
                className="min-h-11 flex-row items-center gap-3 rounded-control border border-line-strong px-3 py-2"
              >
                <View className={checked ? "h-5 w-5 items-center justify-center rounded border border-action bg-action" : "h-5 w-5 rounded border border-line-strong"}>
                  {checked ? <Text className="text-xs text-white">✓</Text> : null}
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-text">{option.label}</Text>
                  {option.description ? <Text className="text-sm text-text-secondary">{option.description}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text className="mt-1.5 text-sm font-medium text-danger-text">{error}</Text> : null}
      </View>
    );
  }

  if (question.kind === "NUMBER") {
    return (
      <Field label={question.prompt} description={question.help_text || undefined} required={question.is_required} error={error}>
        <Input
          keyboardType="number-pad"
          value={typeof value === "number" ? String(value) : ""}
          onChangeText={(text) => onChange(text === "" ? undefined : Number(text))}
        />
      </Field>
    );
  }

  return (
    <Field label={question.prompt} description={question.help_text || undefined} required={question.is_required} error={error}>
      <Textarea value={typeof value === "string" ? value : ""} onChangeText={(text) => onChange(text)} />
    </Field>
  );
}

export function ScopeStage({
  questions,
  tasks,
  minimumSubtotalPaise,
  showErrors = false,
}: {
  questions: readonly Question[];
  tasks: readonly TaskOption[];
  minimumSubtotalPaise: number | null;
  showErrors?: boolean;
}) {
  const { state, dispatch } = useWorkspace();
  return (
    <View>
      <Text className="text-lg font-semibold text-text">Tell us about the work</Text>
      <Text className="mt-1 text-sm text-text-secondary">This helps us send the right professional with the right parts.</Text>
      <View className="mt-4 gap-5">
        <TaskPicker tasks={tasks} minimumSubtotalPaise={minimumSubtotalPaise} />
        {questions.map((question) => (
          <QuestionControl
            key={question.code}
            question={question}
            value={state.answers[question.code]}
            onChange={(value) => dispatch({ type: "ANSWER", questionCode: question.code, value })}
            showError={showErrors}
          />
        ))}
        <Field label="Anything else we should know?" description="Landmarks, access instructions, or what you have already tried.">
          <Textarea value={state.notes} onChangeText={(notes) => dispatch({ type: "SET_NOTES", notes })} />
        </Field>
      </View>
    </View>
  );
}
