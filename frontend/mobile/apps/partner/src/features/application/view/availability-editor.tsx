// Ported from frontend/apps/partner/features/application/view/availability-editor.tsx
import { Badge, Button, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Clock, Edit2, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { presetPeriods } from "@vsolve/query/native";

import { useApplyDock } from "../model/dock-context";
import { WEEKDAYS, scheduleProblems, weeklyHours, type DraftPeriod, type PeriodProblem } from "../model/schedule";

const PROBLEM_MESSAGES: Record<PeriodProblem, string> = {
  ZERO_LENGTH: "Start and end are the same. Tick 'ends next day' for a full day.",
  ENDS_BEFORE_START: "This ends before it starts. Tick 'ends next day' if it runs overnight.",
  OVERLAPS_ANOTHER: "This overlaps another period on the same day.",
};

export interface ServiceAreaOption {
  id: string;
  label: string;
}

export interface AvailabilityEditorProps {
  areas: readonly ServiceAreaOption[];
  initialPeriods: readonly DraftPeriod[];
  /** Saves the hours; `onSaved` runs only once the server has accepted them. */
  onSave: (periods: readonly DraftPeriod[], onSaved?: () => void) => void;
  isSaving?: boolean;
  saveError?: string | null;
  /** The step before and after this one, for the layout's Back and Continue buttons. */
  backHref: string;
  nextHref: string;
  nextStepName: string | null;
}

type ModalShiftState = {
  weekday: number;
  weekdayLabel: string;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
  serviceAreaId: string;
  existingKey?: string;
} | null;

export function AvailabilityEditor({
  areas,
  initialPeriods,
  onSave,
  isSaving = false,
  saveError = null,
  backHref,
  nextHref,
  nextStepName,
}: AvailabilityEditorProps) {
  const router = useRouter();
  const { registerDock } = useApplyDock();
  const [periods, setPeriods] = useState<DraftPeriod[]>([...initialPeriods]);
  const [modalShift, setModalShift] = useState<ModalShiftState>(null);

  const problems = useMemo(() => scheduleProblems(periods), [periods]);
  const hours = weeklyHours(periods);
  const hasProblems = problems.size > 0;
  const hasChanges = JSON.stringify(periods) !== JSON.stringify(initialPeriods);

  /**
   * Back and Continue belong to the apply layout's dock, like every other step. This screen used
   * to draw its own row of three buttons ("Back", "Save Hours", "Review Application") under the
   * list, which ran off the right edge of a phone, sent Back to the step after this one and let
   * "Review Application" skip Documents. Saving now happens through Continue.
   */
  const onCommit = useCallback(() => {
    if (hasProblems || isSaving) return;
    if (hasChanges) onSave(periods, () => router.push(nextHref as never));
    else router.push(nextHref as never);
  }, [hasChanges, hasProblems, isSaving, nextHref, onSave, periods, router]);

  useEffect(() => {
    registerDock({
      label: hasChanges ? "Save and continue" : "Continue",
      backHref,
      nextStepName,
      onCommit,
      isSaving,
      proceedDisabled: hasProblems,
      saved: false,
      conflict: false,
      // The dock sits at the bottom of the screen, always in view, so the save error is shown
      // there instead of under the list where it would be scrolled out of sight.
      refusal: saveError ? { title: "We could not save your hours", message: saveError } : null,
      failed: false,
      requestId: null,
      fieldMessages: [],
    });
  }, [backHref, hasChanges, hasProblems, isSaving, nextStepName, onCommit, registerDock, saveError]);

  useEffect(() => {
    return () => registerDock(null);
  }, [registerDock]);

  function remove(key: string) {
    setPeriods((current) => current.filter((period) => period.key !== key));
  }

  function openNewShiftModal(weekday: number) {
    setModalShift({
      weekday,
      weekdayLabel: WEEKDAYS[weekday] ?? "Shift",
      startsAt: "09:00",
      endsAt: "18:00",
      endsNextDay: false,
      serviceAreaId: areas[0]?.id ?? "",
    });
  }

  function openEditShiftModal(period: DraftPeriod) {
    setModalShift({
      weekday: period.weekday,
      weekdayLabel: WEEKDAYS[period.weekday] ?? "Shift",
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      endsNextDay: period.endsNextDay,
      serviceAreaId: period.serviceAreaId,
      existingKey: period.key,
    });
  }

  function saveModalShift() {
    if (!modalShift) return;
    if (modalShift.existingKey) {
      setPeriods((current) =>
        current.map((period) =>
          period.key === modalShift.existingKey
            ? {
                ...period,
                startsAt: modalShift.startsAt,
                endsAt: modalShift.endsAt,
                endsNextDay: modalShift.endsNextDay,
                serviceAreaId: modalShift.serviceAreaId,
              }
            : period,
        ),
      );
    } else {
      setPeriods((current) => [
        ...current,
        {
          key: `period-${modalShift.weekday}-${Date.now()}`,
          weekday: modalShift.weekday,
          startsAt: modalShift.startsAt,
          endsAt: modalShift.endsAt,
          endsNextDay: modalShift.endsNextDay,
          serviceAreaId: modalShift.serviceAreaId,
        },
      ]);
    }
    setModalShift(null);
  }

  function applyPreset(type: "fulltime" | "weekdays" | "clear") {
    if (areas.length === 0) return;
    if (type === "clear") {
      setPeriods([]);
      return;
    }
    // Every selected area, because Django needs hours for each one before it accepts the
    // application. It used to fill only the first.
    const stamp = Date.now();
    setPeriods(
      presetPeriods(
        type,
        areas.map((area) => area.id),
      ).map((period) => ({
        ...period,
        key: `preset-${period.serviceAreaId}-${period.weekday}-${stamp}`,
      })),
    );
  }

  if (areas.length === 0) {
    return (
      <Text className="rounded-control border border-line bg-surface p-4 text-sm text-text-secondary">
        Choose where you work before publishing hours — your schedule is per area.
      </Text>
    );
  }

  return (
    <View className="flex-col gap-6">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-navy-900">Weekly Schedule</Text>
        <Badge tone={hours > 0 ? "success" : "neutral"} className="font-bold">
          {hours === 0 ? "No hours set" : `${hours} hrs / week`}
        </Badge>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => applyPreset("fulltime")}
          className="min-h-11 items-center justify-center rounded-control border border-line bg-surface px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-navy-900">Mon – Sat (9 AM – 6 PM)</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => applyPreset("weekdays")}
          className="min-h-11 items-center justify-center rounded-control border border-line bg-surface px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-navy-900">Mon – Fri (9 AM – 6 PM)</Text>
        </Pressable>
        {periods.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => applyPreset("clear")}
            className="min-h-11 items-center justify-center rounded-control border border-line bg-surface px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-danger-text">Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-col gap-2.5">
        {WEEKDAYS.map((weekdayLabel, weekday) => {
          const dayPeriods = periods.filter((period) => period.weekday === weekday);
          const dayHours = dayPeriods.reduce((acc, period) => {
            const start = Number(period.startsAt.split(":")[0]) + Number(period.startsAt.split(":")[1]) / 60;
            const end = Number(period.endsAt.split(":")[0]) + Number(period.endsAt.split(":")[1]) / 60;
            return acc + (period.endsNextDay ? 24 - start + end : Math.max(0, end - start));
          }, 0);
          const isActive = dayPeriods.length > 0;

          return (
            <View
              key={weekdayLabel}
              className={
                isActive
                  ? "rounded-control border border-line bg-surface p-3.5"
                  : "rounded-control border border-line bg-surface-sunken p-3.5"
              }
            >
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-row items-center gap-2">
                  <Text className="w-24 text-sm font-bold text-navy-900">{weekdayLabel}</Text>
                  {isActive ? (
                    <Text className="text-xs font-semibold text-success-text">{Math.round(dayHours * 10) / 10} hrs</Text>
                  ) : (
                    <Text className="text-xs text-text-muted">Off Duty</Text>
                  )}
                </View>

                {!isActive ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openNewShiftModal(weekday)}
                    className="min-h-11 flex-row items-center gap-1 rounded-full border border-line bg-surface px-3 py-1"
                  >
                    <Plus size={13} color="#00112e" />
                    <Text className="text-xs font-bold text-navy-800">Set Shift</Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openEditShiftModal(dayPeriods[0]!)}
                      className="min-h-11 flex-row items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1"
                    >
                      <Edit2 size={12} color="#00112e" />
                      <Text className="text-xs font-semibold text-navy-800">Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Clear ${weekdayLabel}`}
                      onPress={() => dayPeriods.forEach((period) => remove(period.key))}
                      className="h-11 w-11 items-center justify-center rounded-full"
                    >
                      <Trash2 size={14} color="#756c5e" />
                    </Pressable>
                  </View>
                )}
              </View>

              {dayPeriods.map((period) => {
                const problem = problems.get(period.key) ?? null;
                return (
                  <View key={period.key} className="mt-2.5 flex-col gap-1 border-t border-line pt-2">
                    <Text className="text-xs font-semibold text-navy-900">
                      {period.startsAt} – {period.endsAt} {period.endsNextDay ? "(Next day)" : ""}
                    </Text>
                    {problem ? (
                      <Text accessibilityRole="alert" className="text-xs font-semibold text-danger-text">
                        ⚠️ {PROBLEM_MESSAGES[problem]}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      <Dialog
        open={modalShift !== null}
        onOpenChange={(open) => {
          if (!open) setModalShift(null);
        }}
        title={modalShift ? `Set Shift: ${modalShift.weekdayLabel}` : "Set Shift"}
        footer={
          <View className="flex-row items-center gap-2.5">
            <Button variant="outline" onPress={() => setModalShift(null)}>
              Cancel
            </Button>
            <Button onPress={saveModalShift}>Save Shift</Button>
          </View>
        }
      >
        {modalShift ? (
          <View className="flex-col gap-4">
            <View className="flex-row items-center gap-2">
              <Clock size={16} color="#c2410c" />
              <Text className="text-base font-bold text-navy-900">Set Shift: {modalShift.weekdayLabel}</Text>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 flex-col gap-1">
                <Text className="text-xs font-bold text-navy-900">Starts At</Text>
                <Input
                  value={modalShift.startsAt}
                  onChangeText={(value) => setModalShift({ ...modalShift, startsAt: value })}
                />
              </View>
              <View className="flex-1 flex-col gap-1">
                <Text className="text-xs font-bold text-navy-900">Ends At</Text>
                <Input
                  value={modalShift.endsAt}
                  onChangeText={(value) => setModalShift({ ...modalShift, endsAt: value })}
                />
              </View>
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-[11px] font-semibold text-text-muted">Preset:</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setModalShift({ ...modalShift, startsAt: "09:00", endsAt: "18:00", endsNextDay: false })
                }
                className="min-h-11 items-center justify-center rounded-full border border-line px-2.5"
              >
                <Text className="text-xs font-semibold">9 AM – 6 PM</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setModalShift({ ...modalShift, startsAt: "10:00", endsAt: "19:00", endsNextDay: false })
                }
                className="min-h-11 items-center justify-center rounded-full border border-line px-2.5"
              >
                <Text className="text-xs font-semibold">10 AM – 7 PM</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: modalShift.endsNextDay }}
              onPress={() => setModalShift({ ...modalShift, endsNextDay: !modalShift.endsNextDay })}
              className="flex-row items-center gap-2"
            >
              <View
                className={
                  modalShift.endsNextDay
                    ? "h-4 w-4 items-center justify-center rounded border border-action bg-action"
                    : "h-4 w-4 rounded border border-line-strong"
                }
              >
                {modalShift.endsNextDay ? <Text className="text-[10px] text-action-text">✓</Text> : null}
              </View>
              <Text className="flex-1 text-xs font-semibold text-text">
                Overnight shift (ends on the next morning)
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Dialog>

    </View>
  );
}
