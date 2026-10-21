// Ported from frontend/apps/partner/features/application/view/apply-shell.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { Button, Logo, Sheet, Text, cn } from "@vsolve/mobile-ui";
import { Slot, usePathname, useRouter } from "expo-router";
import { Check, ChevronLeft, ListChecks } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import {
  previousStep,
  progressSummary,
  stepProgress,
  type StepProgress,
} from "@/features/application/model/progress";
import { usePartnerApplication } from "@/features/application/queries";

export default function ApplyLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = usePartnerApplication();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = missing ? null : (query.data ?? null);

  const summary = progressSummary(application);
  const steps = stepProgress(application);
  const current = steps.find(
    (step) => pathname === step.href || pathname.startsWith(`${step.href}/`),
  );
  const back = previousStep(pathname);

  const sentence =
    current && current.state !== "waypoint"
      ? `Step ${summary.done} of ${summary.total}`
      : "Application";
  const progressPercent = Math.round(summary.fraction * 100);

  return (
    <View className="flex-1 bg-canvas">
      {/* Top Header matching Web ApplyShell capsule */}
      <View className="border-b border-line bg-surface px-4 py-2.5 shadow-xs">
        <View className="flex-row items-center justify-between">
          {/* Left: Back affordance + Logo */}
          <View className="flex-row items-center gap-2">
            {back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Back to ${back.label}`}
                hitSlop={8}
                onPress={() => router.push(back.href as never)}
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-sunken active:bg-surface-hover"
              >
                <ChevronLeft size={20} color="#00112e" />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/")}
              className="active:opacity-80"
            >
              <Logo />
            </Pressable>
          </View>

          {/* Right: Step sheet toggle & Overview CTA */}
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all steps"
              onPress={() => setSheetOpen(true)}
              className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-3 py-1.5 active:bg-surface-hover"
            >
              <ListChecks size={15} color="#00112e" />
              <Text className="text-xs font-bold text-navy-900">Steps</Text>
            </Pressable>

            {pathname !== "/apply" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/apply")}
                className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 active:bg-surface-hover"
              >
                <Text className="text-xs font-bold text-navy-900">Overview</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Step indicator sentence and step label */}
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs font-bold text-text">{sentence}</Text>
          {current ? (
            <Text className="text-xs font-semibold text-text-secondary">{current.label}</Text>
          ) : null}
        </View>

        {/* Dynamic visual progress bar */}
        <View className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <View
            className="h-full rounded-full bg-signal-500"
            style={{ width: `${Math.max(progressPercent, 4)}%` }}
          />
        </View>
      </View>

      {/* Main Form Scroll View */}
      <ScrollView
        contentContainerClassName="px-4 pb-12 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <Slot />
      </ScrollView>

      {/* Steps List Sheet Modal */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Your application"
        description="Fill these in any order. Everything saves as you go."
      >
        <ScrollView className="max-h-96" contentContainerClassName="gap-1.5 pb-4">
          {steps.map((step) => {
            const isCurrent = pathname === step.href;
            return (
              <Pressable
                key={step.href}
                accessibilityRole="button"
                accessibilityLabel={step.label}
                onPress={() => {
                  setSheetOpen(false);
                  router.push(step.href as never);
                }}
                className={cn(
                  "flex-row items-center gap-3 rounded-card border p-3",
                  isCurrent
                    ? "border-navy-700 bg-navy-50"
                    : "border-line bg-surface active:bg-surface-hover"
                )}
              >
                <StepMark state={step.state} />
                <View className="min-w-0 flex-1">
                  <Text
                    className={cn(
                      "text-sm font-semibold",
                      isCurrent ? "font-bold text-navy-900" : "text-text"
                    )}
                  >
                    {step.label}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-secondary">
                    {describe(step, isCurrent)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}

function StepMark({ state }: { state: StepProgress["state"] }) {
  if (state === "done") {
    return (
      <View className="size-6 items-center justify-center rounded-full bg-success">
        <Check size={14} color="#ffffff" strokeWidth={3} />
      </View>
    );
  }

  if (state === "todo") {
    return (
      <View className="size-6 rounded-full border-2 border-signal-500" />
    );
  }

  return (
    <View className="size-6 items-center justify-center rounded-full border-2 border-line">
      <View
        className={cn(
          "rounded-full bg-text-muted",
          state === "optional" ? "h-0.5 w-2" : "size-1.5"
        )}
      />
    </View>
  );
}

function describe(step: StepProgress, isCurrent: boolean): string {
  if (step.state === "waypoint") {
    return step.href === "/apply" ? "Where everything stands" : "Check it, then send it";
  }
  if (step.state === "optional") return "Optional — you can set this later";
  if (step.state === "done") return "Done";
  if (isCurrent) return "You are here";
  return step.outstanding === 1 ? "1 thing needed" : `${step.outstanding} things needed`;
}
