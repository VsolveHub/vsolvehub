// Ported from frontend/apps/customer/features/crew/view/mobile/job-form-screen.tsx
import { Button, ErrorState, Field, Select, Text } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { formatReportingTime, reportingTimeOptions } from "../model/reporting-time";
import { PhoneFrame, ScreenHeading } from "./phone-frame";
import { PresetQuestions } from "./preset-questions";

export interface JobFormScreenProps {
  serviceName: string;
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (questionCode: string, value: unknown) => void;
  hiddenCodes?: readonly string[];
  requestedStart: string | null;
  onRequestedStart: (isoDate: string) => void;
  dateLabel?: string;
  dateHorizonDays?: number;
  reportingTime?: string | null;
  onReportingTime?: (time: string) => void;
  addressLine: string | null;
  onOpenAddress: () => void;
  addressPicker?: ReactNode;
  canContinue: boolean;
  isSaving: boolean;
  onContinue: () => void;
  saveError?: ReactNode;
  onBack: () => void;
  stepLabel?: string;
  title?: string;
  heading?: string;
  selectedWorkLabel: string | null;
  selectedWorkEyebrow?: string;
  onChangeWork?: () => void;
  aboutPanel?: ReactNode;
  afterQuestions?: ReactNode;
  onRefresh?: () => Promise<void> | void;
}

function formatDay(isoDate: string | null): string | null {
  if (isoDate === null) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "long" }).format(
    new Date(year, month - 1, day),
  );
}

function upcomingDates(horizon: number, offset: number): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() + offset);
  for (let index = 0; index < horizon; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const month = `${day.getMonth() + 1}`.padStart(2, "0");
    const date = `${day.getDate()}`.padStart(2, "0");
    dates.push(`${day.getFullYear()}-${month}-${date}`);
  }
  return dates;
}

export function JobFormScreen({
  serviceName,
  questions,
  answers,
  onAnswer,
  hiddenCodes = [],
  requestedStart,
  onRequestedStart,
  dateLabel = "Start from",
  dateHorizonDays = 10,
  reportingTime = null,
  onReportingTime,
  addressLine,
  onOpenAddress,
  addressPicker,
  canContinue,
  isSaving,
  onContinue,
  saveError,
  onBack,
  stepLabel = "Step 2 of 3",
  title = "Book a crew",
  heading = "Plan the crew",
  selectedWorkLabel,
  selectedWorkEyebrow = "Work selected",
  onChangeWork,
  aboutPanel,
  afterQuestions,
  onRefresh,
}: JobFormScreenProps) {
  const offset = onReportingTime === undefined ? 0 : 1;
  return (
    <PhoneFrame
      title={title}
      onBack={onBack}
      onRefresh={onRefresh}
      step={stepLabel}
      reassurance="Free. Nothing is booked yet."
      action={
        <Button
          block
          onPress={onContinue}
          disabled={!canContinue}
          loading={isSaving}
          loadingLabel="Checking the rate"
          className="h-[50px] rounded-[11px]"
        >
          See the rate
        </Button>
      }
    >
      <ScreenHeading eyebrow={serviceName} title={heading} />
      {selectedWorkLabel !== null && onChangeWork !== undefined ? (
        <Pressable
          accessibilityRole="button"
          onPress={onChangeWork}
          className="min-h-14 flex-row items-center justify-between gap-3 rounded-[14px] border border-selected-line bg-selected-surface px-3.5 py-3"
        >
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">{selectedWorkEyebrow}</Text>
            <Text className="mt-0.5 text-sm font-bold leading-5 text-text">{selectedWorkLabel}</Text>
          </View>
          <Text className="shrink-0 text-xs font-bold text-text-link">Change</Text>
        </Pressable>
      ) : (
        aboutPanel
      )}
      <PresetQuestions questions={questions} answers={answers} hiddenCodes={hiddenCodes} onAnswer={onAnswer} />
      {afterQuestions}
      <Field label={dateLabel} required>
        <View className="gap-2">
          <Text className="text-sm font-semibold text-text">{formatDay(requestedStart) ?? "Choose a date"}</Text>
          <View className="flex-row flex-wrap gap-2">
            {upcomingDates(Math.min(dateHorizonDays, 21), offset).map((iso) => (
              <Pressable
                key={iso}
                accessibilityRole="button"
                onPress={() => onRequestedStart(iso)}
                className={
                  requestedStart === iso
                    ? "rounded-control border border-selected bg-selected-surface px-3 py-2"
                    : "rounded-control border border-line bg-surface px-3 py-2"
                }
              >
                <Text className="text-xs font-semibold text-text">{formatDay(iso)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Field>
      {onReportingTime !== undefined ? (
        <Field label="Reporting time" description="When crew should report on site." required>
          <Select
            value={reportingTime ?? ""}
            placeholder="Choose a time"
            options={reportingTimeOptions().map((time) => ({ value: time, label: formatReportingTime(time) }))}
            onChange={(event) => onReportingTime(event.target.value)}
          />
          <Text className="mt-2 text-xs leading-5 text-text-muted">
            Staff report ready to work. One 8-hour shift; after that, overtime runs only when you approve it in the app.
          </Text>
        </Field>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onOpenAddress}
        className="min-h-14 flex-row items-center justify-between rounded-[14px] border border-line bg-surface px-3.5 py-3"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">Where</Text>
          <Text className="mt-0.5 text-sm font-bold text-text">{addressLine ?? "Choose where the work is"}</Text>
        </View>
        <Text className="text-xs font-bold text-text-link">Change</Text>
      </Pressable>
      {saveError}
      {addressPicker}
    </PhoneFrame>
  );
}

export function JobFormError({ message }: { message: string }) {
  return <ErrorState title="We could not save that" message={message} severity="error" inline />;
}
