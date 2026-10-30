import { Check, ChevronRight, MapPin } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { ErrorState, Text } from "@vsolve/mobile-ui";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import { DRESS_CODE_CODE, STAFF_MEAL_CODE } from "../model/event-flow";
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

const DEFAULT_DRESS_CODE_OPTIONS = [
  { value: "black-white", label: "Formal — black and white" },
  { value: "all-black", label: "All black" },
  { value: "traditional", label: "Traditional or ethnic" },
  { value: "client-uniform", label: "You provide the uniforms" },
];

function formatDateParts(isoDate: string): { weekday: string; dayAndMonth: string } {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return { weekday: "Day", dayAndMonth: isoDate };
  }
  const d = new Date(year, month - 1, day);
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(d);
  const dayNum = d.getDate();
  const monthStr = new Intl.DateTimeFormat("en-IN", { month: "short" }).format(d);
  return { weekday, dayAndMonth: `${dayNum} ${monthStr}` };
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
  heading = "Plan your crew",
  selectedWorkLabel,
  selectedWorkEyebrow = "WORK SELECTED",
  onChangeWork,
  aboutPanel,
  afterQuestions,
  onRefresh,
}: JobFormScreenProps) {
  const isEventFlow =
    onReportingTime !== undefined ||
    title.toLowerCase().includes("event") ||
    heading.toLowerCase().includes("turn up") ||
    questions.some((q) => q.code === DRESS_CODE_CODE);

  const offset = onReportingTime === undefined ? 0 : 1;
  const availableDates = upcomingDates(Math.min(dateHorizonDays, 10), offset);

  // Auto-select the first date and reporting time if not set
  useEffect(() => {
    if (!requestedStart && availableDates.length > 0) {
      onRequestedStart(availableDates[0]);
    }
  }, [requestedStart, availableDates, onRequestedStart]);

  useEffect(() => {
    if (onReportingTime && !reportingTime) {
      onReportingTime("09:00");
    }
  }, [onReportingTime, reportingTime]);

  // For event flow: auto-populate default answers if missing so form is submittable immediately
  useEffect(() => {
    if (isEventFlow) {
      if (!answers[DRESS_CODE_CODE]) {
        onAnswer(DRESS_CODE_CODE, "black-white");
      }
      if (answers["closed_shoes"] === undefined) {
        onAnswer("closed_shoes", true);
      }
      if (answers[STAFF_MEAL_CODE] === undefined) {
        onAnswer(STAFF_MEAL_CODE, false);
      }
    }
  }, [isEventFlow, answers, onAnswer]);

  // Dress code question
  const dressCodeQuestion = questions.find((q) => q.code === DRESS_CODE_CODE);
  const dressCodeOptions = dressCodeQuestion?.options?.length
    ? dressCodeQuestion.options
    : DEFAULT_DRESS_CODE_OPTIONS;

  const dressCodeValue = answers[DRESS_CODE_CODE] ?? dressCodeOptions[0]?.value ?? "black-white";

  // Closed shoes question
  const closedShoesValue =
    answers["closed_shoes"] === true || answers["closed_shoes"] === undefined
      ? "yes"
      : answers["closed_shoes"] === false
        ? "no"
        : "yes";

  // Staff meal provided question
  const staffMealValue =
    answers[STAFF_MEAL_CODE] === true
      ? "yes"
      : answers[STAFF_MEAL_CODE] === false
        ? "no"
        : "no";

  return (
    <PhoneFrame
      title={title}
      onBack={onBack}
      onRefresh={onRefresh}
      step={stepLabel}
      reassurance="Free. Nothing is booked yet."
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See the rate"
          disabled={!canContinue || isSaving}
          onPress={onContinue}
          className={`w-full items-center justify-center rounded-xl py-3.5 shadow-2xs ${
            canContinue && !isSaving
              ? "bg-[#EA580C] active:bg-[#C2410C]"
              : "bg-[#E5E0D8]"
          }`}
        >
          {isSaving ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="text-sm font-bold text-white">Checking the rate…</Text>
            </View>
          ) : (
            <Text
              className={`text-sm font-bold ${
                canContinue ? "text-white" : "text-[#5A554E]"
              }`}
            >
              See the rate
            </Text>
          )}
        </Pressable>
      }
    >
      {/* Eyebrow & Page Title */}
      <ScreenHeading eyebrow={serviceName || "EVENT STAFF BY THE DAY"} title={heading} />

      {/* ───────────────── EVENT STAFF FLOW ───────────────── */}
      {isEventFlow ? (
        <View className="gap-4">
          {/* YOUR EVENT Summary Card matching Image 3 */}
          {selectedWorkLabel !== null ? (
            <View className="flex-row items-center justify-between rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3.5 shadow-2xs">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {selectedWorkEyebrow}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-sm font-bold text-[#0B1B3D]">
                  {selectedWorkLabel}
                </Text>
              </View>
              {onChangeWork !== undefined ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={onChangeWork}
                  className="py-1 active:opacity-70"
                >
                  <Text className="text-xs font-bold text-[#1E3A8A]">Change</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            aboutPanel
          )}

          {/* Dress code Section */}
          <View className="gap-2 pt-1">
            <Text className="text-sm font-bold text-[#0B1B3D]">
              {dressCodeQuestion?.label ?? "Dress code"}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {dressCodeOptions.map((opt) => {
                const isSelected = dressCodeValue === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => onAnswer(DRESS_CODE_CODE, opt.value)}
                    className={`rounded-full px-4 py-2.5 border ${
                      isSelected
                        ? "border-2 border-[#0B1B3D] bg-[#0B1B3D]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-white" : "text-[#0B1B3D]"
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Everyone in closed shoes? */}
          <View className="gap-2 pt-1">
            <Text className="text-sm font-bold text-[#0B1B3D]">
              Everyone in closed shoes?
            </Text>
            <View className="flex-row rounded-xl bg-[#E5E0D8] p-1">
              <Pressable
                accessibilityRole="button"
                onPress={() => onAnswer("closed_shoes", true)}
                className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
                  closedShoesValue === "yes" ? "bg-white shadow-xs" : ""
                }`}
              >
                <Text
                  className={`text-sm ${
                    closedShoesValue === "yes"
                      ? "font-bold text-[#0B1B3D]"
                      : "font-semibold text-slate-600"
                  }`}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onAnswer("closed_shoes", false)}
                className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
                  closedShoesValue === "no" ? "bg-white shadow-xs" : ""
                }`}
              >
                <Text
                  className={`text-sm ${
                    closedShoesValue === "no"
                      ? "font-bold text-[#0B1B3D]"
                      : "font-semibold text-slate-600"
                  }`}
                >
                  No
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Will you provide a meal for the staff? */}
          <View className="gap-2 pt-1">
            <Text className="text-sm font-bold text-[#0B1B3D]">
              Will you provide a meal for the staff?
            </Text>
            <View className="flex-row rounded-xl bg-[#E5E0D8] p-1">
              <Pressable
                accessibilityRole="button"
                onPress={() => onAnswer(STAFF_MEAL_CODE, true)}
                className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
                  staffMealValue === "yes" ? "bg-white shadow-xs" : ""
                }`}
              >
                <Text
                  className={`text-sm ${
                    staffMealValue === "yes"
                      ? "font-bold text-[#0B1B3D]"
                      : "font-semibold text-slate-600"
                  }`}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onAnswer(STAFF_MEAL_CODE, false)}
                className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
                  staffMealValue === "no" ? "bg-white shadow-xs" : ""
                }`}
              >
                <Text
                  className={`text-sm ${
                    staffMealValue === "no"
                      ? "font-bold text-[#0B1B3D]"
                      : "font-semibold text-slate-600"
                  }`}
                >
                  No
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Shift Note */}
          <Text className="text-xs leading-relaxed text-slate-500">
            Staff report ready to work. One 8-hour shift, after that, overtime runs only when you approve it in the app.
          </Text>

          {/* WHERE Location Card in warm peach background matching Image 3 */}
          <View className="gap-1.5 pt-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change work location"
              onPress={onOpenAddress}
              className="flex-row items-center justify-between rounded-2xl border border-[#FED7AA] bg-[#FFFBF7] px-4 py-3.5 shadow-2xs active:bg-[#FFF7ED]"
            >
              <View className="min-w-0 flex-1 pr-3">
                <Text className="text-xs font-semibold text-[#9A3412]">
                  Where
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-sm font-bold text-[#0B1B3D]">
                  {addressLine ?? "Khajaguda — 500032"}
                </Text>
              </View>
              <View className="py-1">
                <Text className="text-xs font-bold text-[#9A3412]">Change</Text>
              </View>
            </Pressable>

            <Text className="text-xs font-semibold text-[#166534]">
              ✓ We cover this area.
            </Text>
          </View>

          {/* Date & Time selection */}
          <View className="gap-2 pt-1">
            <Text className="text-xs font-bold text-[#0B1B3D]">Event date</Text>
            <View className="flex-row flex-wrap gap-2">
              {availableDates.slice(0, 4).map((iso) => {
                const isSelected = requestedStart === iso;
                const { weekday, dayAndMonth } = formatDateParts(iso);
                return (
                  <Pressable
                    key={iso}
                    onPress={() => onRequestedStart(iso)}
                    className={`rounded-xl px-3.5 py-2 border ${
                      isSelected
                        ? "border-[#0B1B3D] bg-[#0B1B3D]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-white" : "text-[#0B1B3D]"
                      }`}
                    >
                      {weekday}, {dayAndMonth}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : (
        /* ───────────────── GENERAL DAY HIRE CREW FLOW (e.g. Construction Helpers) ───────────────── */
        <View className="gap-4">
          {/* WORK SELECTED Card */}
          {selectedWorkLabel !== null && onChangeWork !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change work selection"
              onPress={onChangeWork}
              className="rounded-2xl border border-blue-200 bg-[#F0F7FF] px-4 py-3.5 shadow-2xs active:bg-[#E2EFFF]"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {selectedWorkEyebrow}
                </Text>
                <View className="flex-row items-center gap-0.5">
                  <Text className="text-xs font-semibold text-blue-600">Change</Text>
                  <ChevronRight size={14} color="#2563EB" strokeWidth={2.4} />
                </View>
              </View>
              <Text numberOfLines={1} className="mt-1 text-sm font-bold text-[#0B1B3D]">
                {selectedWorkLabel}
              </Text>
            </Pressable>
          ) : (
            aboutPanel
          )}

          {/* Preset Questions (People and Days Steppers) */}
          <PresetQuestions
            questions={questions}
            answers={answers}
            hiddenCodes={hiddenCodes}
            onAnswer={onAnswer}
          />

          {/* Start from * Date Grid */}
          <View className="gap-2.5 pt-1">
            <View className="gap-0.5">
              <View className="flex-row items-center gap-1">
                <Text className="text-base font-bold text-[#0B1B3D]">{dateLabel}</Text>
                <Text className="text-base font-bold text-red-500">*</Text>
              </View>
              <Text className="text-xs text-slate-500 font-normal">Choose a date</Text>
            </View>

            <View className="flex-row flex-wrap justify-between gap-y-2.5">
              {availableDates.map((iso) => {
                const isSelected = requestedStart === iso;
                const { weekday, dayAndMonth } = formatDateParts(iso);
                return (
                  <Pressable
                    key={iso}
                    accessibilityRole="button"
                    accessibilityLabel={`${weekday} ${dayAndMonth}`}
                    onPress={() => onRequestedStart(iso)}
                    className={`w-[31.5%] h-[58px] items-center justify-center rounded-2xl ${
                      isSelected
                        ? "border-2 border-blue-600 bg-[#EFF6FF]"
                        : "border border-slate-200 bg-white active:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected ? "text-slate-800" : "text-slate-600"
                      }`}
                    >
                      {weekday}
                    </Text>
                    <Text className="mt-0.5 text-sm font-bold text-[#0B1B3D]">
                      {dayAndMonth}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* WHERE Location Card */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change work location"
            onPress={onOpenAddress}
            className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-2xs active:bg-slate-50"
          >
            <View className="flex-row items-center gap-3 min-w-0 flex-1">
              <MapPin size={22} color="#0B1B3D" strokeWidth={1.8} />
              <View className="min-w-0 flex-1">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  WHERE
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-sm font-bold text-[#0B1B3D]">
                  {addressLine ?? "Khajaguda — 500032"}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-0.5 pl-2">
              <Text className="text-xs font-semibold text-blue-600">Change</Text>
              <ChevronRight size={14} color="#2563EB" strokeWidth={2.4} />
            </View>
          </Pressable>
        </View>
      )}

      {afterQuestions}
      {saveError}
      {addressPicker}
    </PhoneFrame>
  );
}

export function JobFormError({ message }: { message: string }) {
  return <ErrorState title="We could not save that" message={message} severity="error" inline />;
}
