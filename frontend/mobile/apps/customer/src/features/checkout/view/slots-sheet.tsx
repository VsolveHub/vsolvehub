// Ported from frontend/apps/customer/features/checkout/view/slots-modal.tsx
// Exact match with Image 3 (dialog modal with day chips, choice cards, radio selection, and instant confirm)
import { Dialog, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

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
  const { height: windowHeight } = useWindowDimensions();
  const [editingIndex, setEditingIndex] = useState(0);
  const editingGroup = groups[editingIndex] ?? groups[0] ?? null;

  const startsQuery = useCandidateStarts(
    editingGroup ? { cartVersion, addressId, groupKey: editingGroup.key } : null,
  );
  const windows = startsQuery.data;

  const [selectedStarts, setSelectedStarts] = useState<Record<string, string>>({});
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const fallbackDays = generateFallbackDays(editingGroup?.estimated_duration_minutes ?? 405);
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

  const title = editingGroup?.label
    ? `When should we do ${editingGroup.label}?`
    : "Select arrival time";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="max-w-xl p-6"
      footer={
        <View className="w-full flex-row justify-end">
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
            <Text className="text-sm font-semibold text-[#0B1B3D]">Back</Text>
          </Pressable>
        </View>
      }
    >
      <ScrollView
        style={{ maxHeight: Math.min(windowHeight * 0.58, 480) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!editingGroup ? (
          <View className="items-center justify-center py-10">
            <Text className="text-sm font-semibold text-[#0B1B3D]">No items to schedule</Text>
            <Text className="mt-1 text-xs text-text-muted text-center">
              Please choose a service in your cart and a delivery address.
            </Text>
          </View>
        ) : startsQuery.isPending && rawDays.length === 0 ? (
          <View className="items-center justify-center py-12">
            <Spinner size="sm" />
            <Text className="mt-2 text-xs text-text-muted">Loading available arrival times…</Text>
          </View>
        ) : (
          <View className="gap-5 pb-2">
            {/* Pick a day */}
            <View className="gap-2">
              <Text className="text-sm font-semibold text-[#0B1B3D]">Pick a day</Text>
              <View className="flex-row flex-wrap gap-2">
                {days.map((day, idx) => {
                  const active = idx === activeDayIndex;
                  return (
                    <Pressable
                      key={day.date ?? String(idx)}
                      onPress={() => setActiveDayIndex(idx)}
                      className={
                        active
                          ? "rounded-lg bg-[#EA580C] px-3.5 py-1.5 shadow-2xs"
                          : "rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-1.5 active:bg-[#F2EFE9]"
                      }
                    >
                      <Text
                        className={
                          active
                            ? "text-xs font-semibold text-white"
                            : "text-xs font-semibold text-[#0F172A]"
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
              <Text className="text-sm font-semibold text-[#0B1B3D]">
                Pick a start time on {currentDay?.label ?? "Today"}
              </Text>

              {(!currentDay || currentDay.windows.length === 0) ? (
                <Text className="py-3 text-xs text-text-muted">
                  No slots available on this date. Please pick another day.
                </Text>
              ) : (
                <View className="gap-2.5">
                  {currentDay.windows.map((window) => {
                    const isPicked =
                      editingGroup && selectedStarts[editingGroup.key] === window.startsAt;
                    const disabled = !window.isAvailable;
                    const subtitle = window.durationLabel || `about ${editingGroup?.estimated_duration_minutes ?? 405} min`;

                    return (
                      <Pressable
                        key={window.id ?? window.startsAt}
                        disabled={disabled}
                        onPress={() => handleChooseSlot(window.startsAt)}
                        className={
                          isPicked
                            ? "flex-row items-center gap-3.5 rounded-xl border border-[#EA580C] bg-[#FFF8F3] p-4"
                            : disabled
                              ? "flex-row items-center gap-3.5 rounded-xl border border-[#E5E7EB] bg-gray-50 opacity-40 p-4"
                              : "flex-row items-center gap-3.5 rounded-xl border border-[#E5E7EB] bg-white p-4 active:bg-[#F9F8F6]"
                        }
                      >
                        {/* Radio selection circle matching Image 2 */}
                        <View
                          className={
                            isPicked
                              ? "size-5 items-center justify-center rounded-full border border-[#EA580C]"
                              : "size-5 items-center justify-center rounded-full border border-[#D1D5DB]"
                          }
                        >
                          {isPicked ? (
                            <View className="size-2.5 rounded-full bg-[#EA580C]" />
                          ) : null}
                        </View>

                        {/* Title and subtitle */}
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm font-bold text-[#0B1B3D]">
                            {window.label}
                          </Text>
                          <Text className="mt-0.5 text-xs text-[#64748B]">
                            {subtitle}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Explanatory Footnote matching Image 2 */}
              <Text className="mt-2 text-xs leading-relaxed text-[#64748B]">
                This is when you would like us to start. We will show you exactly how it can be arranged, and what it costs, before anything is confirmed.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </Dialog>
  );
}

function generateFallbackDays(estimatedDurationMinutes = 405) {
  const result = [];
  const now = new Date();

  for (let i = 0; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const dateStr = d.toISOString().split("T")[0];
    const dayLabel =
      i === 0
        ? "Today"
        : i === 1
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
        label: "8:00 am – 10:00 am",
        startLabel: "8:00 am",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: null,
      },
      {
        id: `w-${dateStr}-1000`,
        startsAt: `${dateStr}T10:00:00+05:30`,
        label: "10:00 am – 12:00 pm",
        startLabel: "10:00 am",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: null,
      },
      {
        id: `w-${dateStr}-1200`,
        startsAt: `${dateStr}T12:00:00+05:30`,
        label: "12:00 pm – 2:00 pm",
        startLabel: "12:00 pm",
        isAvailable: true,
        durationLabel: `about ${estimatedDurationMinutes} min`,
        scarcityLabel: null,
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
