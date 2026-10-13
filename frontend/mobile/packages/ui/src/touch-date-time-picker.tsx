import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { Button } from "./button";
import { Text } from "./text";

export interface TouchDatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  title?: string;
  minDate?: string;
  disabledDates?: (dateString: string) => boolean;
}

export function TouchDatePicker({
  open,
  onOpenChange,
  value,
  onChange,
  title = "Select Date",
  minDate,
  disabledDates,
}: TouchDatePickerProps) {
  // Generate dates for next 30 days
  const today = new Date();
  const dates: Array<{ dateString: string; label: string; sublabel: string; disabled: boolean }> = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const dayNum = String(d.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${dayNum}`;
    if (minDate && dateString < minDate) continue;

    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    const day = d.getDate();
    const monthName = d.toLocaleDateString("en-US", { month: "short" });
    const isDisabled = disabledDates ? disabledDates(dateString) : false;

    dates.push({
      dateString,
      label: `${weekday}, ${monthName} ${day}`,
      sublabel: isDisabled ? "Booked / Unavailable" : i === 0 ? "Today" : i === 1 ? "Tomorrow" : "",
      disabled: isDisabled,
    });
  }

  const [selected, setSelected] = useState(value || dates.find((d) => !d.disabled)?.dateString || dates[0]?.dateString || "");

  useEffect(() => {
    if (value) {
      setSelected(value);
    }
  }, [value, open]);

  const handleConfirm = () => {
    onChange(selected);
    onOpenChange(false);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl border-t border-line bg-surface p-5 pb-8 shadow-2xl">
          <View className="flex-row items-center justify-between pb-3 border-b border-line">
            <Text className="text-base font-bold text-text">{title}</Text>
            <Pressable accessibilityRole="button" onPress={() => onOpenChange(false)}>
              <Text className="text-xs font-semibold text-text-muted">Cancel</Text>
            </Pressable>
          </View>

          <ScrollView className="max-h-72 my-3" showsVerticalScrollIndicator={false}>
            <View className="gap-2">
              {dates.map((item) => {
                const isSelected = selected === item.dateString;
                return (
                  <Pressable
                    key={item.dateString}
                    accessibilityRole="button"
                    disabled={item.disabled}
                    onPress={() => setSelected(item.dateString)}
                    className={`flex-row items-center justify-between rounded-xl border p-3.5 ${
                      item.disabled
                        ? "border-line/40 bg-surface-muted/50 opacity-40"
                        : isSelected
                        ? "border-brand bg-brand/10"
                        : "border-line bg-canvas"
                    }`}
                  >
                    <View>
                      <Text
                        className={`text-sm ${
                          item.disabled
                            ? "font-medium text-text-muted"
                            : isSelected
                            ? "font-bold text-brand"
                            : "font-semibold text-text"
                        }`}
                      >
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text
                          className={`text-[11px] font-medium mt-0.5 ${
                            item.disabled ? "text-danger-text" : "text-text-muted"
                          }`}
                        >
                          {item.sublabel}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Text className="text-sm font-black text-brand">✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Button variant="primary" size="lg" onPress={handleConfirm} className="w-full">
            Confirm Date
          </Button>
        </View>
      </View>
    </Modal>
  );
}

export interface TouchTimePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: string; // HH:MM
  onChange: (value: string) => void;
  title?: string;
}

export function TouchTimePicker({
  open,
  onOpenChange,
  value,
  onChange,
  title = "Select Time Slot",
}: TouchTimePickerProps) {
  // Preset 30-min time slots from 08:00 to 20:00
  const slots: string[] = [];
  for (let hour = 8; hour <= 20; hour++) {
    const hh = String(hour).padStart(2, "0");
    slots.push(`${hh}:00`);
    if (hour !== 20) slots.push(`${hh}:30`);
  }

  const [selected, setSelected] = useState(value || "10:00");

  useEffect(() => {
    if (value) {
      setSelected(value);
    }
  }, [value, open]);

  const formatSlot = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    const period = (h || 0) >= 12 ? "PM" : "AM";
    const hour12 = (h || 0) % 12 || 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  };

  const handleConfirm = () => {
    onChange(selected);
    onOpenChange(false);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl border-t border-line bg-surface p-5 pb-8 shadow-2xl">
          <View className="flex-row items-center justify-between pb-3 border-b border-line">
            <Text className="text-base font-bold text-text">{title}</Text>
            <Pressable accessibilityRole="button" onPress={() => onOpenChange(false)}>
              <Text className="text-xs font-semibold text-text-muted">Cancel</Text>
            </Pressable>
          </View>

          <ScrollView className="max-h-72 my-3" showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap gap-2 justify-between">
              {slots.map((slot) => {
                const isSelected = selected === slot;
                return (
                  <Pressable
                    key={slot}
                    accessibilityRole="button"
                    onPress={() => setSelected(slot)}
                    className={`w-[48%] items-center justify-center rounded-xl border py-3 ${
                      isSelected
                        ? "border-brand bg-brand/10"
                        : "border-line bg-canvas"
                    }`}
                  >
                    <Text className={`text-xs ${isSelected ? "font-bold text-brand" : "font-semibold text-text"}`}>
                      {formatSlot(slot)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Button variant="primary" size="lg" onPress={handleConfirm} className="w-full">
            Confirm Time
          </Button>
        </View>
      </View>
    </Modal>
  );
}
