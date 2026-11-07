// Ported from frontend/apps/partner/features/capability/view/registration-plan.tsx
import { Button, Card, cn, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Check, Clock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { RegistrationPlanView, RegistrationStep } from "../adapters/registration-plan";

export interface RegistrationPlanProps {
  readonly state: AsyncState<RegistrationPlanView>;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function RegistrationPlan({ state, onRetry, className }: RegistrationPlanProps) {
  return (
    <AsyncSection state={state} label="Working out what you still need" onRetry={onRetry}>
      {(plan) => (
        <View className={cn("flex-col gap-4", className)}>
          {plan.now.length > 0 ? (
            <Card className="p-5">
              <Text className="text-base font-semibold text-text">
                {plan.now.length === 1 ? "One thing to do" : `${plan.now.length} things to do`}
              </Text>
              <View className="mt-3 flex-col gap-4">
                {plan.now.map((entry) => (
                  <StepRow key={entry.key} entry={entry} tone="now" />
                ))}
              </View>
            </Card>
          ) : (
            <Card className="p-5">
              <Text className="text-base font-semibold text-text">Nothing needed from you</Text>
              <Text className="mt-1 text-sm leading-6 text-text-secondary">
                {plan.isComplete
                  ? "Everything we ask for is on file. Enquiries reach you as they arrive."
                  : "Nothing is waiting on you right now. We will ask for the things below at the moment they matter."}
              </Text>
            </Card>
          )}

          {plan.later.length > 0 ? (
            <View>
              <Text className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                We will ask for these later
              </Text>
              <View className="mt-2 flex-col gap-3">
                {plan.later.map((entry) => (
                  <StepRow key={entry.key} entry={entry} tone="later" />
                ))}
              </View>
            </View>
          ) : null}

          {plan.done.length > 0 ? <DoneList entries={plan.done} /> : null}
        </View>
      )}
    </AsyncSection>
  );
}

function DoneList({ entries }: { entries: readonly RegistrationStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="rounded-card border border-line bg-surface p-4">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)}>
        <Text className="text-sm font-semibold text-text">Already done ({entries.length})</Text>
      </Pressable>
      {open ? (
        <View className="mt-3 flex-col gap-2">
          {entries.map((entry) => (
            <View key={entry.key} className="flex-row items-start gap-2">
              <Check size={16} color="#047857" strokeWidth={3} />
              <Text className="flex-1 text-sm text-text-secondary">{entry.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StepRow({ entry, tone }: { entry: RegistrationStep; tone: "now" | "later" }) {
  const router = useRouter();
  const isNow = tone === "now";
  return (
    <View className={cn(!isNow && "rounded-card bg-surface-sunken px-4 py-3")}>
      <View className="flex-row items-center gap-2">
        {isNow ? null : <Clock size={14} color="#756c5e" />}
        <Text className={cn("flex-1 text-sm font-semibold", isNow ? "text-text" : "text-text-secondary")}>
          {entry.title}
        </Text>
      </View>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{entry.why}</Text>
      {isNow && entry.href && entry.actionLabel ? (
        <Button size="sm" className="mt-3 self-start" onPress={() => router.push(entry.href as never)}>
          {entry.actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
