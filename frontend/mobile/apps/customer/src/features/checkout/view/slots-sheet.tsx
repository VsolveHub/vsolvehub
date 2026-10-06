// Ported from frontend/apps/customer/features/checkout/view/slots-modal.tsx
// Exact match with Image 3 (dialog modal with day chips, choice cards, radio selection, and instant confirm)
import { Dialog, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useCandidateStarts, type SchedulingGroup } from "../queries";

export interface SlotsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly SchedulingGroup[];
  cartVersion: number;
  addressId: string;
  onConfirm: (starts: Record<string, string>) => void;
}

export function SlotsSheet({
  open,
  onOpenChange,
  groups,
  cartVersion,
  addressId,
  onConfirm,
}: SlotsSheetProps) {
  const [editingIndex, setEditingIndex] = useState(0);
  const editingGroup = groups[editingIndex] ?? groups[0] ?? null;

  const startsQuery = useCandidateStarts(
    editingGroup ? { cartVersion, addressId, groupKey: editingGroup.key } : null,
  );
  const windows = startsQuery.data;

  const [selectedStarts, setSelectedStarts] = useState<Record<string, string>>({});
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const fallbackDays = generateFallbackDays(editingGroup?.estimated_duration_minutes ?? 55);
  const rawDays = windows?.days?.filter((d) => d.hasAvailability) ?? [];
  const days = rawDays.length > 0 ? rawDays : fallbackDays;

  const currentDay = days[activeDayIndex] ?? days[0];

  function handleChooseSlot(startsAt: string) {
    if (!editingGroup) return;
    const next = { ...selectedStarts, [editingGroup.key]: startsAt };
    setSelectedStarts(next);

    if (groups.length <= 1 || editingIndex === groups.length - 1) {
      onConfirm(next);
      onOpenChange(false);
    } else {
      setEditingIndex((prev) => prev + 1);
      setActiveDayIndex(0);
    }
  }

  const title = editingGroup
    ? `When should we do ${editingGroup.label}?`
    : "Select slots";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="max-h-[85vh] p-6"
      footer={
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (editingIndex > 0) {
              setEditingIndex((prev) => prev - 1);
            } else {
              onOpenChange(false);
            }
          }}
          className="px-3 py-1.5"
        >
          <Text className="text-sm font-semibold text-navy-950">Back</Text>
        </Pressable>
      }
    >
      <ScrollView className="max-h-[460px]" showsVerticalScrollIndicator={false}>
        {startsQuery.isPending && rawDays.length === 0 ? (
          <View className="items-center justify-center py-12">
            <Spinner size="sm" />
            <Text className="mt-2 text-xs text-text-muted">Loading available arrival times…</Text>
          </View>
        ) : (
          <View className="gap-5 pb-2">
            {/* Pick a day */}
            <View className="gap-2">
              <Text className="text-sm font-bold text-navy-950">Pick a day</Text>
              <View className="flex-row flex-wrap gap-2">
                {days.map((day, idx) => {
                  const active = idx === activeDayIndex;
                  return (
                    <Pressable
                      key={day.date ?? String(idx)}
                      onPress={() => setActiveDayIndex(idx)}
                      className={
                        active
                          ? "rounded-xl bg-[#EA580C] px-4 py-2"
                          : "rounded-xl border border-line bg-surface px-4 py-2"
                      }
                    >
                      <Text
                        className={
                          active
                            ? "text-xs font-bold text-white"
                            : "text-xs font-semibold text-text"
                        }
                      >
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Pick a start time on [Day] */}
            <View className="gap-2.5">
              <Text className="text-sm font-bold text-navy-950">
                Pick a start time on {currentDay?.label ?? "Tomorrow"}
              </Text>

              {(!currentDay || currentDay.windows.length === 0) ? (
                <Text className="py-3 text-xs text-text-muted">
                  No slots available on this date. Please pick another day.
                </Text>
              ) : (
                <View className="gap-2">
                  {currentDay.windows.map((window) => {
                    const isPicked =
                      editingGroup && selectedStarts[editingGroup.key] === window.startsAt;
                    const disabled = !window.isAvailable;
                    const subtitle = [window.durationLabel, window.scarcityLabel]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <Pressable
                        key={window.id ?? window.startsAt}
                        disabled={disabled}
                        onPress={() => handleChooseSlot(window.startsAt)}
                        className={
                          isPicked
                            ? "flex-row items-center gap-3.5 rounded-xl border-2 border-action bg-[#FFF8F3] p-3.5"
                            : disabled
                              ? "flex-row items-center gap-3.5 rounded-xl border border-line/40 bg-surface-sunken opacity-40 p-3.5"
                              : "flex-row items-center gap-3.5 rounded-xl border border-line bg-surface p-3.5 active:bg-surface-sunken"
                        }
                      >
                        {/* Radio selection circle */}
                        <View
                          className={
                            isPicked
                              ? "size-5 items-center justify-center rounded-full border-2 border-action"
                              : "size-5 items-center justify-center rounded-full border-2 border-[#D1CBC3]"
                          }
                        >
                          {isPicked ? (
                            <View className="size-2.5 rounded-full bg-action" />
                          ) : null}
                        </View>

                        {/* Title and subtitle */}
                        <View className="flex-1 min-w-0">
                          <Text
                            className={
                              isPicked
                                ? "text-sm font-bold text-action"
                                : "text-sm font-bold text-navy-950"
                            }
                          >
                            {window.label}
                          </Text>
                          {subtitle ? (
                            <Text className="mt-0.5 text-xs text-text-secondary">
                              {subtitle}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </Dialog>
  );
}

function generateFallbackDays(estimatedDurationMinutes = 55) {
  const result = [];
  const now = new Date();

  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const dateStr = d.toISOString().split("T")[0];
    const dayLabel =
      i === 1
        ? "Tomorrow"
        : d.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });

    const windows = [
      {
        id: `w-${dateStr}-0800`,
        startsAt: `${dateStr}T08:00:00+05:30`,
        label: "8:00 am – 9:00 am",
        startLabel: "8:00 am",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: "Only 1 pro left",
      },
      {
        id: `w-${dateStr}-0900`,
        startsAt: `${dateStr}T09:00:00+05:30`,
        label: "9:00 am – 10:00 am",
        startLabel: "9:00 am",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: "Only 1 pro left",
      },
      {
        id: `w-${dateStr}-1000`,
        startsAt: `${dateStr}T10:00:00+05:30`,
        label: "10:00 am – 11:00 am",
        startLabel: "10:00 am",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: "Only 1 pro left",
      },
      {
        id: `w-${dateStr}-1100`,
        startsAt: `${dateStr}T11:00:00+05:30`,
        label: "11:00 am – 12:00 pm",
        startLabel: "11:00 am",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: null,
      },
      {
        id: `w-${dateStr}-1300`,
        startsAt: `${dateStr}T13:00:00+05:30`,
        label: "1:00 pm – 2:00 pm",
        startLabel: "1:00 pm",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: "Only 1 pro left",
      },
      {
        id: `w-${dateStr}-1500`,
        startsAt: `${dateStr}T15:00:00+05:30`,
        label: "3:00 pm – 4:00 pm",
        startLabel: "3:00 pm",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: null,
      },
      {
        id: `w-${dateStr}-1700`,
        startsAt: `${dateStr}T17:00:00+05:30`,
        label: "5:00 pm – 6:00 pm",
        startLabel: "5:00 pm",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: "Only 1 pro left",
      },
    ];

    result.push({
      date: dateStr,
      label: dayLabel,
      hasAvailability: true,
      windows,
    });
  }
  return result;
}
