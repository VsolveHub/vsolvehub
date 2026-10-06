// Ported from frontend/apps/partner/features/capability/view/capability-picker.tsx
import { Badge, Button, Card, cn, EmptyState, Field, Input, Select, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { CapabilityChoice, CapabilityOptionsView } from "../adapters/capability-options";
import { unansweredRequired, type RegistrationQuestion } from "../adapters/registration-questions";

export interface CapabilityPickerProps {
  readonly state: AsyncState<CapabilityOptionsView>;
  readonly onRequest: (input: {
    variantId: string;
    asks: Record<string, number>;
    answers: Record<string, string>;
  }) => void;
  readonly pendingVariantId?: string | null;
  readonly error?: { readonly variantId: string; readonly message: string } | null;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CapabilityPicker({
  state,
  onRequest,
  pendingVariantId = null,
  error = null,
  onRetry,
  className,
}: CapabilityPickerProps) {
  return (
    <AsyncSection
      state={state}
      label="Loading the work you can apply for"
      onRetry={onRetry}
      isEmpty={(view) => view.isEmpty}
      empty={
        <EmptyState
          title="Nothing to apply for yet"
          description="The services you have chosen are not open to workforce or project vendors. Adding another service on “Your work” may open one."
        />
      }
    >
      {(view) => (
        <View className={cn("flex-col gap-6", className)}>
          {view.byCategory.map((group) => (
            <View key={group.category}>
              <Text className="text-sm font-semibold uppercase tracking-wide text-text-muted">{group.category}</Text>
              <View className="mt-2 flex-col gap-3">
                {group.choices.map((choice) => (
                  <CapabilityCard
                    key={choice.variantId}
                    choice={choice}
                    pending={pendingVariantId === choice.variantId}
                    error={error?.variantId === choice.variantId ? error.message : null}
                    onRequest={(asks, answers) => onRequest({ variantId: choice.variantId, asks, answers })}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </AsyncSection>
  );
}

function CapabilityCard({
  choice,
  pending,
  error,
  onRequest,
}: {
  choice: CapabilityChoice;
  pending: boolean;
  error: string | null;
  onRequest: (asks: Record<string, number>, answers: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const askValue = (name: string): number => Number(values[name] ?? "");
  const asks: Record<string, number> = Object.fromEntries(choice.asks.map((ask) => [ask.name, askValue(ask.name)]));
  const missingAnswers = unansweredRequired(choice.registrationQuestions.questions, answers);
  const isComplete =
    choice.asks.every((ask) => {
      const value = askValue(ask.name);
      return Number.isFinite(value) && value > 0;
    }) && missingAnswers.length === 0;

  return (
    <Card className="p-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold text-text">{choice.variantName}</Text>
        {choice.alreadyRequested ? <Badge tone="info">Already asked</Badge> : null}
      </View>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{choice.lifecycleExplanation}</Text>
      <Text className="mt-2 text-sm text-text-secondary">
        {choice.isPlatformPaid
          ? "Vsolve holds each stage of the payment until the customer approves it."
          : "The customer pays you directly."}
      </Text>
      {choice.requiresInsurance ? (
        <Text className="mt-2 text-sm text-text-secondary">
          You will be asked for worker insurance before this is approved.
        </Text>
      ) : null}

      {choice.alreadyRequested ? (
        <Text className="mt-3 text-sm text-text-muted">
          You have a live request for this. Its progress is on your capabilities list.
        </Text>
      ) : (
        <View>
          {choice.asks.length > 0 ? (
            <View className="mt-4 flex-col gap-3">
              {choice.asks.map((ask) => (
                <Field
                  key={ask.name}
                  label={ask.isMoney ? `${ask.label} (₹)` : ask.label}
                  description={ask.help}
                  required
                >
                  <Input
                    keyboardType="number-pad"
                    value={values[ask.name] ?? ""}
                    onChangeText={(value) => setValues((current) => ({ ...current, [ask.name]: value }))}
                  />
                </Field>
              ))}
            </View>
          ) : null}

          {choice.registrationQuestions.questions.length > 0 ? (
            <View className="mt-4 flex-col gap-3">
              {choice.registrationQuestions.questions.map((question) => (
                <RegistrationAnswerField
                  key={question.code}
                  question={question}
                  value={answers[question.code] ?? ""}
                  onChange={(value) => setAnswers((current) => ({ ...current, [question.code]: value }))}
                />
              ))}
            </View>
          ) : null}

          {choice.registrationQuestions.unsupported.length > 0 ? (
            <Text className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-sm leading-6 text-text-secondary">
              This service asks something your app cannot show yet
              {` (${choice.registrationQuestions.unsupported.join(", ")})`}. Update the app, or ask support to
              record the answer for you.
            </Text>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" className="mt-3 text-sm text-danger-text">
              {error}
            </Text>
          ) : null}

          <Button
            className="mt-4"
            disabled={!isComplete}
            loading={pending}
            loadingLabel="Sending your request"
            onPress={() => onRequest(asks, answers)}
          >
            Ask to be approved
          </Button>
          <Text className="mt-2 text-xs leading-5 text-text-muted">
            We review this before it switches on. Choosing a skill on its own does not open this work.
          </Text>
        </View>
      )}
    </Card>
  );
}

function RegistrationAnswerField({
  question,
  value,
  onChange,
}: {
  question: RegistrationQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.kind === "BOOLEAN") {
    return (
      <Field label={question.label} required={question.isRequired} showOptional={!question.isRequired}>
        <Select
          value={value}
          placeholder="Choose one"
          options={[
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  }

  if (question.kind === "INTEGER") {
    return (
      <Field label={question.label} required={question.isRequired} showOptional={!question.isRequired}>
        <Input keyboardType="number-pad" value={value} onChangeText={onChange} />
      </Field>
    );
  }

  return (
    <Field label={question.label} required={question.isRequired} showOptional={!question.isRequired}>
      <Input value={value} onChangeText={onChange} />
    </Field>
  );
}
