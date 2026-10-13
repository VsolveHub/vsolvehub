import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Button, Text, TouchDatePicker, TouchTimePicker } from "@vsolve/mobile-ui";
import { Calendar, Clock, MapPin, Phone, Video, X } from "lucide-react-native";

import { INTERVIEW_MODES, type InterviewMode } from "../jobs-queries";

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface InterviewDialogProps {
  open: boolean;
  candidateName: string;
  defaultLocation?: string;
  isPending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (body: {
    scheduled_date: string;
    start_time: string;
    mode: InterviewMode;
    location_text: string;
    note: string;
  }) => void;
}

export function InterviewDialog({
  open,
  candidateName,
  defaultLocation = "",
  isPending,
  error,
  onClose,
  onSubmit,
}: InterviewDialogProps) {
  const [day, setDay] = useState(tomorrowIso());
  const [time, setTime] = useState("11:00");
  const [mode, setMode] = useState<InterviewMode>("IN_PERSON");
  const [place, setPlace] = useState(defaultLocation);
  const [note, setNote] = useState("");

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setDay(tomorrowIso());
    setTime("11:00");
    setMode("IN_PERSON");
    setPlace(defaultLocation);
    setNote("");
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end bg-black/60"
      >
        <View className="max-h-[90%] rounded-t-3xl bg-surface p-5">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-line pb-3.5">
            <View className="flex-1 pr-2">
              <Text className="text-base font-extrabold text-navy-900">
                Interview {candidateName}
              </Text>
              <Text className="text-xs text-text-muted">
                Candidate can accept, decline, or request another time
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="size-8 items-center justify-center rounded-full bg-surface-muted"
            >
              <X size={18} color="#00112e" />
            </Pressable>
          </View>

          {/* Form Controls */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 14, gap: 14 }}
          >
            {/* Date and Time Row */}
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Text className="text-xs font-semibold text-text-muted">Interview Date</Text>
                <Pressable
                  onPress={() => setDatePickerOpen(true)}
                  className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <Text className="text-sm font-semibold text-navy-900">{day}</Text>
                  <Calendar size={16} color="#64748b" />
                </Pressable>
              </View>

              <View className="flex-1 gap-1.5">
                <Text className="text-xs font-semibold text-text-muted">Start Time</Text>
                <Pressable
                  onPress={() => setTimePickerOpen(true)}
                  className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <Text className="text-sm font-semibold text-navy-900">{time}</Text>
                  <Clock size={16} color="#64748b" />
                </Pressable>
              </View>
            </View>

            {/* Mode Selector */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-text-muted">Interview Mode</Text>
              <View className="flex-row flex-wrap gap-2">
                {INTERVIEW_MODES.map((m) => {
                  const on = mode === m.value;
                  return (
                    <Pressable
                      key={m.value}
                      onPress={() => setMode(m.value)}
                      className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${
                        on ? "border-navy-900 bg-navy-900" : "border-line bg-surface"
                      }`}
                    >
                      {m.value === "IN_PERSON" ? (
                        <MapPin size={13} color={on ? "#ffffff" : "#64748b"} />
                      ) : m.value === "PHONE" ? (
                        <Phone size={13} color={on ? "#ffffff" : "#64748b"} />
                      ) : (
                        <Video size={13} color={on ? "#ffffff" : "#64748b"} />
                      )}
                      <Text
                        className={`text-xs font-semibold ${
                          on ? "text-white" : "text-text"
                        }`}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Place / Location when In Person */}
            {mode === "IN_PERSON" ? (
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-text-muted">Where / Location</Text>
                <TextInput
                  placeholder="Office address or branch location"
                  placeholderTextColor="#94a3b8"
                  maxLength={240}
                  value={place}
                  onChangeText={setPlace}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
                />
              </View>
            ) : null}

            {/* Note for candidate */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-text-muted">
                Note for candidate (optional)
              </Text>
              <TextInput
                multiline
                numberOfLines={3}
                placeholder="e.g. Please bring your original certificates and resume."
                placeholderTextColor="#94a3b8"
                maxLength={480}
                value={note}
                onChangeText={setNote}
                className="rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-text"
              />
            </View>

            {/* Error Message */}
            {error ? (
              <View className="rounded-xl border border-red-200 bg-red-50 p-2.5">
                <Text className="text-xs text-red-700">{error}</Text>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View className="mt-2 flex-row gap-2">
              <Button
                variant="secondary"
                size="md"
                onPress={onClose}
                disabled={isPending}
                className="px-4"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                loading={isPending}
                onPress={() =>
                  onSubmit({
                    scheduled_date: day,
                    start_time: time,
                    mode,
                    location_text: mode === "IN_PERSON" ? place : "",
                    note,
                  })
                }
              >
                Send Invitation
              </Button>
            </View>
          </ScrollView>

          {/* Date Picker Modal */}
          <TouchDatePicker
            open={datePickerOpen}
            onOpenChange={setDatePickerOpen}
            value={day}
            onChange={(selectedDate) => setDay(selectedDate)}
            title="Select Interview Date"
            minDate={tomorrowIso()}
          />

          {/* Time Picker Modal */}
          <TouchTimePicker
            open={timePickerOpen}
            onOpenChange={setTimePickerOpen}
            value={time}
            onChange={(selectedTime) => setTime(selectedTime)}
            title="Select Interview Time"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
