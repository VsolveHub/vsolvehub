import { Info } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@vsolve/mobile-ui";
import type { RequirementQuestionView } from "@/features/requirement/adapters";

import {
  ROLE_COUNT_CAP,
  crewGenderTotals,
  roleGenderCount,
  type CrewGender,
} from "../model/event-flow";
import { NUMBER_FLOOR } from "../model/size";
import { GenderIcon, RoleIcon } from "./event-icons";
import { PhoneFrame, ScreenHeading } from "./phone-frame";

const ROLE_METADATA: Record<string, { label: string; help: string }> = {
  waiter_count: {
    label: "Waiters and serving staff",
    help: "Serving, clearing, refills and buffet counters.",
  },
  bar_staff_count: {
    label: "Bar and beverage staff",
    help: "Soft drinks, mocktails and counters. No licensed liquor service.",
  },
  hostess_count: {
    label: "Guest reception",
    help: "Welcoming guests, registration and guidance.",
  },
  kitchen_helper_count: {
    label: "Kitchen and pantry helpers",
    help: "Plating, dish return and pantry support for your caterer.",
  },
  cleanup_count: {
    label: "Cleanup and housekeeping",
    help: "Keeping the venue and washrooms presentable through the event.",
  },
  setup_count: {
    label: "Setup and teardown crew",
    help: "Furniture, decor and equipment before and after.",
  },
};

function StepperControl({
  value,
  min = 0,
  max = ROLE_COUNT_CAP,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        className={`size-9 items-center justify-center rounded-full border ${
          value <= min
            ? "border-slate-200 bg-slate-50 opacity-40"
            : "border-slate-300 bg-white active:bg-slate-100"
        }`}
      >
        <Text className="text-base font-bold text-slate-700">−</Text>
      </Pressable>

      <Text className="min-w-6 text-center text-base font-bold text-[#0B1B3D]">
        {value}
      </Text>

      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        className={`size-9 items-center justify-center rounded-full border ${
          value >= max
            ? "border-slate-200 bg-slate-50 opacity-40"
            : "border-[#0B1B3D] bg-white active:bg-slate-100"
        }`}
      >
        <Text className="text-base font-bold text-[#0B1B3D]">+</Text>
      </Pressable>
    </View>
  );
}

export function CrewComposer({
  roles,
  daysQuestion,
  answers,
  onRoleGender,
  onDays,
  suggestion,
  suggestionBasis,
}: {
  roles: readonly RequirementQuestionView[];
  daysQuestion: RequirementQuestionView | null;
  answers: Readonly<Record<string, unknown>>;
  onRoleGender: (code: string, gender: CrewGender, value: number) => void;
  onDays: (value: number) => void;
  suggestion: number | null;
  suggestionBasis: string | null;
}) {
  const totals = crewGenderTotals(roles, answers);
  const daysValue =
    daysQuestion !== null && typeof answers[daysQuestion.code] === "number"
      ? (answers[daysQuestion.code] as number)
      : (daysQuestion?.minimum ?? NUMBER_FLOOR);

  return (
    <View className="gap-3.5">
      {/* Info Banner matching Image 2 */}
      {suggestion !== null ? (
        <View className="flex-row items-start gap-2.5 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3.5">
          <Info size={18} color="#2563EB" style={{ marginTop: 2 }} />
          <Text className="flex-1 text-xs leading-relaxed text-[#1E3A8A]">
            {suggestionBasis === null
              ? "We have started you with"
              : `For a ${suggestionBasis} we have started you with`}{" "}
            <Text className="font-bold text-[#1E3A8A]">
              {suggestion} serving {suggestion === 1 ? "person" : "staff"}
            </Text>
            . Adjust any role — the crew is yours to set.
          </Text>
        </View>
      ) : null}

      {/* Columns Header: Men and Women */}
      <View className="flex-row items-center justify-end gap-6 px-3">
        <View className="flex-row items-center gap-1.5 w-24 justify-center">
          <GenderIcon gender="men" size={15} />
          <Text className="text-xs font-bold text-[#0284C7]">Men</Text>
        </View>
        <View className="flex-row items-center gap-1.5 w-24 justify-center">
          <GenderIcon gender="women" size={15} />
          <Text className="text-xs font-bold text-[#EA580C]">Women</Text>
        </View>
      </View>

      {/* Roles Cards */}
      <View className="gap-2.5">
        {roles.map((role) => {
          const meta = ROLE_METADATA[role.code] ?? {
            label: role.label,
            help: role.help ?? "",
          };
          const men = roleGenderCount(answers, role.code, "men");
          const women = roleGenderCount(answers, role.code, "women");
          const hasCount = men + women > 0;

          return (
            <View
              key={role.code}
              className={`rounded-2xl border p-3.5 shadow-2xs ${
                hasCount
                  ? "border-[#BFDBFE] bg-[#EFF6FF]"
                  : "border-slate-200 bg-white"
              }`}
            >
              {/* Top part: Icon, Label, Description */}
              <View className="flex-row items-start gap-3">
                <View
                  className={`size-11 items-center justify-center rounded-xl ${
                    hasCount ? "bg-[#0B1B3D]" : "bg-[#FFF1EB]"
                  }`}
                >
                  <RoleIcon
                    code={role.code}
                    size={22}
                    color={hasCount ? "#ffffff" : "#9A3412"}
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-sm font-bold text-[#0B1B3D]">
                    {meta.label}
                  </Text>
                  {meta.help ? (
                    <Text className="mt-0.5 text-xs text-slate-500 leading-snug">
                      {meta.help}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Bottom Steppers aligned under Men and Women */}
              <View className="mt-3 flex-row items-center justify-end gap-6 pt-1">
                <View className="w-24 items-center justify-center">
                  <StepperControl
                    value={men}
                    min={0}
                    max={ROLE_COUNT_CAP}
                    onChange={(next) => onRoleGender(role.code, "men", next)}
                  />
                </View>

                <View className="w-24 items-center justify-center">
                  <StepperControl
                    value={women}
                    min={0}
                    max={ROLE_COUNT_CAP}
                    onChange={(next) => onRoleGender(role.code, "women", next)}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* YOUR CREW SUMMARY Card */}
      <View className="rounded-2xl bg-[#03132B] p-4 shadow-sm">
        <Text className="text-xs font-bold uppercase tracking-wider text-[#EA580C]">
          YOUR CREW SUMMARY
        </Text>
        <Text className="mt-0.5 text-xs text-white/70">
          A supervisor on duty is included.
        </Text>

        <View className="mt-3 flex-row items-baseline gap-4">
          <Text className="text-xl font-black text-white">
            {totals.men} <Text className="text-xs font-medium text-white/70">Men</Text>
          </Text>
          <Text className="text-xl font-black text-[#EA580C]">
            {totals.women} <Text className="text-xs font-medium text-[#EA580C]/80">Women</Text>
          </Text>
          <Text className="text-xl font-black text-white">
            {totals.people} <Text className="text-xs font-medium text-white/70">People</Text>
          </Text>
        </View>
      </View>

      {/* For how many days? Card */}
      {daysQuestion !== null ? (
        <View className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-[#0B1B3D]">
              For how many days?
            </Text>
            <Text className="mt-0.5 text-xs text-slate-500">
              {daysQuestion.help ?? "Consecutive days, 8-hour shifts."}
            </Text>
          </View>

          <StepperControl
            value={daysValue}
            min={daysQuestion.minimum ?? NUMBER_FLOOR}
            max={60}
            onChange={onDays}
          />
        </View>
      ) : null}
    </View>
  );
}

export function CrewScreen({
  serviceName,
  onContinue,
  onBack,
  ...composer
}: {
  serviceName: string;
  onContinue: () => void;
  onBack: () => void;
  roles: readonly RequirementQuestionView[];
  daysQuestion: RequirementQuestionView | null;
  answers: Readonly<Record<string, unknown>>;
  onRoleGender: (code: string, gender: CrewGender, value: number) => void;
  onDays: (value: number) => void;
  suggestion: number | null;
  suggestionBasis: string | null;
}) {
  return (
    <PhoneFrame
      title="Book event staff"
      onBack={onBack}
      step="Step 2 of 3"
      reassurance="Free. Nothing is booked yet."
      action={
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3.5 shadow-2xs active:bg-slate-50"
          >
            <Text className="text-sm font-bold text-[#0B1B3D]">Back</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to Date & Venue"
            onPress={onContinue}
            className="flex-1 items-center justify-center rounded-xl bg-[#EA580C] py-3.5 shadow-2xs active:bg-[#C2410C]"
          >
            <Text className="text-sm font-bold text-white">
              Continue to Date & Venue
            </Text>
          </Pressable>
        </View>
      }
    >
      <ScreenHeading eyebrow={serviceName || "EVENT STAFF BY THE DAY"} title="Who do you need?" />
      <CrewComposer {...composer} />
    </PhoneFrame>
  );
}
