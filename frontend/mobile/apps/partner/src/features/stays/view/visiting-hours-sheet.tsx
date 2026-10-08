import { Button, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useState, useEffect } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Copy, Plus, Trash2, X } from "lucide-react-native";

import {
  WEEKDAY_NAMES,
  clockText,
  clockWindow,
  dayLabel,
  type StayProperty,
  type VisitSlotInput,
  type VisitSlotRow,
} from "../model";
import { setPartnerVisitingHours } from "../queries";

type SlotRow = { key: string; weekday: number; start: string; end: string };

const hhmm = (value: string) => value.slice(0, 5);
let nextKey = 0;
const newKey = () => `slot-${(nextKey += 1)}`;

/** Same-day slots that overlap, as "Saturday: 10:00 AM – 11:00 AM overlaps 10:30 AM – 11:30 AM." */
export function findOverlap(rows: SlotRow[]): string | null {
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.weekday === cur.weekday && cur.start < prev.end) {
      return `${WEEKDAY_NAMES[cur.weekday]}: ${clockWindow(prev.start, prev.end)} overlaps ${clockWindow(cur.start, cur.end)}.`;
    }
  }
  return null;
}

/** "1 hr", "1 hr 30 min", "45 min". */
function durationText(start: string, end: string): string {
  const [sh = 0, sm = 0] = start.split(":").map(Number);
  const [eh = 0, em = 0] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 15, 30, 45];

function parts(value: string): { hour12: number; minute: number; pm: boolean } {
  const [h = 10, m = 0] = value.split(":").map(Number);
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

function toValue(hour12: number, minute: number, pm: boolean): string {
  const h = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Time Picker popup matching the web quarter-hour / hour selector */
function MobileTimePickerModal({
  open,
  onClose,
  label,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const { hour12, minute, pm } = parts(value || "10:00");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={label}>
      <View className="py-2">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Hour</Text>
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {HOURS.map((h) => {
            const on = h === hour12;
            return (
              <Pressable
                key={h}
                onPress={() => onChange(toValue(h, minute, pm))}
                className={`h-9 w-11 items-center justify-center rounded-lg ${
                  on ? "bg-[#071328]" : "bg-surface-muted"
                }`}
              >
                <Text className={`text-sm font-semibold ${on ? "text-white" : "text-text"}`}>{h}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mt-4 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Minutes
        </Text>
        <View className="mt-2 flex-row gap-2">
          {MINUTES.map((m) => {
            const on = m === minute;
            return (
              <Pressable
                key={m}
                onPress={() => onChange(toValue(hour12, m, pm))}
                className={`flex-1 h-9 items-center justify-center rounded-lg ${
                  on ? "bg-[#071328]" : "bg-surface-muted"
                }`}
              >
                <Text className={`text-sm font-semibold ${on ? "text-white" : "text-text"}`}>
                  :{String(m).padStart(2, "0")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-4 flex-row gap-2 rounded-lg bg-surface-muted p-1">
          {(["AM", "PM"] as const).map((p) => {
            const on = (p === "PM") === pm;
            return (
              <Pressable
                key={p}
                onPress={() => onChange(toValue(hour12, minute, p === "PM"))}
                className={`flex-1 h-8 items-center justify-center rounded-md ${
                  on ? "bg-surface shadow-xs" : ""
                }`}
              >
                <Text className={`text-sm font-bold ${on ? "text-[#071328]" : "text-text-muted"}`}>
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Button variant="primary" onPress={onClose} className="mt-4">
          <Text className="font-bold text-white">Done · {clockText(value || "10:00")}</Text>
        </Button>
      </View>
    </Dialog>
  );
}

export function VisitingHoursSheet({
  open,
  onOpenChange,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: StayProperty | null;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(property?.visits_enabled ?? true);
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [newBlocked, setNewBlocked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Time picker state
  const [pickerTarget, setPickerTarget] = useState<{
    rowKey: string;
    field: "start" | "end";
    label: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    if (property && open) {
      queueMicrotask(() => {
        setEnabled(property.visits_enabled ?? true);
        setRows(
          (property.visit_slots ?? []).map((slot: VisitSlotRow) => ({
            key: slot.id,
            weekday: slot.weekday,
            start: hhmm(slot.start_time),
            end: hhmm(slot.end_time),
          })),
        );
        setBlocked(property.visit_blocked_dates ?? []);
        setError(null);
        setSaved(false);
      });
    }
  }, [property, open]);

  const save = useMutation({
    mutationFn: () => {
      if (!property) throw new Error("Property not found");
      return setPartnerVisitingHours(property.id, {
        visits_enabled: enabled,
        slots: rows.map<VisitSlotInput>((row) => ({
          weekday: row.weekday,
          start_time: row.start,
          end_time: row.end,
        })),
        blocked_dates: blocked,
      });
    },
    onSuccess: () => {
      setSaved(true);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["partner-stay-properties"] });
      void qc.invalidateQueries({ queryKey: ["partner-stays"] });
    },
    onError: (err: any) => setError(err?.message || "Failed to save visiting hours"),
  });

  function change(key: string, patch: Partial<SlotRow>) {
    setSaved(false);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addSlot(weekday: number) {
    setSaved(false);
    const sameDay = rows.filter((row) => row.weekday === weekday).sort((a, b) => a.end.localeCompare(b.end));
    const after = sameDay.at(-1)?.end ?? "10:00";
    const [h = 10, m = 0] = after.split(":").map(Number);
    const endHour = Math.min(h + 1, 23);
    setRows((current) => [
      ...current,
      {
        key: newKey(),
        weekday,
        start: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        end: `${String(endHour).padStart(2, "0")}:${String(endHour === 23 ? 59 : m).padStart(2, "0")}`,
      },
    ]);
  }

  function clearDay(weekday: number) {
    setSaved(false);
    setRows((current) => current.filter((row) => row.weekday !== weekday));
  }

  function copyToAllDays(weekday: number) {
    setSaved(false);
    const template = rows.filter((row) => row.weekday === weekday);
    setRows([
      ...template,
      ...WEEKDAY_NAMES.flatMap((_, day) =>
        day === weekday ? [] : template.map((row) => ({ ...row, key: newKey(), weekday: day })),
      ),
    ]);
  }

  function onSave() {
    const bad = rows.find((row) => !row.start || !row.end || row.end <= row.start);
    if (bad) return setError(`${WEEKDAY_NAMES[bad.weekday]}: each slot must end after it starts.`);
    const overlap = findOverlap(rows);
    if (overlap) return setError(overlap);
    if (enabled && rows.length === 0) return setError("Add at least one visiting slot, or turn visits off.");
    setError(null);
    save.mutate();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Visiting hours"
        description="Guests choose one of these times for “Schedule a visit”. Several guests can pick the same time; you accept or decline each one."
      >
        <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
          <View className="flex-col gap-4 py-2">
            {/* Toggle Visits */}
            <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-muted p-3">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-bold text-text">Allow property visits</Text>
                <Text className="text-xs text-text-muted">Turn off during renovations or holidays</Text>
              </View>
              <Pressable
                onPress={() => {
                  setSaved(false);
                  setEnabled((prev) => !prev);
                }}
                className={`h-8 flex-row items-center gap-1.5 rounded-full px-3 ${
                  enabled ? "bg-emerald-100 border border-emerald-300" : "bg-surface border border-line"
                }`}
              >
                <View className={`size-3 rounded-full ${enabled ? "bg-emerald-600" : "bg-zinc-400"}`} />
                <Text
                  className={`text-xs font-bold ${enabled ? "text-emerald-900" : "text-text-muted"}`}
                >
                  {enabled ? "Visits ON" : "Visits OFF"}
                </Text>
              </Pressable>
            </View>

            {/* Weekdays */}
            <View className="flex-col divide-y divide-line rounded-xl border border-line bg-surface">
              {WEEKDAY_NAMES.map((name, weekday) => {
                const daySlots = rows
                  .filter((row) => row.weekday === weekday)
                  .sort((a, b) => a.start.localeCompare(b.start));
                const isOpen = daySlots.length > 0;

                return (
                  <View key={name} className="flex-col gap-2 p-3">
                    <View className="flex-row items-center justify-between">
                      <Pressable
                        onPress={() => (isOpen ? clearDay(weekday) : addSlot(weekday))}
                        className="flex-row items-center gap-2"
                      >
                        <View
                          className={`size-4 items-center justify-center rounded border ${
                            isOpen ? "border-[#071328] bg-[#071328]" : "border-line bg-surface"
                          }`}
                        >
                          {isOpen ? <Text className="text-[10px] text-white font-bold">✓</Text> : null}
                        </View>
                        <Text className={`text-sm font-bold ${isOpen ? "text-[#071328]" : "text-text-muted"}`}>
                          {name}
                        </Text>
                      </Pressable>

                      {isOpen ? (
                        <View className="flex-row items-center gap-1">
                          <Pressable
                            onPress={() => addSlot(weekday)}
                            className="size-7 items-center justify-center rounded-full bg-surface-muted"
                          >
                            <Plus size={14} color="#071328" />
                          </Pressable>
                          <Pressable
                            onPress={() => copyToAllDays(weekday)}
                            className="size-7 items-center justify-center rounded-full bg-surface-muted"
                          >
                            <Copy size={13} color="#071328" />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>

                    {!isOpen ? (
                      <Text className="text-xs text-text-muted pl-6">Unavailable</Text>
                    ) : (
                      <View className="flex-col gap-2 pl-6 pt-1">
                        {daySlots.map((row) => (
                          <View key={row.key} className="flex-row flex-wrap items-center gap-2">
                            <Pressable
                              onPress={() =>
                                setPickerTarget({
                                  rowKey: row.key,
                                  field: "start",
                                  label: `${name} start time`,
                                  value: row.start,
                                })
                              }
                              className="h-8 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-2.5"
                            >
                              <Clock size={12} color="#71717a" />
                              <Text className="text-xs font-bold text-[#071328]">
                                {clockText(row.start)}
                              </Text>
                            </Pressable>

                            <Text className="text-xs text-text-muted">–</Text>

                            <Pressable
                              onPress={() =>
                                setPickerTarget({
                                  rowKey: row.key,
                                  field: "end",
                                  label: `${name} end time`,
                                  value: row.end,
                                })
                              }
                              className="h-8 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-2.5"
                            >
                              <Clock size={12} color="#71717a" />
                              <Text className="text-xs font-bold text-[#071328]">{clockText(row.end)}</Text>
                            </Pressable>

                            <Text className="text-[11px] text-text-muted">
                              {durationText(row.start, row.end)}
                            </Text>

                            <Pressable
                              onPress={() => {
                                setSaved(false);
                                setRows((current) => current.filter((r) => r.key !== row.key));
                              }}
                              className="size-7 items-center justify-center rounded-full bg-rose-50"
                            >
                              <Trash2 size={13} color="#e11d48" />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Days off */}
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <Text className="text-sm font-bold text-text">Days off</Text>
              <Text className="text-xs text-text-muted">
                No visits on these dates, whatever weekly hours say.
              </Text>

              <View className="flex-row flex-wrap gap-1.5">
                {blocked.map((day) => (
                  <View
                    key={day}
                    className="flex-row items-center gap-1 rounded-full border border-line bg-surface-muted px-2.5 py-1"
                  >
                    <Calendar size={11} color="#71717a" />
                    <Text className="text-xs font-medium text-text">{dayLabel(day)}</Text>
                    <Pressable
                      onPress={() => {
                        setSaved(false);
                        setBlocked((current) => current.filter((d) => d !== day));
                      }}
                    >
                      <X size={12} color="#71717a" />
                    </Pressable>
                  </View>
                ))}
              </View>

              <View className="flex-row items-center gap-2 mt-1">
                <Input
                  value={newBlocked}
                  onChangeText={setNewBlocked}
                  placeholder="YYYY-MM-DD"
                  className="flex-1 h-9 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!newBlocked.trim()}
                  onPress={() => {
                    const clean = newBlocked.trim();
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
                      setError("Enter date in YYYY-MM-DD format (e.g. 2026-10-15).");
                      return;
                    }
                    setSaved(false);
                    setBlocked((current) => [...new Set([...current, clean])].sort());
                    setNewBlocked("");
                    setError(null);
                  }}
                  className="h-9 px-3"
                >
                  <Text className="text-xs font-semibold text-text">Add day off</Text>
                </Button>
              </View>
            </View>

            {error ? <Text className="text-xs text-rose-600">{error}</Text> : null}
            {saved ? <Text className="text-xs text-emerald-600">Visiting hours saved.</Text> : null}

            <Button
              variant="primary"
              onPress={onSave}
              disabled={save.isPending}
              className="mt-2"
            >
              <Text className="font-bold text-white">
                {save.isPending ? "Saving..." : "Save visiting hours"}
              </Text>
            </Button>
          </View>
        </ScrollView>
      </Dialog>

      {/* Sub time picker */}
      {pickerTarget ? (
        <MobileTimePickerModal
          open={Boolean(pickerTarget)}
          onClose={() => setPickerTarget(null)}
          label={pickerTarget.label}
          value={pickerTarget.value}
          onChange={(newVal) => {
            change(pickerTarget.rowKey, { [pickerTarget.field]: newVal });
          }}
        />
      ) : null}
    </>
  );
}
