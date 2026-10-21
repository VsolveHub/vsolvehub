import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Phone,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import {
  formatRate,
  pricePeriodOf,
  visitDayLabel,
  visitWindowLabel,
  type StayProperty,
  type StayUnit,
  type StayVisit,
} from "../model";
import { createStayVisit, fetchVisitSlots } from "../queries";
import { THEME_COLORS } from "../theme-colors";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function StayVisitSheet({
  property,
  initialUnitId,
  open,
  onOpenChange,
}: {
  property: StayProperty;
  initialUnitId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const period = pricePeriodOf(property.price_period);

  const units = (property.units || []) as StayUnit[];
  const [unitId, setUnitId] = useState<string>(
    initialUnitId || (units.length > 0 ? units[0]?.id || "" : ""),
  );

  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<StayVisit | null>(null);

  const slotsQuery = useQuery({
    queryKey: ["stay-visit-slots", property.id],
    queryFn: () => fetchVisitSlots(property.id),
    enabled: Boolean(property.id && open),
  });

  const days: {
    date: string;
    day_name?: string;
    slots: { id: string; start_time: string; end_time: string; label?: string }[];
  }[] = useMemo(() => (slotsQuery.data as any[]) ?? [], [slotsQuery.data]);

  const openDays = useMemo(() => new Set(days.map((row) => row.date)), [days]);
  const activeDay = day ?? days[0]?.date ?? null;
  const chosenDay = days.find((row) => row.date === activeDay) ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      createStayVisit({
        property_id: property.id,
        slot_id: slotId ?? "",
        visit_date: activeDay ?? "",
        unit_id: unitId || null,
        message,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["my-stay-visits"] });
      setRequested(res as StayVisit);
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to schedule visit.");
    },
  });

  const handleClose = () => {
    setRequested(null);
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    setError(null);
    if (!activeDay || !slotId) {
      setError("Pick a day and a visiting time.");
      return;
    }
    mutation.mutate();
  };

  // Calendar setup (Next 14-21 days)
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);
  const todayIsoStr = useMemo(() => isoOf(today), [today]);

  const calendarDays = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const cells = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    return cells;
  }, [today]);

  const monthLabel = today.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
      title={requested ? "Visit Requested" : "Schedule a Visit"}
      description={
        requested
          ? "The host has received your visit request"
          : "Inspect the rooms in person. The host confirms your slot."
      }
    >
      {requested ? (
        <View className="gap-5 py-3">
          <View className="items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 size={40} color={THEME_COLORS.emerald600} />
            <Text className="mt-3 text-base font-extrabold text-emerald-950">
              Visit Requested
            </Text>
            <Text className="mt-1 text-center text-xs leading-relaxed text-emerald-900/90">
              {visitDayLabel(requested.visit_date)},{" "}
              {visitWindowLabel(
                requested.start_time ?? requested.slot?.start_time ?? "",
                requested.end_time ?? requested.slot?.end_time ?? "",
              )}.
            </Text>

            <View className="mt-4 w-full rounded-xl bg-white/80 p-3 border border-emerald-200/60">
              <View className="flex-row items-center gap-2">
                <Phone size={14} color={THEME_COLORS.emerald600} />
                <Text className="text-xs font-bold text-emerald-950">
                  Confirmation Details
                </Text>
              </View>
              <Text className="mt-1 text-[11px] leading-relaxed text-emerald-900/80">
                The owner will review your visiting slot. Once accepted, you will
                receive a notification and the owner&apos;s phone number will become
                available in My Visits.
              </Text>
            </View>
          </View>

          <Button
            size="lg"
            variant="primary"
            onPress={() => {
              handleClose();
              router.push("/stays/mine?tab=visits" as never);
            }}
            className="w-full rounded-xl py-3.5"
          >
            See My Visits →
          </Button>
        </View>
      ) : (
        <ScrollView
          className="max-h-[80vh] gap-4 py-2"
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
              <AlertCircle size={16} color={THEME_COLORS.red600} />
              <Text className="flex-1 text-xs font-medium text-danger">{error}</Text>
            </View>
          ) : null}

          {slotsQuery.isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={THEME_COLORS.navy900} />
              <Text className="mt-2 text-xs text-text-secondary">
                Loading available visiting slots…
              </Text>
            </View>
          ) : days.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-line bg-surface-sunken p-4">
              <Text className="text-xs leading-relaxed text-text-secondary">
                The host has no visiting slots listed for the next two weeks. You can send
                an enquiry instead and discuss visit times over the phone.
              </Text>
            </View>
          ) : (
            <>
              {/* Optional Room Selector */}
              {units.length > 1 ? (
                <View className="gap-2">
                  <Text className="text-xs font-bold text-navy-900">
                    Interested Room (optional)
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Pressable
                      onPress={() => setUnitId("")}
                      className={`rounded-full px-3 py-1.5 border ${
                        unitId === ""
                          ? "border-navy-900 bg-navy-900"
                          : "border-line bg-surface"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          unitId === "" ? "text-white" : "text-text-secondary"
                        }`}
                      >
                        Any room
                      </Text>
                    </Pressable>
                    {units.map((u) => {
                      const isSelected = unitId === u.id;
                      return (
                        <Pressable
                          key={u.id}
                          onPress={() => setUnitId(u.id)}
                          className={`rounded-full px-3 py-1.5 border ${
                            isSelected
                              ? "border-brand bg-brand"
                              : "border-line bg-surface"
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              isSelected ? "text-white" : "text-text-secondary"
                            }`}
                          >
                            {u.name} · {formatRate(u.nightly_rate_paise, period)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* 2-Week Calendar */}
              <View className="gap-2 rounded-2xl border border-line bg-surface p-3.5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <CalendarClock size={14} color={THEME_COLORS.muted} />
                    <Text className="text-xs font-bold text-navy-900">Pick a day</Text>
                  </View>
                  <Text className="text-[11px] font-semibold text-text-muted">
                    {monthLabel}
                  </Text>
                </View>

                {/* Week Day Header */}
                <View className="flex-row justify-between py-1">
                  {WEEK.map((w, idx) => (
                    <Text
                      key={idx}
                      className="w-9 text-center text-[10px] font-bold text-text-muted"
                    >
                      {w}
                    </Text>
                  ))}
                </View>

                {/* Calendar Cells Grid */}
                <View className="flex-row flex-wrap justify-between">
                  {calendarDays.map((d) => {
                    const iso = isoOf(d);
                    const isOpen = openDays.has(iso);
                    const isSelected = activeDay === iso;
                    const isToday = iso === todayIsoStr;

                    return (
                      <Pressable
                        key={iso}
                        disabled={!isOpen}
                        onPress={() => {
                          setDay(iso);
                          setSlotId(null);
                          setError(null);
                        }}
                        className={`my-1 size-9 items-center justify-center rounded-full ${
                          isSelected
                            ? "bg-brand shadow-xs"
                            : isOpen
                              ? "bg-surface active:bg-brand/10 border border-line"
                              : "opacity-25"
                        } ${isToday && !isSelected ? "border-2 border-brand/50" : ""}`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected
                              ? "text-white"
                              : isOpen
                                ? "text-navy-900"
                                : "text-text-muted"
                          }`}
                        >
                          {d.getDate()}
                        </Text>
                        {isOpen && !isSelected ? (
                          <View className="absolute bottom-1 size-1 rounded-full bg-brand" />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <View className="flex-row items-center gap-1.5 pt-1">
                  <View className="size-1.5 rounded-full bg-brand" />
                  <Text className="text-[10px] text-text-secondary">
                    Host offers visiting times on dotted days
                  </Text>
                </View>
              </View>

              {/* Time Slots for Selected Day */}
              {chosenDay ? (
                <View className="gap-2">
                  <Text className="text-xs font-bold text-navy-900">
                    Pick a time ·{" "}
                    <Text className="text-text-secondary">
                      {visitDayLabel(chosenDay.date)}
                    </Text>
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {chosenDay.slots.map((slot) => {
                      const isSelected = slotId === slot.id;
                      return (
                        <Pressable
                          key={slot.id}
                          onPress={() => {
                            setSlotId(slot.id);
                            setError(null);
                          }}
                          className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-2.5 ${
                            isSelected
                              ? "border-brand bg-brand/10"
                              : "border-line bg-surface active:bg-surface-hover"
                          }`}
                        >
                          <Clock
                            size={12}
                            color={isSelected ? THEME_COLORS.actionDark : THEME_COLORS.muted}
                          />
                          <Text
                            className={`text-xs font-bold ${
                              isSelected ? "text-brand" : "text-navy-900"
                            }`}
                          >
                            {visitWindowLabel(slot.start_time, slot.end_time)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Message to Host */}
              <View className="gap-1.5">
                <Text className="text-xs font-bold text-navy-900">
                  Message to Host (optional)
                </Text>
                <TextInput
                  placeholder="e.g. Coming with a colleague around 5 PM."
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  value={message}
                  onChangeText={setMessage}
                  className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
                />
              </View>

              {/* Submit Button */}
              <Button
                size="lg"
                variant="primary"
                disabled={mutation.isPending || !activeDay || !slotId}
                onPress={handleSubmit}
                className="mt-2 w-full rounded-xl py-3.5"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color={THEME_COLORS.white} size="small" />
                ) : (
                  "Request Visit"
                )}
              </Button>
            </>
          )}
        </ScrollView>
      )}
    </Dialog>
  );
}
