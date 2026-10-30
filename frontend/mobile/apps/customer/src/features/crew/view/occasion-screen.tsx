import { useState } from "react";
import { Check, Info } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";

import { Text } from "@vsolve/mobile-ui";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import {
  EVENT_DESCRIPTION_CODE,
  EVENT_TYPE_CODE,
  GUEST_BAND_CODE,
  SERVICE_STYLE_CODE,
  isExactGuestCount,
} from "../model/event-flow";
import { EventTypeIcon } from "./event-icons";
import { PhoneFrame, ScreenHeading } from "./phone-frame";
import { requiredAnswersPresent } from "./preset-questions";

const DEFAULT_EVENT_OPTIONS = [
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate event" },
  { value: "birthday", label: "Birthday party" },
  { value: "house-function", label: "House or religious function" },
  { value: "other", label: "Something else" },
];

const DEFAULT_GUEST_OPTIONS = [
  { value: "under-50", label: "Under 50" },
  { value: "50-100", label: "50–100" },
  { value: "100-200", label: "100–200" },
  { value: "200-plus", label: "200+" },
];

const DEFAULT_SERVICE_OPTIONS = [
  {
    value: "buffet",
    label: "Buffet",
    description: "Guests walk up to the counters.",
  },
  {
    value: "sit-down",
    label: "Sit-down service",
    description: "Served at the table, course by course.",
  },
  {
    value: "passed",
    label: "Snacks and drinks passed around",
    description: "Trays circulating through the room.",
  },
  {
    value: "no-food",
    label: "No food service",
    description: "Setup, reception and support only.",
  },
];

function matchesEvent(a: unknown, b: string): boolean {
  if (a === b) return true;
  if (typeof a !== "string") return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function matchesBand(a: unknown, b: string): boolean {
  if (a === b) return true;
  if (typeof a !== "string") return false;
  const normA = a.replace(/[\s–_]/g, "-").toLowerCase();
  const normB = b.replace(/[\s–_]/g, "-").toLowerCase();
  return normA === normB;
}

function matchesServiceStyle(a: unknown, b: string): boolean {
  if (a === b) return true;
  if ((a === "passed" && b === "snacks-passed") || (a === "snacks-passed" && b === "passed")) return true;
  return false;
}

export function occasionAnswered(
  questions: readonly RequirementQuestionView[],
  answers: Readonly<Record<string, unknown>>,
  hiddenCodes: readonly string[] = [],
): boolean {
  const visible = questions.filter((q) => !hiddenCodes.includes(q.code));

  // 1. Must have occasion selected
  const hasEvent = Boolean(answers[EVENT_TYPE_CODE]);

  // 2. Must have guest count (either band or exact positive number)
  const guestVal = answers[GUEST_BAND_CODE];
  const hasGuests = Boolean(
    guestVal !== undefined &&
      guestVal !== null &&
      (typeof guestVal === "number" ? guestVal > 0 : String(guestVal).trim().length > 0),
  );

  // 3. Must have food service style selected
  const hasService = Boolean(answers[SERVICE_STYLE_CODE]);

  // 4. If "other" is chosen, check if description question is required and filled
  if (answers[EVENT_TYPE_CODE] === "other") {
    const descQ = visible.find((q) => q.code === EVENT_DESCRIPTION_CODE);
    if (descQ?.required) {
      const descVal = answers[EVENT_DESCRIPTION_CODE];
      if (typeof descVal !== "string" || descVal.trim().length === 0) {
        return false;
      }
    }
  }

  // 5. Check any other visible questions required by the backend
  const otherRequired = visible.filter(
    (q) =>
      q.required &&
      q.code !== EVENT_TYPE_CODE &&
      q.code !== GUEST_BAND_CODE &&
      q.code !== SERVICE_STYLE_CODE &&
      q.code !== EVENT_DESCRIPTION_CODE,
  );
  const othersComplete = requiredAnswersPresent(otherRequired, answers);

  return hasEvent && hasGuests && hasService && othersComplete;
}

export function OccasionScreen({
  serviceName,
  questions,
  answers,
  onAnswer,
  hiddenCodes = [],
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
  const complete = occasionAnswered(questions, answers, hiddenCodes);

  const eventQuestion = questions.find((q) => q.code === EVENT_TYPE_CODE);
  const guestQuestion = questions.find((q) => q.code === GUEST_BAND_CODE);
  const serviceQuestion = questions.find((q) => q.code === SERVICE_STYLE_CODE);
  const descQuestion = questions.find((q) => q.code === EVENT_DESCRIPTION_CODE);

  const eventOptions = eventQuestion?.options?.length
    ? eventQuestion.options
    : DEFAULT_EVENT_OPTIONS;

  const guestOptions = guestQuestion?.options?.length
    ? guestQuestion.options
    : DEFAULT_GUEST_OPTIONS;

  const serviceOptions = serviceQuestion?.options?.length
    ? serviceQuestion.options
    : DEFAULT_SERVICE_OPTIONS;

  const selectedEvent = answers[EVENT_TYPE_CODE];
  const selectedGuest = answers[GUEST_BAND_CODE];
  const selectedService = answers[SERVICE_STYLE_CODE];

  const [customGuestOpen, setCustomGuestOpen] = useState(
    isExactGuestCount(selectedGuest),
  );

  return (
    <PhoneFrame
      title="Book event staff"
      onBack={onBack}
      step="Step 1 of 3"
      reassurance="Choosing here creates no request."
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue"
          disabled={!complete}
          onPress={onContinue}
          className={`w-full items-center justify-center rounded-xl py-3.5 shadow-2xs ${
            complete
              ? "bg-[#EA580C] active:bg-[#C2410C]"
              : "bg-[#E5E0D8] opacity-90"
          }`}
        >
          <Text
            className={`text-sm font-bold ${
              complete ? "text-white" : "text-[#5A554E]"
            }`}
          >
            {complete ? "Build the crew" : "Tell us about the event to continue"}
          </Text>
        </Pressable>
      }
    >
      <ScreenHeading eyebrow={serviceName || "EVENT STAFF BY THE DAY"} title="Tell us about the event" />

      {/* What's the occasion? - 2 column grid of cards matching user screenshot 1 */}
      <View className="gap-2.5 pt-1">
        <Text className="text-sm font-bold text-[#0B1B3D]">
          {eventQuestion?.label ?? "What's the occasion?"}
        </Text>
        <View className="flex-row flex-wrap justify-between gap-y-2.5">
          {eventOptions.map((opt) => {
            const isSelected = matchesEvent(selectedEvent, opt.value);
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                hitSlop={6}
                onPress={() => onAnswer(EVENT_TYPE_CODE, opt.value)}
                className={`relative w-[48.5%] min-h-[114px] items-center justify-center rounded-[20px] p-3.5 shadow-2xs active:opacity-85 active:scale-[0.98] ${
                  isSelected
                    ? "border-2 border-[#0B1B3D] bg-white ring-1 ring-[#0B1B3D]/10"
                    : "border border-slate-200 bg-white"
                }`}
              >
                {/* Top-right selection checkbox */}
                <View
                  pointerEvents="none"
                  className={`absolute right-3 top-3 size-5 items-center justify-center rounded-md border ${
                    isSelected
                      ? "border-[#0B1B3D] bg-[#0B1B3D]"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {isSelected ? <Check size={12} color="#ffffff" strokeWidth={3} /> : null}
                </View>

                {/* Centered circular peach badge with icon */}
                <View
                  pointerEvents="none"
                  className="size-12 items-center justify-center rounded-full bg-[#FFF1EB]"
                >
                  <EventTypeIcon
                    code={opt.value}
                    size={26}
                    color="#0B1B3D"
                  />
                </View>

                {/* Card Title */}
                <Text
                  pointerEvents="none"
                  numberOfLines={2}
                  className="mt-2 text-center text-xs font-bold leading-tight text-[#0B1B3D]"
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Description when 'other' is selected */}
      {selectedEvent === "other" && descQuestion ? (
        <View className="gap-1.5 pt-1">
          <Text className="text-xs font-bold text-[#0B1B3D]">
            {descQuestion.label ?? "Describe the occasion"}
          </Text>
          <TextInput
            value={
              typeof answers[EVENT_DESCRIPTION_CODE] === "string"
                ? (answers[EVENT_DESCRIPTION_CODE] as string)
                : ""
            }
            onChangeText={(val) => onAnswer(EVENT_DESCRIPTION_CODE, val)}
            placeholder="e.g. Annual alumni gala dinner"
            placeholderTextColor="#94A3B8"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#0B1B3D]"
          />
        </View>
      ) : null}

      {/* How many guests? */}
      <View className="gap-2 pt-2">
        <Text className="text-sm font-bold text-[#0B1B3D]">
          {guestQuestion?.label ?? "How many guests?"}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {guestOptions.map((band) => {
            const isSelected = matchesBand(selectedGuest, band.value) && !customGuestOpen;
            return (
              <Pressable
                key={band.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                hitSlop={6}
                onPress={() => {
                  setCustomGuestOpen(false);
                  onAnswer(GUEST_BAND_CODE, band.value);
                }}
                className={`rounded-xl px-4 py-2.5 border active:opacity-80 active:scale-[0.98] ${
                  isSelected
                    ? "border-[#0B1B3D] bg-[#0B1B3D]"
                    : "border-slate-200 bg-white"
                }`}
              >
                <Text
                  pointerEvents="none"
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-[#0B1B3D]"
                  }`}
                >
                  {band.label}
                </Text>
              </Pressable>
            );
          })}

          {/* Custom guest count button */}
          <Pressable
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: customGuestOpen }}
            onPress={() => {
              setCustomGuestOpen(true);
              if (!isExactGuestCount(selectedGuest)) {
                onAnswer(GUEST_BAND_CODE, "");
              }
            }}
            className={`rounded-xl px-4 py-2.5 border active:opacity-80 active:scale-[0.98] ${
              customGuestOpen
                ? "border-[#0B1B3D] bg-[#0B1B3D]"
                : "border-slate-200 bg-white"
            }`}
          >
            <Text
              pointerEvents="none"
              className={`text-xs font-bold ${
                customGuestOpen ? "text-white" : "text-[#0B1B3D]"
              }`}
            >
              Custom
            </Text>
          </Pressable>
        </View>

        {customGuestOpen ? (
          <View className="mt-1 flex-row items-center gap-2">
            <TextInput
              keyboardType="number-pad"
              value={isExactGuestCount(selectedGuest) ? String(selectedGuest) : ""}
              onChangeText={(text) => onAnswer(GUEST_BAND_CODE, text.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 180"
              placeholderTextColor="#94A3B8"
              className="w-28 rounded-xl border-2 border-[#0B1B3D] bg-white px-3 py-2 text-center text-base font-bold text-[#0B1B3D]"
            />
            <Text className="text-xs font-semibold text-slate-500">guests</Text>
          </View>
        ) : null}
      </View>

      {/* Service Style Options (Buffet, Sit-down, Snacks, No food) */}
      <View className="gap-2.5 pt-2">
        <Text className="text-sm font-bold text-[#0B1B3D]">
          {serviceQuestion?.label ?? "Food service style"}
        </Text>
        <View className="gap-2">
          {serviceOptions.map((opt) => {
            const isSelected = matchesServiceStyle(selectedService, opt.value);
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                hitSlop={6}
                onPress={() => onAnswer(SERVICE_STYLE_CODE, opt.value)}
                className={`flex-row items-center gap-3.5 rounded-2xl border p-4 shadow-2xs active:opacity-85 active:scale-[0.99] ${
                  isSelected
                    ? "border-2 border-[#0B1B3D] bg-[#FFF8F3]"
                    : "border-slate-200 bg-white"
                }`}
              >
                {/* Radio Circle */}
                <View
                  pointerEvents="none"
                  className={`size-5 rounded-full border-2 items-center justify-center ${
                    isSelected ? "border-[#0B1B3D] bg-white" : "border-slate-400 bg-white"
                  }`}
                >
                  {isSelected ? (
                    <View className="size-2.5 rounded-full bg-[#0B1B3D]" />
                  ) : null}
                </View>

                {/* Option Text */}
                <View pointerEvents="none" className="flex-1">
                  <Text className="text-sm font-bold text-[#0B1B3D]">
                    {opt.label}
                  </Text>
                  {opt.description ? (
                    <Text className="mt-0.5 text-xs text-slate-500 leading-snug">
                      {opt.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </PhoneFrame>
  );
}
