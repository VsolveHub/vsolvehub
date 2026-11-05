import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, COLOR_TOKENS, Dialog, Input, Text, useT } from "@vsolve/mobile-ui";
import { Clock, Copy, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import {
  fetchPartnerPickupHours,
  savePartnerPickupHours,
} from "../queries";
import type { PickupHours } from "../model";

const DAY_NAMES = [
  "rentals.day.monday",
  "rentals.day.tuesday",
  "rentals.day.wednesday",
  "rentals.day.thursday",
  "rentals.day.friday",
  "rentals.day.saturday",
  "rentals.day.sunday",
];

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";

export type DayRow = { weekday: number; open: boolean; opensAt: string; closesAt: string };

export function rowsFrom(hours: PickupHours | undefined): DayRow[] {
  return DAY_NAMES.map((_, weekday) => {
    const day = hours?.days?.find((d) => d.weekday === weekday);
    if (!hours?.is_set) {
      return { weekday, open: true, opensAt: DEFAULT_OPEN, closesAt: DEFAULT_CLOSE };
    }
    return {
      weekday,
      open: Boolean(day?.is_open),
      opensAt: day?.opens_at ?? DEFAULT_OPEN,
      closesAt: day?.closes_at ?? DEFAULT_CLOSE,
    };
  });
}

export function rowsProblem(rows: DayRow[], t: ReturnType<typeof useT>): string | null {
  if (!rows.some((r) => r.open)) return t("rentals.hours.errorNoDay");
  const bad = rows.find((r) => r.open && r.closesAt <= r.opensAt);
  return bad ? t("rentals.hours.errorCloseBeforeOpen", { day: t(DAY_NAMES[bad.weekday]!) }) : null;
}

export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function withClosedDate(dates: string[], added: string, today: string): string[] {
  if (!added || added < today) return dates;
  return [...new Set([...dates, added])].sort();
}

export function closedDateLabel(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function PickupHoursCard() {
  const t = useT();
  const qc = useQueryClient();

  const hours = useQuery({
    queryKey: ["partner-rentals", "pickup-hours"],
    queryFn: fetchPartnerPickupHours,
  });

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DayRow[]>(() => rowsFrom(undefined));
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [newClosedDate, setNewClosedDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prevHoursData, setPrevHoursData] = useState<PickupHours | undefined>(undefined);
  const today = todayIso();
  const { height: windowHeight } = useWindowDimensions();
  const maxBodyHeight = Math.max(300, Math.min(windowHeight * 0.58, 480));

  // Adjust state when query finishes loading without useEffect cascading setState
  if (hours.data !== prevHoursData) {
    setPrevHoursData(hours.data);
    if (hours.data) {
      setRows(rowsFrom(hours.data));
      setClosedDates(hours.data.closed_dates ?? []);
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const problem = rowsProblem(rows, t);
      if (problem) throw new Error(problem);
      return savePartnerPickupHours(
        rows
          .filter((r) => r.open)
          .map((r) => ({ weekday: r.weekday, opens_at: r.opensAt, closes_at: r.closesAt })),
        closedDates,
      );
    },
    onSuccess: (data) => {
      qc.setQueryData(["partner-rentals", "pickup-hours"], data);
      void qc.invalidateQueries({ queryKey: ["partner-rental-assets"] });
      void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
      Alert.alert(t("common.success"), t("rentals.hours.saved"));
      setOpen(false);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t("rentals.delivery.actionFailed"));
    },
  });

  const patch = (weekday: number, change: Partial<DayRow>) => {
    setError(null);
    setRows((current) => current.map((r) => (r.weekday === weekday ? { ...r, ...change } : r)));
  };

  const copyToAll = (from: DayRow) => {
    setError(null);
    setRows((current) =>
      current.map((r) => ({ ...r, open: from.open, opensAt: from.opensAt, closesAt: from.closesAt })),
    );
  };

  const isSet = hours.data?.is_set;
  const daysOffCount = closedDates.length;

  return (
    <>
      <View className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-row items-center gap-2">
            <View className="size-8 items-center justify-center rounded-lg bg-primary/10">
              <Clock size={16} color={COLOR_TOKENS.action} />
            </View>
            <View>
              <Text className="text-sm font-bold text-navy-900">{t("rentals.hours.title")}</Text>
              <Text className="text-xs text-text-muted">
                {isSet ? t("rentals.hours.summarySet") : t("rentals.hours.notSet")}
              </Text>
            </View>
          </View>

          <Button variant="outline" size="sm" onPress={() => setOpen(true)} className="h-8 px-3">
            <Text className="text-xs font-semibold text-navy-900">
              {isSet ? t("rentals.hours.edit") : t("rentals.hours.set")}
            </Text>
          </Button>
        </View>

        {isSet ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-2 border-t border-line/60 pt-3">
            {rows
              .filter((r) => r.open)
              .map((r) => (
                <View
                  key={r.weekday}
                  className="rounded-md border border-line bg-surface-muted px-2 py-0.5"
                >
                  <Text className="text-[11px] font-medium text-navy-900">
                    {t(DAY_NAMES[r.weekday]!).slice(0, 3)}: {r.opensAt} - {r.closesAt}
                  </Text>
                </View>
              ))}
            {daysOffCount > 0 ? (
              <View className="rounded-md bg-amber-50 px-2 py-0.5 border border-amber-200">
                <Text className="text-[11px] font-semibold text-amber-800">
                  {t("rentals.hours.daysOff", { count: daysOffCount })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Full Edit Modal */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setError(null);
          setOpen(v);
        }}
        title={t("rentals.hours.title")}
        description={t("rentals.hours.dialogDescription")}
        footer={
          <View className="flex-row items-center justify-end gap-2 w-full">
            <Button
              variant="ghost"
              disabled={save.isPending}
              onPress={() => setOpen(false)}
              className="h-9 px-4"
            >
              <Text className="text-xs font-bold text-text-muted">{t("common.cancel")}</Text>
            </Button>
            <Button
              variant="primary"
              disabled={save.isPending}
              onPress={() => save.mutate()}
              className="h-9 px-4 min-w-[100px] items-center justify-center"
            >
              {save.isPending ? (
                <ActivityIndicator size="small" color={COLOR_TOKENS.white} />
              ) : (
                <Text className="text-xs font-bold text-white">{t("common.save")}</Text>
              )}
            </Button>
          </View>
        }
      >
        <ScrollView
          style={{ maxHeight: maxBodyHeight, flexShrink: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 py-2">
            {/* Days Schedule */}
            <View className="gap-2.5">
              {rows.map((row) => {
                const dayName = t(DAY_NAMES[row.weekday]!);
                return (
                  <View
                    key={row.weekday}
                    className={`rounded-xl border p-3 gap-2.5 ${
                      row.open ? "border-line bg-surface" : "border-line/60 bg-surface-muted opacity-80"
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => patch(row.weekday, { open: !row.open })}
                          className={`h-6 px-2.5 rounded-full items-center justify-center border ${
                            row.open
                              ? "bg-emerald-50 border-emerald-300"
                              : "bg-surface border-line"
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              row.open ? "text-emerald-800" : "text-text-muted"
                            }`}
                          >
                            {row.open ? t("rentals.hours.open") : t("rentals.hours.closed")}
                          </Text>
                        </Pressable>
                        <Text className="text-xs font-bold text-navy-900">{dayName}</Text>
                      </View>

                      {row.open ? (
                        <Pressable
                          onPress={() => copyToAll(row)}
                          className="flex-row items-center gap-1 rounded bg-navy-50 px-2 py-1"
                        >
                          <Copy size={11} color={COLOR_TOKENS.navy} />
                          <Text className="text-[10px] font-semibold text-navy-900">
                            {t("rentals.hours.copyToAll")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    {row.open ? (
                      <View className="flex-row items-center gap-2 pt-1 border-t border-line/60">
                        <View className="flex-1 gap-1">
                          <Text className="text-[10px] text-text-muted">{t("rentals.hours.opensAt")}</Text>
                          <View className="flex-row flex-wrap gap-1">
                            {["08:00", "09:00", "10:00"].map((timeStr) => (
                              <Pressable
                                key={timeStr}
                                onPress={() => patch(row.weekday, { opensAt: timeStr })}
                                className={`rounded px-1.5 py-0.5 border ${
                                  row.opensAt === timeStr ? "bg-navy-900 border-navy-900" : "bg-surface border-line"
                                }`}
                              >
                                <Text
                                  className={`text-[10px] ${
                                    row.opensAt === timeStr ? "font-bold text-white" : "text-navy-900"
                                  }`}
                                >
                                  {timeStr}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <Text className="text-text-muted text-xs font-bold self-end mb-1">→</Text>

                        <View className="flex-1 gap-1">
                          <Text className="text-[10px] text-text-muted">{t("rentals.hours.closesAt")}</Text>
                          <View className="flex-row flex-wrap gap-1">
                            {["18:00", "20:00", "21:00"].map((timeStr) => (
                              <Pressable
                                key={timeStr}
                                onPress={() => patch(row.weekday, { closesAt: timeStr })}
                                className={`rounded px-1.5 py-0.5 border ${
                                  row.closesAt === timeStr ? "bg-navy-900 border-navy-900" : "bg-surface border-line"
                                }`}
                              >
                                <Text
                                  className={`text-[10px] ${
                                    row.closesAt === timeStr ? "font-bold text-white" : "text-navy-900"
                                  }`}
                                >
                                  {timeStr}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Closed Dates / Holidays */}
            <View className="gap-2 rounded-xl border border-line bg-surface-muted p-3">
              <Text className="text-xs font-bold text-navy-900">{t("rentals.hours.daysOffHeading")}</Text>
              <Text className="text-[11px] text-text-muted">{t("rentals.hours.daysOffHelp")}</Text>

              {closedDates.length > 0 ? (
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  {closedDates.map((d) => (
                    <View
                      key={d}
                      className="flex-row items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1"
                    >
                      <Text className="text-xs font-semibold text-navy-900">{closedDateLabel(d)}</Text>
                      <Pressable
                        onPress={() => setClosedDates((prev) => prev.filter((item) => item !== d))}
                        hitSlop={8}
                      >
                        <X size={12} color={COLOR_TOKENS.navy} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View className="flex-row items-center gap-2 pt-2 border-t border-line/60">
                <Input
                  value={newClosedDate}
                  onChangeText={setNewClosedDate}
                  placeholder="YYYY-MM-DD"
                  className="flex-1 h-8 text-xs bg-white"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(newClosedDate)) {
                      setClosedDates((prev) => withClosedDate(prev, newClosedDate, today));
                      setNewClosedDate("");
                    } else {
                      Alert.alert(t("common.error"), t("rentals.hours.dateFormatError"));
                    }
                  }}
                  className="h-8 px-2.5"
                >
                  <Plus size={12} color={COLOR_TOKENS.navy} />
                  <Text className="text-xs font-bold text-navy-900 ml-1">{t("common.add")}</Text>
                </Button>
              </View>
            </View>

            {/* Error Message */}
            {error ? (
              <View className="rounded-lg bg-rose-50 border border-rose-200 p-2.5">
                <Text className="text-xs font-semibold text-rose-700">{error}</Text>
              </View>
            ) : null}

            
          </View>
        </ScrollView>
      </Dialog>
    </>
  );
}
