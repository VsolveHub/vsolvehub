"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { getServiceConfig } from "@/lib/catalog/service-config";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import type { CartItem } from "@/lib/cart/types";

const TIME_SLOTS = ["08–10 AM", "10–12 PM", "12–02 PM", "02–04 PM", "04–06 PM", "06–08 PM"];

function nextDays(count: number) {
  const out: { key: string; day: string; date: string }[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      key: d.toISOString().slice(0, 10),
      day: i === 0 ? "Today" : days[d.getDay()]!,
      date: `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`,
    });
  }
  return out;
}

type Props = {
  open: boolean;
  items: CartItem[];
  onClose: () => void;
  onSuccess: () => void;
  scheduledMap: Record<string, string>;
  setScheduledMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

export function BookSlotModal({ open, items, onClose, onSuccess, scheduledMap, setScheduledMap }: Props) {
  const queryClient = useQueryClient();
  
  // Track which item is currently expanded for scheduling
  const [expandedItemId, setExpandedItemId] = useState<string>("");
  const [scheduleType, setScheduleType] = useState<"instant" | "scheduled">("scheduled");
  const [dateKey, setDateKey] = useState(() => nextDays(1)[0]!.key);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[2]!);
  const [error, setError] = useState("");

  // Load catalog to get service durations
  const { data: catalogData } = useQuery({ 
    queryKey: ["catalog"], 
    queryFn: api.catalog, 
    staleTime: 5 * 60_000 
  });
  const catalogServices = catalogData?.services ?? [];

  const days = useMemo(() => nextDays(7), []);

  const activeItem = useMemo(() => {
    return items.find((it) => it.id === expandedItemId) ?? null;
  }, [items, expandedItemId]);

  const serviceConfig = useMemo(() => {
    if (!activeItem) return null;
    return getServiceConfig(activeItem.categorySlug, undefined, activeItem.serviceSlug);
  }, [activeItem]);

  const supportsInstant = useMemo(() => {
    return serviceConfig?.bookingTypes?.includes("instant") ?? false;
  }, [serviceConfig]);

  function buildSlotIso(): string {
    if (scheduleType === "instant") {
      return new Date(Date.now() + 45 * 60 * 1000).toISOString();
    }
    const startHour = 8 + TIME_SLOTS.indexOf(timeSlot) * 2;
    const d = new Date(`${dateKey}T00:00:00`);
    d.setHours(startHour, 0, 0, 0);
    return d.toISOString();
  }

  const updateSlotMutation = useMutation({
    mutationFn: (input: { id: string; slot: string; scheduleType: "instant" | "scheduled" }) =>
      api.updateCartItem(input.id, { slot: input.slot, scheduleType: input.scheduleType }),
    onSuccess: (_, variables) => {
      const formatted =
        variables.scheduleType === "instant"
          ? "Instant (Within 1 hour)"
          : `${new Date(variables.slot).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}`;
      
      setScheduledMap((prev) => ({ ...prev, [variables.id]: formatted }));
      queryClient.invalidateQueries({ queryKey: qk.cart() });
      setExpandedItemId(""); // Collapse the row on success
      setError("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not book slot"),
  });

  if (!open) return null;

  const allScheduled = items.every((it) => scheduledMap[it.id]);

  const handleConfirmSlot = (itemId: string) => {
    setError("");
    const slotIso = buildSlotIso();
    updateSlotMutation.mutate({
      id: itemId,
      slot: slotIso,
      scheduleType,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Select slots</h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Services List with Expandable Slots */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
              {error}
            </div>
          )}

          {items.map((it) => {
            const isExpanded = it.id === expandedItemId;
            const scheduledText = scheduledMap[it.id];
            
            // Find service details from catalog for duration
            const catalogSvc = catalogServices.find((s) => s.id === it.serviceId || s.slug === it.serviceSlug);
            const durationMin = catalogSvc ? catalogSvc.duration / 60 : 60;
            const durationText = durationMin >= 60 
              ? `Service will take approx. ${Math.floor(durationMin / 60)} hrs ${durationMin % 60 > 0 ? `& ${durationMin % 60} mins` : ""}`
              : `Service will take approx. ${durationMin} mins`;

            return (
              <div 
                key={it.id} 
                className={`rounded-2xl border transition-all duration-350 overflow-hidden ${
                  isExpanded ? "border-brand ring-1 ring-brand/30 shadow-md" : "border-gray-100 bg-white"
                }`}
              >
                {/* Accordion Trigger Row */}
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-gray-900 truncate">
                      {it.serviceName}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {durationText}
                    </p>
                    {scheduledText && !isExpanded && (
                      <p className="text-xs text-green-700 font-bold mt-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-600 shrink-0" />
                        {scheduledText}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedItemId("");
                      } else {
                        setExpandedItemId(it.id);
                        const config = getServiceConfig(it.categorySlug, undefined, it.serviceSlug);
                        setScheduleType(config.bookingTypes?.includes("instant") ? "instant" : "scheduled");
                      }
                    }}
                    className={`px-4 py-2 text-xs font-black rounded-xl border transition-all ${
                      scheduledText
                        ? "border-gray-200 text-gray-700 hover:bg-gray-50"
                        : "border-brand text-brand hover:bg-brand-light"
                    }`}
                  >
                    {scheduledText ? "Reschedule" : "Select"}
                  </button>
                </div>

                {/* Inline Expansion Area */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/30 animate-in fade-in duration-200">
                    {/* Instant vs Scheduled selector */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {supportsInstant && (
                        <button
                          onClick={() => setScheduleType("instant")}
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                            scheduleType === "instant" ? "border-brand bg-blue-50/50 shadow-sm" : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg ${scheduleType === "instant" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>
                            <FlaticonIcon name="bolt" size={12} />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-gray-900">Instant</p>
                            <p className="text-[9px] text-gray-400 mt-0.5">30-60m arrival</p>
                          </div>
                        </button>
                      )}
                      
                      <button
                        onClick={() => setScheduleType("scheduled")}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                          scheduleType === "scheduled" ? "border-brand bg-blue-50/50 shadow-sm" : "border-gray-200 bg-white"
                        } ${!supportsInstant ? "col-span-2" : ""}`}
                      >
                        <div className={`p-1.5 rounded-lg ${scheduleType === "scheduled" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>
                          <FlaticonIcon name="calendar" size={12} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-gray-900">Scheduled</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">Pick date/time</p>
                        </div>
                      </button>
                    </div>

                    {/* Calendar and Time picker */}
                    {scheduleType === "scheduled" && (
                      <div className="space-y-3 mb-4">
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                          {days.map((d) => (
                            <button
                              key={d.key}
                              onClick={() => setDateKey(d.key)}
                              className={`flex-shrink-0 w-14 rounded-xl border py-1.5 text-center transition-all snap-start ${
                                dateKey === d.key
                                  ? "bg-brand border-brand text-white font-bold"
                                  : "border-gray-200 text-gray-600 bg-white hover:bg-gray-50"
                              }`}
                            >
                              <span className="block text-[8px] font-black uppercase opacity-85">{d.day}</span>
                              <span className="block text-[11px] font-extrabold mt-0.5">{d.date.split(" ")[0]}</span>
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {TIME_SLOTS.map((slot) => (
                            <button
                              key={slot}
                              onClick={() => setTimeSlot(slot)}
                              className={`rounded-xl border py-1.5 text-[9px] font-bold transition-all ${
                                timeSlot === slot
                                  ? "bg-blue-50 border-brand text-brand"
                                  : "border-gray-200 text-gray-600 bg-white hover:bg-gray-50"
                              }`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-1">
                      <span className="text-xs text-gray-500">
                        Confirming slot for {formatPrice(it.quotedAmount)}
                      </span>
                      <button
                        onClick={() => handleConfirmSlot(it.id)}
                        disabled={updateSlotMutation.isPending}
                        className="px-5 py-2 bg-brand text-white text-xs font-black rounded-xl transition-all shadow-md shadow-brand/10 disabled:opacity-50"
                      >
                        {updateSlotMutation.isPending && updateSlotMutation.variables?.id === it.id 
                          ? "Saving..." 
                          : "Save Slot"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Footer Confirm Button */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={() => {
              if (allScheduled) {
                onSuccess();
                onClose();
              }
            }}
            disabled={!allScheduled}
            className={`w-full py-4 rounded-2xl text-sm font-black transition-all shadow-lg ${
              allScheduled
                ? "bg-brand text-white shadow-brand/10 hover:opacity-95 cursor-pointer"
                : "bg-gray-150 text-gray-400 shadow-none cursor-not-allowed border border-gray-200"
            }`}
          >
            Confirm
          </button>
        </div>

      </div>
    </div>
  );
}
