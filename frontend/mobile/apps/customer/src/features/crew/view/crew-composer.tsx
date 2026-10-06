// Ported from frontend/apps/customer/features/crew/view/crew-composer.tsx
import { Button, QuantityStepper, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

import {
  ROLE_COUNT_CAP,
  crewGenderTotals,
  roleGenderCount,
  type CrewGender,
} from "../model/event-flow";
import { NUMBER_FLOOR } from "../model/size";
import { PhoneFrame, ScreenHeading } from "./phone-frame";

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
  wide?: boolean;
}) {
  const totals = crewGenderTotals(roles, answers);
  return (
    <View className="gap-4">
      {suggestion !== null ? (
        <View className="rounded-[16px] border border-info-line bg-info-surface px-3.5 py-3">
          <Text className="text-[13px] leading-5 text-text">
            {suggestionBasis === null ? "We have started you with" : `For ${suggestionBasis} we have started you with`}{" "}
            <Text className="text-[13px] font-bold text-text">
              {suggestion} serving {suggestion === 1 ? "person" : "staff"}
            </Text>
            . Adjust any role — the crew is yours to set.
          </Text>
        </View>
      ) : null}
      <View className="flex-row items-center justify-end gap-2 px-1">
        <Text className="w-[7.25rem] text-center text-xs font-bold text-text">Men</Text>
        <Text className="w-[7.25rem] text-center text-xs font-bold text-text">Women</Text>
      </View>
      <View className="gap-2">
        {roles.map((role) => {
          const men = roleGenderCount(answers, role.code, "men");
          const women = roleGenderCount(answers, role.code, "women");
          return (
            <View
              key={role.code}
              className={
                men + women > 0
                  ? "gap-3 rounded-[16px] border border-selected-line bg-selected-surface px-3 py-3"
                  : "gap-3 rounded-[16px] border border-line bg-surface px-3 py-3"
              }
            >
              <Text className="text-sm font-bold leading-5 text-text">{role.label}</Text>
              {role.help ? <Text className="text-xs leading-4 text-text-secondary">{role.help}</Text> : null}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <QuantityStepper
                    label="Men"
                    value={men}
                    min={0}
                    max={ROLE_COUNT_CAP}
                    unit="men"
                    decrementLabel={`Fewer men, ${role.label}`}
                    incrementLabel={`More men, ${role.label}`}
                    onChange={(next) => onRoleGender(role.code, "men", next)}
                  />
                </View>
                <View className="flex-1">
                  <QuantityStepper
                    label="Women"
                    value={women}
                    min={0}
                    max={ROLE_COUNT_CAP}
                    unit="women"
                    decrementLabel={`Fewer women, ${role.label}`}
                    incrementLabel={`More women, ${role.label}`}
                    onChange={(next) => onRoleGender(role.code, "women", next)}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
      <View className="rounded-[16px] bg-navy-900 px-4 py-3.5">
        <Text className="text-xs font-bold uppercase tracking-[0.1em] text-signal-300">Your crew summary</Text>
        <Text className="mt-0.5 text-[13px] leading-5 text-white/70">A supervisor on duty is included.</Text>
        <Text className="mt-2 text-xl font-bold text-white">
          {totals.men} Men · {totals.women} Women · {totals.people} People
        </Text>
      </View>
      {daysQuestion !== null ? (
        <QuantityStepper
          label="For how many days?"
          hint={daysQuestion.help ?? "Consecutive days, 8-hour shifts."}
          value={typeof answers[daysQuestion.code] === "number" ? (answers[daysQuestion.code] as number) : (daysQuestion.minimum ?? NUMBER_FLOOR)}
          min={daysQuestion.minimum ?? NUMBER_FLOOR}
          max={60}
          unit={daysQuestion.label.toLowerCase()}
          decrementLabel="Fewer days"
          incrementLabel="More days"
          onChange={onDays}
        />
      ) : null}
      {totals.people === 0 ? (
        <Text className="text-sm leading-5 text-text-secondary">
          You can continue with nobody yet. A live rate needs at least one person — add them here or come back.
        </Text>
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
        <View className="flex-row gap-3">
          <Button variant="outline" onPress={onBack} className="h-[50px] min-w-[5.5rem] rounded-[11px]">
            Back
          </Button>
          <View className="flex-1">
            <Button block onPress={onContinue} className="h-[50px] rounded-[11px]">
              Continue to Date & Venue
            </Button>
          </View>
        </View>
      }
    >
      <ScreenHeading eyebrow={serviceName} title="Who do you need?" />
      <CrewComposer {...composer} />
    </PhoneFrame>
  );
}
