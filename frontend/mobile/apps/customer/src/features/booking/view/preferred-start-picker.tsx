// Ported from frontend/apps/customer/features/booking/view/preferred-start-picker.tsx
import { Button, EmptyState, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { WindowsView } from "../adapters";

export interface PreferredStartPickerProps {
  windows: WindowsView;
  selectedStart: string | null;
  onSelect: (startsAt: string) => void;
  footnote: string;
}

export function PreferredStartPicker({
  windows,
  selectedStart,
  onSelect,
  footnote,
}: PreferredStartPickerProps) {
  const bookableDays = windows.days.filter((day) =>
    day.windows.some((window) => window.isAvailable),
  );

  const [dayIndex, setDayIndex] = useState<number | null>(() => {
    if (selectedStart) {
      const idx = bookableDays.findIndex((d) =>
        d.windows.some((w) => w.startsAt === selectedStart),
      );
      if (idx !== -1) return idx;
    }
    return bookableDays.length > 0 ? 0 : null;
  });

  if (bookableDays.length === 0) {
    return (
      <EmptyState
        title="No start times are open right now"
        description="Every slot in the next few days is either past or outside working hours for this area. Nothing has been booked."
      />
    );
  }

  const day = dayIndex === null ? null : bookableDays[dayIndex];
  const availableWindows = day === null ? [] : day.windows.filter((window) => window.isAvailable);

  return (
    <View className="gap-4">
      <View>
        <Text className="text-sm font-semibold text-text">Pick a day</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {bookableDays.map((candidate, index) => {
            const isSelected = dayIndex === index;
            return (
              <Button
                key={candidate.label}
                variant={isSelected ? "primary" : "outline"}
                size="sm"
                onPress={() => setDayIndex(index)}
              >
                {candidate.label}
              </Button>
            );
          })}
        </View>
      </View>

      {day === null ? (
        <Text className="mt-2 text-sm text-text-secondary">
          Choose a day to see start times. Nothing is preselected.
        </Text>
      ) : (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-text">
            Pick a start time on {day.label}
          </Text>

          {availableWindows.length === 0 ? (
            <Text className="text-sm text-text-secondary">
              No start times are open on this day.
            </Text>
          ) : (
            <View className="gap-2">
              {availableWindows.map((slot) => {
                const isSelected = selectedStart === slot.startsAt;
                const description = [slot.durationLabel, slot.scarcityLabel].filter(Boolean).join(" · ");
                return (
                  <Pressable
                    key={slot.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.label}${description ? `, ${description}` : ""}`}
                    onPress={() => onSelect(slot.startsAt)}
                    className={`flex-row items-center justify-between rounded-control border p-3 min-h-11 ${
                      isSelected
                        ? "border-action bg-orange-50"
                        : "border-line bg-surface active:bg-surface-hover"
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <View
                        className={`size-4 rounded-full border items-center justify-center ${
                          isSelected ? "border-action bg-action" : "border-line-strong"
                        }`}
                      >
                        {isSelected ? <View className="size-2 rounded-full bg-white" /> : null}
                      </View>
                      <Text className="text-sm font-semibold text-text">
                        {slot.label}
                      </Text>
                    </View>
                    {description ? (
                      <Text className="text-xs text-text-muted">
                        {description}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      <Text className="text-xs leading-5 text-text-muted">{footnote}</Text>
    </View>
  );
}

